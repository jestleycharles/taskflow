const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { sendError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const { FEEDBACK_ADMIN_EMAIL } = require('../lib/constants');
const { isGuestUser } = require('../lib/user');
const { assertCanSubmitFeedback } = require('../lib/feedback-send-guard');
const { ilikePattern, quotePostgrestValue } = require('../lib/ilike');
const {
  guestCaptchaRequired,
  turnstileSiteKey,
  verifyTurnstileToken,
} = require('../lib/turnstile');
const { isFeedbackHoneypotTriggered } = require('../lib/feedback-honeypot');

const router = express.Router();
const MAX_MESSAGE_LEN = 5000;
const PAGE_SIZE = 20;
const MAX_SEARCH_LEN = 200;

function isFeedbackAdmin(user) {
  return String(user?.email || '').trim().toLowerCase() === FEEDBACK_ADMIN_EMAIL;
}

function parsePageParam(raw) {
  const page = Math.max(1, parseInt(String(raw || '1'), 10) || 1);
  return page;
}

function applyFeedbackSearch(query, q) {
  const term = String(q || '').trim();
  if (!term) return query;
  const pattern = quotePostgrestValue(ilikePattern(term.slice(0, MAX_SEARCH_LEN)));
  return query.or(
    `message.ilike.${pattern},username.ilike.${pattern},user_email.ilike.${pattern}`
  );
}

// GET /api/feedback/captcha-config — Turnstile site key for guest feedback (when configured)
router.get('/api/feedback/captcha-config', requireAuth, (req, res) => {
  const isGuest = isGuestUser(req.session.user);
  res.json({
    guestCaptchaRequired: isGuest && guestCaptchaRequired(),
    turnstileSiteKey: isGuest && guestCaptchaRequired() ? turnstileSiteKey() : null,
  });
});

// POST /api/feedback — submit feedback or bug report (all signed-in users)
router.post('/api/feedback', requireAuth, async (req, res) => {
  if (isFeedbackHoneypotTriggered(req.body)) {
    return res.json({ success: true });
  }

  const message = String(req.body?.message || '').trim();
  const category = req.body?.category === 'bug' ? 'bug' : 'feedback';
  const isGuest = isGuestUser(req.session.user);

  if (message.length < 5) {
    return res.status(400).json({ error: 'Please enter at least 5 characters' });
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return res.status(400).json({ error: `Message must be ${MAX_MESSAGE_LEN} characters or fewer` });
  }

  if (isGuest && guestCaptchaRequired()) {
    const captcha = await verifyTurnstileToken(req.body?.captchaToken);
    if (!captcha.ok) {
      return res.status(400).json({ error: captcha.error || 'Verification required' });
    }
  } else if (isGuest && process.env.NODE_ENV === 'production') {
    return res.status(503).json({
      error: 'Guest feedback is temporarily unavailable. Please create a free account or try again later.',
    });
  }

  const guard = await assertCanSubmitFeedback(supabaseAdmin, {
    userId: req.session.user.id,
    sessionId: req.session.id,
    isGuest,
    message,
  });
  if (!guard.ok) {
    return res.status(guard.status || 429).json({ error: guard.error });
  }

  const row = {
    user_id: req.session.user.id,
    user_email: req.session.user.email,
    username: req.session.user.username,
    category,
    message: guard.content,
  };
  if (isGuest && req.session.id) row.session_id = req.session.id;

  const { data, error } = await supabaseAdmin
    .from('feedback')
    .insert(row)
    .select('id, category, created_at')
    .single();

  if (error) return sendError(res, 500, error, 'save');
  res.json({ success: true, feedback: data });
});

// GET /api/feedback — list submissions (admin only), paginated; optional ?q= search
router.get('/api/feedback', requireAuth, async (req, res) => {
  if (!isFeedbackAdmin(req.session.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const page = parsePageParam(req.query.page);
  const q = String(req.query.q || '').trim();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let countQuery = supabaseAdmin.from('feedback').select('id', { count: 'exact', head: true });
  countQuery = applyFeedbackSearch(countQuery, q);

  let listQuery = supabaseAdmin
    .from('feedback')
    .select('id, user_id, user_email, username, category, message, created_at')
    .order('created_at', { ascending: false })
    .range(from, to);
  listQuery = applyFeedbackSearch(listQuery, q);

  const [{ count, error: countError }, { data, error: listError }] = await Promise.all([
    countQuery,
    listQuery,
  ]);

  if (countError) return sendError(res, 500, countError, 'load');
  if (listError) return sendError(res, 500, listError, 'load');

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  res.json({
    items: data || [],
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  });
});

module.exports = router;
