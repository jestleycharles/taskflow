const { assessMessageSpam, isLowEffortSpam } = require('./message-send-guard');

const FEEDBACK_COOLDOWN_MS = 60_000;
const HOURLY_LIMIT = 5;
const DAILY_LIMIT = 15;
const RECENT_LOOKBACK = 5;
const LOOKBACK_HOURS = 24;

/** Per browser session (shared guest user_id is not used for these). */
const GUEST_SESSION_COOLDOWN_MS = 60_000;
const GUEST_SESSION_HOURLY_LIMIT = 5;
const GUEST_SESSION_DAILY_LIMIT = 10;

/**
 * Registered users: limits by feedback.user_id.
 * Guests: limits by feedback.session_id (one row per browser session).
 */
async function assertCanSubmitFeedback(client, { userId, sessionId, isGuest, message }) {
  const trimmed = String(message || '').trim();

  if (isGuest) {
    if (!sessionId) {
      return { ok: false, status: 500, error: 'Could not send feedback. Please try again.' };
    }
    if (isLowEffortSpam(trimmed)) {
      return {
        ok: false,
        status: 429,
        error: 'Please avoid sending repetitive or low-effort messages',
      };
    }
    return assertGuestSessionLimits(client, { sessionId, message: trimmed });
  }

  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  const { data, error } = await client
    .from('feedback')
    .select('message, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return { ok: false, status: 500, error: 'Could not send feedback. Please try again.' };
  }

  return applyRateLimits(trimmed, data || [], {
    hourlyLimit: HOURLY_LIMIT,
    dailyLimit: DAILY_LIMIT,
    cooldownMs: FEEDBACK_COOLDOWN_MS,
    hourlyError: 'You can send at most 5 feedback messages per hour. Please try again later.',
    dailyError: 'Daily feedback limit reached. Please try again tomorrow.',
  });
}

async function assertGuestSessionLimits(client, { sessionId, message }) {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  const { data, error } = await client
    .from('feedback')
    .select('message, created_at')
    .eq('session_id', sessionId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return { ok: false, status: 500, error: 'Could not send feedback. Please try again.' };
  }

  return applyRateLimits(message, data || [], {
    hourlyLimit: GUEST_SESSION_HOURLY_LIMIT,
    dailyLimit: GUEST_SESSION_DAILY_LIMIT,
    cooldownMs: GUEST_SESSION_COOLDOWN_MS,
    hourlyError: 'You can send at most 5 feedback messages per hour from this browser. Please try again later.',
    dailyError: 'Daily feedback limit reached for this browser. Please try again tomorrow.',
  });
}

function applyRateLimits(trimmed, recent, { hourlyLimit, dailyLimit, cooldownMs, hourlyError, dailyError }) {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const dayAgo = now - 24 * 60 * 60 * 1000;

  const inLastHour = recent.filter((r) => new Date(r.created_at).getTime() >= hourAgo);
  const inLastDay = recent.filter((r) => new Date(r.created_at).getTime() >= dayAgo);

  if (inLastHour.length >= hourlyLimit) {
    return { ok: false, status: 429, error: hourlyError };
  }

  if (inLastDay.length >= dailyLimit) {
    return { ok: false, status: 429, error: dailyError };
  }

  const forSpam = recent.slice(0, RECENT_LOOKBACK).map((r) => ({
    content: r.message,
    created_at: r.created_at,
  }));

  if (forSpam.length) {
    const assessment = assessMessageSpam(trimmed, forSpam, { cooldownMs });
    if (!assessment.ok) {
      return { ok: false, status: 429, error: assessment.error };
    }
  }

  return { ok: true, content: trimmed };
}

module.exports = {
  assertCanSubmitFeedback,
  FEEDBACK_COOLDOWN_MS,
};
