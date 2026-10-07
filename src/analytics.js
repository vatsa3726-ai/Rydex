const SESSION_KEY = 'rydexAnalyticsSession'

function getSessionKey() {
  try {
    let key = sessionStorage.getItem(SESSION_KEY)
    if (!key) {
      key = crypto.randomUUID ? crypto.randomUUID() : `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`
      sessionStorage.setItem(SESSION_KEY, key)
    }
    return key
  } catch {
    return `sess-${Date.now()}`
  }
}

export function trackAnalytics(apiUrl, eventType, payload = {}) {
  const body = {
    eventType,
    sessionKey: getSessionKey(),
    ...payload,
  }
  return fetch(`${apiUrl}/analytics/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {})
}
