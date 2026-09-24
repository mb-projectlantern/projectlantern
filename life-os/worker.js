import { page, script, styles } from './ui.js';
import { githubResult } from './github.js';

const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
};
const reply = (data, status = 200, extra = {}) => new Response(
  typeof data === 'string' ? data : JSON.stringify(data),
  { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', ...extra } }
);
async function equal(a, b) {
  const digest = async x => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(x)));
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let mismatch = 0;
  for (let i = 0; i < x.length; i++) mismatch |= x[i] ^ y[i];
  return mismatch === 0;
}
function text(value, name, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid ' + name);
  return value.trim();
}
export function validate(input) {
  if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('Expected object');
  const result = {};
  for (const [name, max] of Object.entries({ external_id: 250, task_name: 160, task_type: 40, subject: 80, status: 40, summary: 2000, details: 20000, source: 100 })) {
    result[name] = text(input[name], name, max);
  }
  if (typeof input.requires_attention !== 'boolean') throw new Error('requires_attention must be boolean');
  result.requires_attention = input.requires_attention;
  if (typeof input.execution_time !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(input.execution_time) || !Number.isFinite(Date.parse(input.execution_time))) throw new Error('Invalid execution_time');
  result.execution_time = new Date(input.execution_time).toISOString();
  return result;
}
export async function readBody(request, limit = 32768) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Error('Expected application/json');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Expected body');
  const chunks = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new Error('Body too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
export default {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    const path = new URL(request.url).pathname;
    if (path !== '/life-os' && !path.startsWith('/life-os/')) return reply({ error: 'Not found' }, 404);
    if (!env.DB || !env.DASHBOARD_USER || (env.DASHBOARD_PASSWORD?.length ?? 0) < 24 || (env.INGEST_TOKEN?.length ?? 0) < 32) return reply({ error: 'Server not configured' }, 503);
    if (path === '/life-os/api/github' && request.method === 'POST') {
      try {
        const result = await githubResult(request, env);
        if (!result) return reply({ status: 'ignored' }, 202);
        const response = await this.fetch(new Request(new URL('/life-os/api/results', request.url), {
          method: 'POST', headers: { Authorization: 'Bearer ' + env.INGEST_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(result)
        }), env);
        console.log(JSON.stringify({ request_id: requestId, stage: 'github', status: response.status, delivery: request.headers.get('X-GitHub-Delivery') }));
        return response;
      } catch (error) {
        const status = error.status || 400;
        console.warn(JSON.stringify({ request_id: requestId, stage: 'github', status }));
        return reply({ error: error.message, request_id: requestId }, status);
      }
    }
    const write = request.method === 'POST' && ['/life-os/api/results', '/life-os/api/bridge-status'].includes(path);
    const auth = request.headers.get('Authorization') || '';
    let authorized = false;
    if (write) authorized = await equal(auth, 'Bearer ' + env.INGEST_TOKEN);
    else if (auth.startsWith('Basic ')) {
      try { authorized = await equal(atob(auth.slice(6)), env.DASHBOARD_USER + ':' + env.DASHBOARD_PASSWORD); } catch { /* invalid credentials */ }
    }
    if (!authorized) return reply({ error: 'Unauthorized' }, 401, write ? {} : { 'WWW-Authenticate': 'Basic realm="Life OS", charset="UTF-8"' });
    try {
      if (write) {
        let input;
        try {
          input = JSON.parse(new TextDecoder().decode(await readBody(request)));
          if (path.endsWith('/results')) input = validate(input);
          else {
            input = { state: text(input.state, 'state', 40), external_id: typeof input.external_id === 'string' ? input.external_id.slice(0,250) : '', message: text(input.message, 'message', 500) };
          }
        } catch (error) {
          console.warn(JSON.stringify({ request_id: requestId, stage: 'validation', status: 'rejected' }));
          return reply({ error: error.message, request_id: requestId }, 400);
        }
        const received = new Date().toISOString();
        if (path.endsWith('/bridge-status')) {
          await env.DB.prepare('INSERT INTO bridge_status VALUES (1, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET checked_time=excluded.checked_time,state=excluded.state,external_id=excluded.external_id,message=excluded.message')
            .bind(received, input.state, input.external_id, input.message).run();
          return reply({ status: 'recorded', request_id: requestId });
        }
        const id = crypto.randomUUID();
        const r = input;
        const stored = await env.DB.prepare('INSERT INTO results (id,external_id,task_name,task_type,subject,status,requires_attention,summary,details,source,execution_time,received_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(external_id) DO NOTHING')
          .bind(id, r.external_id, r.task_name, r.task_type, r.subject, r.status, Number(r.requires_attention), r.summary, r.details, r.source, r.execution_time, received).run();
        const row = await env.DB.prepare('SELECT id FROM results WHERE external_id=?').bind(r.external_id).first();
        console.log(JSON.stringify({ request_id: requestId, stage: 'storage', status: stored.meta.changes ? 'stored' : 'duplicate', id: row.id, source: r.source, received_time: received }));
        return reply({ id: row.id, status: stored.meta.changes ? 'stored' : 'duplicate', request_id: requestId }, stored.meta.changes ? 201 : 200);
      }
      if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405);
      if (path === '/life-os' || path === '/life-os/') return reply(page, 200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (path === '/life-os/app.js') return reply(script, 200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      if (path === '/life-os/style.css') return reply(styles, 200, { 'Content-Type': 'text/css; charset=utf-8' });
      if (path === '/life-os/api/results') {
        const { results } = await env.DB.prepare('SELECT * FROM results ORDER BY execution_time DESC, received_time DESC LIMIT 100').all();
        const bridge = await env.DB.prepare('SELECT * FROM bridge_status WHERE id=1').first();
        return reply({ results: results.map(r => ({ ...r, requires_attention: Boolean(r.requires_attention) })), bridge });
      }
      return reply({ error: 'Not found' }, 404);
    } catch {
      console.error(JSON.stringify({ request_id: requestId, stage: 'storage', status: 'failed' }));
      return reply({ error: 'Storage unavailable', request_id: requestId }, 503);
    }
  }
};
