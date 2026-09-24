export function synthetic() {
  return {
    external_id: 'synthetic:' + crypto.randomUUID(),
    task_name: 'Life OS Integration Test', task_type: 'monitor', subject: 'AMZN',
    status: 'TEST', requires_attention: true,
    summary: 'Synthetic test result. If this appears, the Life OS ingestion and display pipeline is operational.',
    details: 'Synthetic data only. This does not establish interactive or scheduled ChatGPT integration.',
    source: 'TEST DATA', execution_time: new Date().toISOString()
  };
}
if (process.argv[1] && import.meta.url === new URL('file:///' + process.argv[1].replaceAll('\\', '/')).href) {
  const base = process.env.LIFE_OS_URL;
  if (!base || !process.env.INGEST_TOKEN) throw new Error('Set LIFE_OS_URL and INGEST_TOKEN in your shell');
  const url = new URL('/life-os/api/results', base);
  if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') throw new Error('HTTPS required');
  const response = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.INGEST_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(synthetic()), redirect: 'error' });
  console.log(response.status, await response.text());
  if (!response.ok) process.exitCode = 1;
}
