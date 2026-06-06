/**
 * dashboard/feedback.js
 * ---------------------
 * User-facing "Send feedback" modal (bug reports & suggestions).
 * Handles optional Cloudflare Turnstile captcha for guest users.
 *
 * Depends on: state.js, modals.js, api.js
 */

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let feedbackCaptchaConfig = {
  guestCaptchaRequired: false,
  turnstileSiteKey: null,
};
let feedbackCaptchaToken = null;
let feedbackTurnstileWidgetId = null;
let feedbackTurnstileScriptPromise = null;

// ---------------------------------------------------------------------------
// Captcha helpers
// ---------------------------------------------------------------------------

async function loadFeedbackCaptchaConfig() {
  const r = await apiFetch("/api/feedback/captcha-config");
  if (!r.ok) return;
  const data = await parseJsonResponse(r);
  feedbackCaptchaConfig = {
    guestCaptchaRequired: !!data.guestCaptchaRequired,
    turnstileSiteKey: data.turnstileSiteKey || null,
  };
}
window.loadFeedbackCaptchaConfig = loadFeedbackCaptchaConfig;

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve();
  if (feedbackTurnstileScriptPromise) return feedbackTurnstileScriptPromise;
  feedbackTurnstileScriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load verification"));
    document.head.appendChild(s);
  });
  return feedbackTurnstileScriptPromise;
}

function getFeedbackCaptchaToken() {
  if (feedbackCaptchaToken) return feedbackCaptchaToken;
  if (feedbackTurnstileWidgetId != null && window.turnstile?.getResponse) {
    try {
      const token = turnstile.getResponse(feedbackTurnstileWidgetId);
      if (token) {
        feedbackCaptchaToken = token;
        return token;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function resetFeedbackTurnstile() {
  feedbackCaptchaToken = null;
  if (feedbackTurnstileWidgetId != null && window.turnstile) {
    try {
      turnstile.remove(feedbackTurnstileWidgetId);
    } catch {
      /* ignore */
    }
    feedbackTurnstileWidgetId = null;
  }
  document.getElementById("feedbackTurnstile").innerHTML = "";
}

async function mountFeedbackTurnstile() {
  const wrap = document.getElementById("feedbackCaptchaWrap");
  const needsCaptcha =
    !!window.currentUser?.is_guest &&
    feedbackCaptchaConfig.guestCaptchaRequired;
  wrap.classList.toggle("hidden", !needsCaptcha);
  resetFeedbackTurnstile();
  if (!needsCaptcha) return;

  try {
    await loadTurnstileScript();
    feedbackTurnstileWidgetId = turnstile.render("#feedbackTurnstile", {
      sitekey: feedbackCaptchaConfig.turnstileSiteKey,
      theme: "dark",
      callback: (token) => {
        feedbackCaptchaToken = token;
      },
      "expired-callback": () => {
        feedbackCaptchaToken = null;
      },
      "error-callback": () => {
        feedbackCaptchaToken = null;
      },
    });
  } catch {
    const errEl = document.getElementById("feedbackError");
    errEl.textContent = "Could not load verification. Refresh and try again.";
    errEl.classList.remove("hidden");
  }
}

// ---------------------------------------------------------------------------
// Public: open / close / submit
// ---------------------------------------------------------------------------

window.openFeedbackModal = async function openFeedbackModal() {
  document.getElementById("feedbackError").classList.add("hidden");
  document.getElementById("feedbackMessage").value = "";

  const hp = document.getElementById("feedbackHp");
  if (hp) hp.value = "";

  document.getElementById("feedbackCategory").value = "feedback";
  document
    .getElementById("feedbackGuestNotice")
    ?.classList.toggle("hidden", !window.currentUser?.is_guest);

  document.getElementById("feedbackModal").classList.remove("hidden");
  pushDashboardOverlay("feedback");

  await mountFeedbackTurnstile();
  setTimeout(() => document.getElementById("feedbackMessage")?.focus(), 50);
};

window.closeFeedbackModal = function closeFeedbackModal() {
  document.getElementById("feedbackModal").classList.add("hidden");
  resetFeedbackTurnstile();
  document.getElementById("feedbackCaptchaWrap").classList.add("hidden");
};

window.submitFeedback = async function submitFeedback() {
  const message = document.getElementById("feedbackMessage").value.trim();
  const category = document.getElementById("feedbackCategory").value;
  const errEl = document.getElementById("feedbackError");
  const btn = document.getElementById("feedbackSubmitBtn");

  errEl.classList.add("hidden");

  if (message.length < 5) {
    errEl.textContent = "Please enter at least 5 characters.";
    errEl.classList.remove("hidden");
    return;
  }

  const captchaToken = getFeedbackCaptchaToken();
  if (
    window.currentUser?.is_guest &&
    feedbackCaptchaConfig.guestCaptchaRequired &&
    !captchaToken
  ) {
    errEl.textContent = "Please complete the verification check below.";
    errEl.classList.remove("hidden");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Sending…";

  const body = {
    message,
    category,
    tf_hp: document.getElementById("feedbackHp")?.value || "",
  };
  if (
    window.currentUser?.is_guest &&
    feedbackCaptchaConfig.guestCaptchaRequired
  ) {
    body.captchaToken = captchaToken;
  }

  const r = await apiFetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseJsonResponse(r);

  btn.disabled = false;
  btn.textContent = "Submit";

  if (!r.ok) {
    errEl.textContent = data.error || "Could not send feedback";
    errEl.classList.remove("hidden");
    return;
  }

  closeFeedbackModal();
  resetFeedbackTurnstile();
  showAlert("Thank you — your feedback has been submitted.", "Received");

  // Refresh admin inbox if the current user can see it
  if (window.isFeedbackAdmin?.()) loadAdminFeedback();
};
