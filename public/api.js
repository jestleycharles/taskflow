/**
 * fetch wrapper for Render free tier: service returns plain "Not Found" while waking.
 * Retries transient failures so users are not kicked to login or see parse errors.
 */
const WAKE_RETRY_DELAYS_MS = [2000, 4000, 8000];

function isServiceWaking(status, bodyText) {
  const body = bodyText.trim();
  if (status === 404 && body === 'Not Found') return true;
  if ([503, 504].includes(status)) return true;
  if (status === 502) {
    if (!body || body === 'Not Found') return true;
    if (/bad gateway|service is currently unavailable/i.test(body)) return false;
    return true;
  }
  return false;
}

function parseJsonBody(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isUnauthorizedUpdateError(status, bodyText) {
  if (status !== 401) return false;
  const data = parseJsonBody(bodyText);
  return String(data?.error || '').toLowerCase() === 'unauthorized';
}

let updateRequiredShown = false;

function showUpdateRequiredModal() {
  if (updateRequiredShown) return;
  updateRequiredShown = true;

  let modal = document.getElementById('updateRequiredModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'updateRequiredModal';
    modal.className = 'fixed inset-0 z-[80] flex items-center justify-center px-4';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'updateRequiredTitle');
    modal.innerHTML = `
      <div class="absolute inset-0 bg-black/60" style="backdrop-filter: blur(6px);"></div>
      <div class="relative bg-[#1a1d2e] border border-white/15 rounded-2xl p-6 w-full max-w-md shadow-2xl" style="font-family: 'DM Sans', sans-serif;">
        <h2 id="updateRequiredTitle" class="text-base font-semibold text-white mb-2">Update available</h2>
        <p class="text-sm text-gray-400 leading-relaxed mb-6">A new version of TaskFlow is available. Refresh the page to load the latest update and continue.</p>
        <button type="button" id="updateRequiredRefreshBtn"
          class="w-full bg-[#4f6ef7] hover:bg-[#3a57e8] text-white font-medium py-2.5 rounded-xl transition text-sm">
          Refresh page
        </button>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#updateRequiredRefreshBtn').addEventListener('click', () => {
      window.location.reload();
    });
  }
  modal.classList.remove('hidden');
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

  if (isUnauthorizedUpdateError(lastResponse.status, lastBody)) {
    showUpdateRequiredModal();
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

function isApiUnauthorizedUpdate(response, data) {
  return response.status === 401
    && String(data?.error || '').toLowerCase() === 'unauthorized';
}

/** Shimmer rows for conversation lists (direct messages). */
function conversationListSkeletonHtml(count = 5) {
  const row = `<div class="flex items-center gap-3 p-3 rounded-xl border border-transparent">
    <div class="skeleton w-10 h-10 rounded-full shrink-0"></div>
    <div class="flex-1 min-w-0 space-y-2">
      <div class="skeleton h-3 w-2/5 rounded"></div>
      <div class="skeleton h-2.5 w-full rounded"></div>
    </div>
  </div>`;
  return `<div class="space-y-2">${Array(count).fill(row).join('')}</div>`;
}

const messageSendInFlight = new Set();

/**
 * Prevents duplicate message sends while a POST is in flight (per `key`).
 * Clears the input immediately so rapid Enter/clicks cannot resend the same text.
 * Restores the input if `send` returns false or throws.
 * @returns {Promise<boolean>} whether a send was attempted and completed successfully
 */
async function submitMessageOnce(key, { getContent, send, inputEl, sendBtnEl }) {
  if (messageSendInFlight.has(key)) return false;
  const content = getContent();
  if (!content) return false;

  messageSendInFlight.add(key);
  const input = inputEl || null;
  const btn = sendBtnEl || null;
  if (input) {
    input.dataset.sendGuardSnapshot = input.value;
    input.value = '';
    input.disabled = true;
  }
  if (btn) btn.disabled = true;

  let ok = false;
  try {
    ok = !!(await send(content));
  } catch (err) {
    if (input && !input.value) input.value = input.dataset.sendGuardSnapshot || '';
    throw err;
  } finally {
    messageSendInFlight.delete(key);
    if (!ok && input && !input.value) input.value = input.dataset.sendGuardSnapshot || '';
    if (input) {
      delete input.dataset.sendGuardSnapshot;
      input.disabled = false;
    }
    if (btn) btn.disabled = false;
  }
  return ok;
}

/** Shimmer rows for chat threads and comment lists. */
function messageListSkeletonHtml(count = 4) {
  const variants = [
    `<div class="flex items-start gap-3"><div class="skeleton w-8 h-8 rounded-full shrink-0"></div><div class="flex-1 space-y-2"><div class="skeleton h-2.5 w-24 rounded"></div><div class="skeleton h-3 w-full rounded"></div><div class="skeleton h-3 w-4/5 rounded"></div></div></div>`,
    `<div class="flex items-start gap-3"><div class="skeleton w-8 h-8 rounded-full shrink-0"></div><div class="flex-1 space-y-2"><div class="skeleton h-2.5 w-16 rounded"></div><div class="skeleton h-3 w-3/4 rounded"></div></div></div>`,
    `<div class="flex items-start gap-3"><div class="skeleton w-8 h-8 rounded-full shrink-0"></div><div class="flex-1 space-y-2"><div class="skeleton h-2.5 w-20 rounded"></div><div class="skeleton h-3 w-full rounded"></div><div class="skeleton h-3 w-1/2 rounded"></div></div></div>`,
    `<div class="flex items-start gap-3"><div class="skeleton w-8 h-8 rounded-full shrink-0"></div><div class="flex-1 space-y-2"><div class="skeleton h-2.5 w-28 rounded"></div><div class="skeleton h-3 w-5/6 rounded"></div></div></div>`,
  ];
  const n = Math.min(count, variants.length);
  return `<div class="space-y-4">${variants.slice(0, n).join('')}</div>`;
}
