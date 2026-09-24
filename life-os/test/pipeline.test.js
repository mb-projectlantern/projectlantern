import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { createHmac } from 'node:crypto';
import worker, { validate } from '../worker.js';
import { synthetic } from '../synthetic.js';
import { script } from '../ui.js';
import { database } from './database.js';

const settings = { DASHBOARD_USER: 'test', DASHBOARD_PASSWORD: 'test-only-password-long-enough', INGEST_TOKEN: 'test-only-ingestion-token-32-characters', GITHUB_WEBHOOK_SECRET: 'test-only-webhook-secret-32-characters', GITHUB_REPOSITORY_ID: '1385602767', GITHUB_ACTOR: 'mb-projectlantern' };
const basic = 'Basic ' + Buffer.from(settings.DASHBOARD_USER + ':' + settings.DASHBOARD_PASSWORD).toString('base64');
test('ISO timestamps from PowerShell normalize without rejecting sub-millisecond precision', () => {
  assert.equal(validate({...synthetic(), execution_time:'2026-09-24T14:03:00.1234567Z'}).execution_time, '2026-09-24T14:03:00.123Z');
});
function request(path, method = 'GET', body, auth = basic) {
  return new Request('https://test.invalid/life-os/' + path, { method, headers: { Authorization: auth, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
test('authenticated synthetic ingestion persists, deduplicates, orders, and feeds actual UI code', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'life-os-'));
  let env = { ...settings, DB: database(join(dir, 'results.sqlite')) };
  try {
    const r = synthetic();
    const send = () => worker.fetch(request('api/results', 'POST', r, 'Bearer ' + settings.INGEST_TOKEN), env);
    assert.equal((await send()).status, 201);
    assert.equal((await send()).status, 200);
    env.DB.sqlite.close();
    env = { ...settings, DB: database(join(dir, 'results.sqlite')) };
    const old = { ...synthetic(), requires_attention: false, execution_time: '2020-01-01T00:00:00Z' };
    assert.equal((await worker.fetch(request('api/results', 'POST', old, 'Bearer ' + settings.INGEST_TOKEN), env)).status, 201);
    const response = await worker.fetch(request('api/results'), env);
    const data = await response.json();
    assert.equal(data.results.length, 2);
    assert.equal(data.results[0].external_id, r.external_id);
    assert.equal(data.results[0].requires_attention, true);
    assert.equal(data.results[0].processing_status, 'stored');
    const page = await worker.fetch(request(''), env);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /LIFE OS — POC/);
    assert.equal(page.headers.get('Cache-Control'), 'no-store');
    // Exercise actual rendering and polling JS with a minimal DOM surface.
    function node(tag) { return { tag, children: [], textContent: '', disabled: false, append(...v) { this.children.push(...v); }, replaceChildren(...v) { this.children=v; }, get firstChild() { return this.children[0]; }, addEventListener() {} }; }
    const elements = Object.fromEntries(['#results','#connection','#refresh','#bridge'].map(id => [id,node('div')]));
    let interval;
    const malicious = '<img src=x onerror=alert(1)>';
    data.results[0].details = malicious;
    vm.runInNewContext(script, { document: { querySelector: s => elements[s], createElement: node }, fetch: async () => ({ ok:true, json:async()=>data }), Date, AbortSignal, setInterval: (fn, ms) => { interval = ms; } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(interval, 30000);
    assert.equal(elements['#results'].children[0].className, 'attention');
    assert.equal(elements['#results'].children[1].className, 'normal');
    assert.equal(elements['#results'].children[0].children[3].children[1].textContent, malicious);
    assert.match(elements['#connection'].textContent, /Connected/);
  } finally { env.DB.sqlite.close(); rmSync(dir, { recursive: true }); }
});
test('all dashboard assets and reads are protected; write credential cannot read, browser credential cannot write', async () => {
  const env = { ...settings, DB: database() };
  try {
    for (const path of ['', 'app.js', 'style.css', 'api/results']) assert.equal((await worker.fetch(request(path,'GET',undefined,''),env)).status,401);
    assert.equal((await worker.fetch(request('api/results','GET',undefined,'Bearer '+settings.INGEST_TOKEN),env)).status,401);
    assert.equal((await worker.fetch(request('api/results','POST',synthetic()),env)).status,401);
    assert.equal((await worker.fetch(request(''),{...env,DASHBOARD_PASSWORD:''})).status,503);
  } finally { env.DB.sqlite.close(); }
});
test('invalid input, oversized bodies, and unavailable storage are observable failures', async () => {
  const env = { ...settings, DB: database() };
  try {
    for (const changes of [{requires_attention:'true'},{execution_time:'tomorrow'},{summary:''},{details:'x'.repeat(40000)}]) {
      assert.equal((await worker.fetch(request('api/results','POST',{...synthetic(),...changes},'Bearer '+settings.INGEST_TOKEN),env)).status,400);
    }
    const response = await worker.fetch(request('api/results'), {...env,DB:{prepare(){throw Error('private database detail');}}});
    assert.equal(response.status,503);
    const result=await response.json();
    assert.ok(result.request_id);
    assert.doesNotMatch(JSON.stringify(result),/private database detail/);
  } finally { env.DB.sqlite.close(); }
});
function webhook(payload, event='issues', signature) {
  const body=JSON.stringify(payload);
  return new Request('https://test.invalid/life-os/api/github',{method:'POST',headers:{'Content-Type':'application/json','X-GitHub-Event':event,'X-GitHub-Delivery':'test-delivery','X-Hub-Signature-256':signature || 'sha256='+createHmac('sha256',settings.GITHUB_WEBHOOK_SECRET).update(body).digest('hex')},body});
}
test('signed private GitHub issue flows to storage; replay deduplicates and untrusted origins fail', async () => {
  const env={...settings,DB:database()};
  const payload={repository:{id:1385602767,private:true},sender:{login:'mb-projectlantern'},action:'opened',issue:{number:1,title:'[life-os] synthetic',user:{login:'mb-projectlantern'},body:JSON.stringify(synthetic())}};
  try {
    assert.equal((await worker.fetch(webhook(payload),env)).status,201);
    assert.equal((await worker.fetch(webhook(payload),env)).status,200);
    assert.equal((await worker.fetch(webhook(payload,'issues','sha256='+'0'.repeat(64)),env)).status,401);
    assert.equal((await worker.fetch(webhook({...payload,repository:{id:1385602767,private:false}}),env)).status,403);
    assert.equal((await worker.fetch(webhook({...payload,sender:{login:'stranger'}}),env)).status,403);
    assert.equal((await worker.fetch(webhook({...payload,action:'edited'}),env)).status,202);
    const {results}=await (await worker.fetch(request('api/results'),env)).json();
    assert.equal(results[0].external_id,'github:1385602767:1');
  } finally { env.DB.sqlite.close(); }
});
test('email fallback accepts complete structured output, rejects link-only/truncated email', () => {
  const context={module:{exports:{}}};
  vm.runInNewContext(readFileSync(new URL('../bridge/email-parser.js',import.meta.url),'utf8'),context);
  const parse=context.module.exports.parseNotification;
  assert.throws(()=>parse('View your result at https://chatgpt.com/', '1', ''),/No complete/);
  assert.throws(()=>parse('LIFE_OS_RESULT_BEGIN {"summary":"cut off', '1', ''),/No complete/);
  const value=parse('Header\nLIFE_OS_RESULT_BEGIN\n'+JSON.stringify(synthetic())+'\nLIFE_OS_RESULT_END\nFooter','1','2026-09-24T12:00:00Z');
  assert.equal(value.external_id,'gmail:1');
  assert.equal(value.source,'ChatGPT notification via Gmail');
});
