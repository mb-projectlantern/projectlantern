// Optional fallback. Copy email-parser.js into this Apps Script project too.
// Configure Script Properties; never paste credentials into this source file.
function pollLifeOsMail() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const p = PropertiesService.getScriptProperties();
    const base = p.getProperty('LIFE_OS_URL');
    const token = p.getProperty('INGEST_TOKEN');
    const sender = p.getProperty('EXPECTED_SENDER');
    const labelName = p.getProperty('SOURCE_LABEL');
    if (!/^https:\/\/[^/]+$/.test(base || '') || !token || !sender || !labelName) throw new Error('Configure bridge properties');
    const label = GmailApp.getUserLabelByName(labelName);
    if (!label) throw new Error('Create a dedicated source label and exact task-email filter');
    function post(path, value) {
      const res = UrlFetchApp.fetch(base + '/life-os/api/' + path, { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + token }, payload: JSON.stringify(value), muteHttpExceptions: true, followRedirects: false });
      if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) throw new Error('Life OS HTTP ' + res.getResponseCode());
    }
    let count = 0; let failed = false;
    // Five-day experiment only: newest 50 labeled threads, 7-day lookback.
    // Server deduplication makes rescanning safe; threads are not marked processed.
    for (const thread of label.getThreads(0,50)) {
      for (const message of thread.getMessages()) {
        if (message.getDate().getTime() < Date.now() - 7*86400000) continue;
        const from = message.getFrom().match(/<([^>]+)>/)?.[1] || message.getFrom();
        if (from.toLowerCase() !== sender.toLowerCase()) continue;
        if (!message.getSubject().includes('LIFEOS-AMZN-POC')) continue;
        // Gmail's authentication result must establish a passing aligned DMARC domain.
        const auth = message.getHeader('Authentication-Results');
        const domain = sender.split('@')[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!new RegExp('^mx\\.google\\.com;[\\s\\S]*dmarc=pass[^;]*header\\.from=' + domain + '(?:[;\\s]|$)', 'i').test(auth)) {
          failed = true; console.warn('Rejected sender authentication for ' + message.getId()); continue;
        }
        try {
          post('results', parseNotification(message.getPlainBody(), message.getId(), message.getDate().toISOString()));
          count++;
        } catch (error) {
          failed = true;
          console.warn(JSON.stringify({ stage: 'email_bridge', external_id: message.getId(), error: error.message }));
        }
      }
    }
    post('bridge-status', { state: failed ? 'error' : 'ok', message: failed ? 'One or more emails failed authentication, parsing, or ingestion; inspect Apps Script executions.' : 'Checked source mailbox; accepted ' + count + ' messages including duplicates.', external_id: '' });
  } finally { lock.releaseLock(); }
}
