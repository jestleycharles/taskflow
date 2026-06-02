/**
 * fetch wrapper for Render free tier: service returns plain "Not Found" while waking.
 * Retries transient failures so users are not kicked to login or see parse errors.
 */
const WAKE_RETRY_DELAYS_MS = [2000, 4000, 8000];

function isServiceWaking(status, bodyText) {
  if ([502, 503, 504].includes(status)) return true;
  return status === 404 && bodyText.trim() === 'Not Found';
}

async function apiFetch(url, options = {}) {
  const opts = { credentials: 'same-origin', ...options };
  let lastResponse = null;
  let lastBody = '';

  for (let attempt = 0; attempt <= WAKE_RETRY_DELAYS_MS.length; attempt++) {
    let response;
    try {
      response = await fetch(url, opts);
    } catch (err) {
      if (attempt >= WAKE_RETRY_DELAYS_MS.length) throw err;
      await new Promise((r) => setTimeout(r, WAKE_RETRY_DELAYS_MS[attempt]));
      continue;
    }

    const body = await response.text();
    if (response.ok) {
      return new Response(body, { status: response.status, headers: response.headers });
    }

    lastResponse = response;
    lastBody = body;

    if (!isServiceWaking(response.status, body) || attempt >= WAKE_RETRY_DELAYS_MS.length) {
      break;
    }

    await new Promise((r) => setTimeout(r, WAKE_RETRY_DELAYS_MS[attempt]));
  }

  return new Response(lastBody, {
    status: lastResponse.status,
    statusText: lastResponse.statusText,
    headers: lastResponse.headers,
  });
}

async function parseJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    const msg = text.trim() === 'Not Found'
      ? 'Server is starting up — please wait a moment and try again.'
      : 'Unexpected server response. Please try again.';
    return { error: msg };
  }
}
