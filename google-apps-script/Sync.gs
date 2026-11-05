/** Standalone owner-run script. Keep this separate from the reference form. */
function trackerSettings_() {
  var properties = PropertiesService.getScriptProperties();
  var url = properties.getProperty('TRACKER_WORKER_URL');
  var secret = properties.getProperty('TRACKER_WORKER_SECRET');
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1\/sheets-worker$/.test(url || '') ||
      !secret || secret.length < 32) {
    throw new Error('Set TRACKER_WORKER_URL and a strong TRACKER_WORKER_SECRET in Script Properties.');
  }
  return { url: url, secret: secret };
}

function trackerCall_(action) {
  var settings = trackerSettings_();
  var response = UrlFetchApp.fetch(settings.url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-worker-secret': settings.secret },
    payload: JSON.stringify({ action: action, access_token: ScriptApp.getOAuthToken() }),
    muteHttpExceptions: true,
    followRedirects: false
  });
  if (response.getResponseCode() !== 200) {
    // Do not log tokens, employee data or upstream response bodies.
    throw new Error('Tracker sync failed (' + response.getResponseCode() + '). Review Sheets sync status and Apps Script setup.');
  }
  var result = JSON.parse(response.getContentText());
  if (action === 'connect' && result.connected !== true ||
      action === 'sync' && result.synced !== true && result.idle !== true) {
    throw new Error('Tracker did not confirm synchronization.');
  }
  return result;
}

/** Run manually after reviewing Script Properties; authorizes and binds this owner. */
function setupTrackerSync() {
  var lock = LockService.getScriptLock();
  lock.waitLock(1000);
  try {
    trackerCall_('connect');
    var existing = ScriptApp.getProjectTriggers().filter(function(trigger) {
      return trigger.getHandlerFunction() === 'syncTracker';
    });
    if (!existing.length) {
      ScriptApp.newTrigger('syncTracker').timeBased().everyMinutes(5).create();
    }
    existing.slice(1).forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });
  } finally {
    lock.releaseLock();
  }
}

/** One request only. The database worker controls leases, retries and backoff. */
function syncTracker() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    trackerCall_('sync');
  } finally {
    lock.releaseLock();
  }
}

function stopTrackerSync() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'syncTracker') ScriptApp.deleteTrigger(trigger);
  });
}
