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
let suppressUnauthorizedModal = false;

function setNavigatingAway(suppress = true) {
  suppressUnauthorizedModal = suppress;
}

let navigationLoadingEl = null;

function ensureNavigationLoadingStyles() {
  if (document.getElementById('tfNavLoadingStyles')) return;
  const style = document.createElement('style');
  style.id = 'tfNavLoadingStyles';
  style.textContent = `
    #tfNavigationLoading {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483646;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      padding: 1.5rem;
      box-sizing: border-box;
      background: rgba(15, 17, 23, 0.88);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      font-family: "DM Sans", sans-serif;
      pointer-events: auto;
    }
    #tfNavigationLoading[data-visible="true"] {
      display: flex;
    }
    #tfNavigationLoading .tf-nav-spinner {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 9999px;
      border: 2px solid rgba(79, 110, 247, 0.3);
      border-top-color: #4f6ef7;
      animation: tfNavSpin 0.8s linear infinite;
    }
    @keyframes tfNavSpin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

function showNavigationLoading(message = 'Loading…') {
  setNavigatingAway(true);
  ensureNavigationLoadingStyles();
  if (!navigationLoadingEl) {
    navigationLoadingEl = document.createElement('div');
    navigationLoadingEl.id = 'tfNavigationLoading';
    navigationLoadingEl.setAttribute('role', 'status');
    navigationLoadingEl.setAttribute('aria-live', 'polite');
    navigationLoadingEl.innerHTML = `
      <div class="tf-nav-spinner" aria-hidden="true"></div>
      <p data-tf-nav-label style="font-size:0.875rem;color:#d1d5db;text-align:center;margin:0"></p>`;
    // Direct child of <html>, before <body> — stays viewport-fixed when body is portrait-rotated.
    if (document.body) {
      document.documentElement.insertBefore(navigationLoadingEl, document.body);
    } else {
      document.documentElement.appendChild(navigationLoadingEl);
    }
  }
  const label = navigationLoadingEl.querySelector('[data-tf-nav-label]');
  if (label) label.textContent = message;
  // Keep as last child of <html> so nothing stacks above the overlay.
  document.documentElement.appendChild(navigationLoadingEl);
  navigationLoadingEl.dataset.visible = 'true';
}

function hideNavigationLoading() {
  if (navigationLoadingEl) navigationLoadingEl.dataset.visible = 'false';
  setNavigatingAway(false);
}

/** Clear full-page overlays and page-specific nav UI before bfcache / after restore. */
function resetTransientNavigationUi() {
  hideNavigationLoading();
  if (typeof window.tfResetPageNavigationUi === 'function') {
    window.tfResetPageNavigationUi();
  }
}

// Transient loading UI must not survive the back-forward cache (e.g. dashboard card skeleton).
window.addEventListener('pagehide', resetTransientNavigationUi);
window.addEventListener('pageshow', (event) => {
  if (event.persisted) resetTransientNavigationUi();
});

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

  if (!suppressUnauthorizedModal && isUnauthorizedUpdateError(lastResponse.status, lastBody)) {
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
const sendCooldownTimers = new Map();

/**
 * Parse 429 spam-guard responses from chat, comments, and DMs.
 * @returns {{ error: string, retryAfterMs: number } | null}
 */
function parseMessageSendGuardError(status, data) {
  if (status !== 429) return null;
  const error = String(data?.error || 'Please slow down before sending again.');
  let retryAfterMs = Number(data?.retry_after_ms);
  if (!Number.isFinite(retryAfterMs) || retryAfterMs <= 0) {
    const match = error.match(/wait\s+(\d+)\s+second/i);
    retryAfterMs = match ? parseInt(match[1], 10) * 1000 : 5000;
  }
  return { error, retryAfterMs: Math.min(Math.max(retryAfterMs, 1000), 120000) };
}

function clearSendCooldown(key) {
  const entry = sendCooldownTimers.get(key);
  if (!entry) return;
  if (entry.intervalId) clearInterval(entry.intervalId);
  if (entry.timeoutId) clearTimeout(entry.timeoutId);
  sendCooldownTimers.delete(key);
}

/**
 * Show a countdown on the composer and disable send until the cooldown ends.
 * @param {string} key — unique per composer (e.g. team-chat:uuid)
 */
function applyMessageSendCooldown(key, { retryAfterMs, error, inputEl, sendBtnEl, noticeEl }) {
  clearSendCooldown(key);
  const notice = noticeEl || null;
  const input = inputEl || null;
  const btn = sendBtnEl || null;
  let remainingMs = Math.max(1000, retryAfterMs || 5000);
  const endsAt = Date.now() + remainingMs;

  const syncUi = () => {
    const sec = Math.max(1, Math.ceil(remainingMs / 1000));
    if (notice) {
      notice.textContent = error
        ? `${error} (${sec}s)`
        : `Please slow down (${sec}s)`;
      notice.classList.remove('hidden');
    }
    if (input) input.disabled = true;
    if (btn) btn.disabled = true;
  };

  syncUi();
  const intervalId = setInterval(() => {
    remainingMs = Math.max(0, endsAt - Date.now());
    if (remainingMs <= 0) {
      clearSendCooldown(key);
      if (notice) {
        notice.textContent = '';
        notice.classList.add('hidden');
      }
      if (input) input.disabled = false;
      if (btn) btn.disabled = false;
      return;
    }
    syncUi();
  }, 250);

  const timeoutId = setTimeout(() => {
    clearInterval(intervalId);
    sendCooldownTimers.delete(key);
    if (notice) {
      notice.textContent = '';
      notice.classList.add('hidden');
    }
    if (input) input.disabled = false;
    if (btn) btn.disabled = false;
  }, remainingMs + 50);

  sendCooldownTimers.set(key, { intervalId, timeoutId });
}

/** Clear a message composer and cancel any in-flight send guard for it. */
function resetMessageComposer(inputEl, sendBtnEl) {
  if (!inputEl) return;
  const key = inputEl.dataset.sendGuardKey;
  if (key) messageSendInFlight.delete(key);
  inputEl.value = '';
  inputEl.disabled = false;
  delete inputEl.dataset.sendGuardSnapshot;
  delete inputEl.dataset.sendGuardKey;
  delete inputEl.dataset.sendComposerDismissed;
  if (sendBtnEl) sendBtnEl.disabled = false;
}

/**
 * Prevents duplicate message sends while a POST is in flight (per `key`).
 * Clears the input immediately so rapid Enter/clicks cannot resend the same text.
 * Restores the input if `send` returns false or throws (unless the composer was dismissed).
 * @returns {Promise<boolean>} whether a send was attempted and completed successfully
 */
async function submitMessageOnce(key, { getContent, send, inputEl, sendBtnEl, cooldownNoticeEl }) {
  if (messageSendInFlight.has(key)) return false;
  if (sendCooldownTimers.has(key)) return false;
  const content = getContent();
  if (!content) return false;

  messageSendInFlight.add(key);
  const input = inputEl || null;
  const btn = sendBtnEl || null;
  if (input) {
    input.dataset.sendGuardKey = key;
    input.dataset.sendGuardSnapshot = input.value;
    delete input.dataset.sendComposerDismissed;
    input.value = '';
    input.disabled = true;
  }
  if (btn) btn.disabled = true;

  let ok = false;
  let rateLimited = false;
  try {
    const result = await send(content);
    if (result && typeof result === 'object' && result.rateLimit) {
      rateLimited = true;
      applyMessageSendCooldown(key, {
        retryAfterMs: result.rateLimit.retryAfterMs,
        error: result.rateLimit.error,
        inputEl: input,
        sendBtnEl: btn,
        noticeEl: cooldownNoticeEl,
      });
      ok = false;
    } else {
      ok = result === true || result?.ok === true;
    }
  } catch (err) {
    const dismissed = input?.dataset.sendComposerDismissed === '1';
    if (input && !input.value && !dismissed) input.value = input.dataset.sendGuardSnapshot || '';
    throw err;
  } finally {
    messageSendInFlight.delete(key);
    const dismissed = input?.dataset.sendComposerDismissed === '1';
    if (!ok && !rateLimited && input && !input.value && !dismissed) {
      input.value = input.dataset.sendGuardSnapshot || '';
    } else if (input && (ok || dismissed)) {
      input.value = '';
    }
    if (input && !rateLimited) {
      delete input.dataset.sendGuardSnapshot;
      delete input.dataset.sendGuardKey;
      delete input.dataset.sendComposerDismissed;
      if (!sendCooldownTimers.has(key)) input.disabled = false;
    }
    if (btn && !rateLimited && !sendCooldownTimers.has(key)) btn.disabled = false;
  }
  return ok;
}

/** Use in message send handlers when POST returns 429. */
function messageSendRateLimitResult(status, data) {
  const parsed = parseMessageSendGuardError(status, data);
  if (!parsed) return false;
  return { ok: false, rateLimit: parsed };
}

/** Mark composer dismissed so failed sends do not restore text after the panel closes. */
function dismissMessageComposer(inputEl, sendBtnEl) {
  if (inputEl) {
    const key = inputEl.dataset.sendGuardKey;
    if (key) clearSendCooldown(key);
    inputEl.dataset.sendComposerDismissed = '1';
  }
  resetMessageComposer(inputEl, sendBtnEl);
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

const GUEST_DASHBOARD_NOTICE_KEY = 'taskflow_guest_dashboard_notice';

function clearGuestDashboardNotice() {
  try { sessionStorage.removeItem(GUEST_DASHBOARD_NOTICE_KEY); } catch (_) { /* ignore */ }
}

function hasGuestDashboardNoticeDismissed() {
  try { return sessionStorage.getItem(GUEST_DASHBOARD_NOTICE_KEY) === '1'; } catch (_) { return false; }
}

function setGuestDashboardNoticeDismissed() {
  try { sessionStorage.setItem(GUEST_DASHBOARD_NOTICE_KEY, '1'); } catch (_) { /* ignore */ }
}

/** Blocking modal when the current team was deleted or the user lost access (board page). */
function showTeamGoneModal() {
  let modal = document.getElementById('teamGoneModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function isTeamAccessLostResponse(status, data) {
  if (status === 404) return true;
  if (status === 403) {
    const err = String(data?.error || '').toLowerCase();
    return err.includes('not a member') || err.includes('not found');
  }
  return false;
}
