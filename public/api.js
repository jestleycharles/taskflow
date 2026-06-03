/**
 * fetch wrapper for Render free tier: service returns plain "Not Found" while waking.
 * Retries transient failures so users are not kicked to login or see parse errors.
 */
const WAKE_RETRY_DELAYS_MS = [2000, 4000, 8000];

function isServiceWaking(status, bodyText) {
  if ([502, 503, 504].includes(status)) return true;
  return status === 404 && bodyText.trim() === 'Not Found';
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
