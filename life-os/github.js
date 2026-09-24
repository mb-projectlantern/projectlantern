import { readBody } from './worker.js';

function fail(message, status) { throw Object.assign(new Error(message), { status }); }

export async function githubResult(request, env) {
  if ((env.GITHUB_WEBHOOK_SECRET?.length ?? 0) < 32 || !env.GITHUB_REPOSITORY_ID || !env.GITHUB_ACTOR) fail('GitHub bridge not configured', 503);
  const signature = request.headers.get('X-Hub-Signature-256') || '';
  if (!/^sha256=[a-f0-9]{64}$/.test(signature)) fail('Invalid webhook signature', 401);
  const bytes = await readBody(request, 131072);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.GITHUB_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const digest = Uint8Array.from(signature.slice(7).match(/../g), x => parseInt(x,16));
  if (!await crypto.subtle.verify('HMAC', key, digest, bytes)) fail('Invalid webhook signature', 401);
  const payload = JSON.parse(new TextDecoder().decode(bytes));
  if (String(payload.repository?.id) !== env.GITHUB_REPOSITORY_ID || payload.repository?.private !== true) fail('Expected configured private repository', 403);
  if (request.headers.get('X-GitHub-Event') === 'ping') return null;
  if (request.headers.get('X-GitHub-Event') !== 'issues' || payload.action !== 'opened') return null;
  if (payload.sender?.login !== env.GITHUB_ACTOR || payload.issue?.user?.login !== env.GITHUB_ACTOR) fail('Unexpected issue author', 403);
  if (!payload.issue?.title?.startsWith('[life-os]')) return null;
  const body = payload.issue.body || '';
  // Deliberately require a single JSON object. No markdown execution or remote URL fetching.
  const input = JSON.parse(body);
  return { ...input, external_id: 'github:' + payload.repository.id + ':' + payload.issue.number, source: input.source === 'TEST DATA' ? 'TEST DATA' : 'GitHub issue (ChatGPT origin unverified)' };
}
