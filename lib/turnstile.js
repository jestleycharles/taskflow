const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function turnstileConfigured() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
}

function turnstileSiteKey() {
  return String(process.env.TURNSTILE_SITE_KEY || '').trim();
}

function guestCaptchaRequired() {
  return turnstileConfigured() && Boolean(turnstileSiteKey());
}

/** Verify a Turnstile token from the feedback form (guests). */
async function verifyTurnstileToken(token) {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    return {
      ok: false,
      error: process.env.NODE_ENV === 'production'
        ? 'Feedback verification is not configured.'
        : null,
      skipped: true,
    };
  }

  const response = String(token || '').trim();
  if (!response) {
    return { ok: false, error: 'Please complete the verification check.' };
  }

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response }),
    });
    const data = await res.json();
    if (data?.success) return { ok: true };
    return { ok: false, error: 'Verification failed. Please try again.' };
  } catch (err) {
    console.error('[turnstile]', err);
    return { ok: false, error: 'Could not verify submission. Please try again.' };
  }
}

module.exports = {
  turnstileConfigured,
  turnstileSiteKey,
  guestCaptchaRequired,
  verifyTurnstileToken,
};
