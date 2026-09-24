// This pure function also runs in Apps Script. Keep this file free of imports.
function parseNotification(body, messageId, receivedTime) {
  const start = body.indexOf('LIFE_OS_RESULT_BEGIN');
  const end = body.indexOf('LIFE_OS_RESULT_END', start + 20);
  if (start < 0 || end < 0) throw new Error('No complete result block; email may be link-only or truncated');
  const r = JSON.parse(body.slice(start + 'LIFE_OS_RESULT_BEGIN'.length, end).trim());
  if (!r || typeof r !== 'object' || typeof r.requires_attention !== 'boolean' || typeof r.summary !== 'string' || !r.summary.trim()) throw new Error('Invalid result block');
  return Object.assign({}, r, { external_id: 'gmail:' + messageId, source: 'ChatGPT notification via Gmail', received_time: receivedTime });
}
if (typeof module !== 'undefined') module.exports = { parseNotification };
