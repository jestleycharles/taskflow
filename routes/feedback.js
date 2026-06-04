const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { sendError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const { FEEDBACK_ADMIN_EMAIL } = require('../lib/constants');

const router = express.Router();
const MAX_MESSAGE_LEN = 5000;

function isFeedbackAdmin(user) {
  return String(user?.email || '').trim().toLowerCase() === FEEDBACK_ADMIN_EMAIL;
}

// POST /api/feedback — submit feedback or bug report (all signed-in users)
router.post('/api/feedback', requireAuth, async (req, res) => {
  const message = String(req.body?.message || '').trim();
  const category = req.body?.category === 'bug' ? 'bug' : 'feedback';

  if (message.length < 5) {
    return res.status(400).json({ error: 'Please enter at least 5 characters' });
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return res.status(400).json({ error: `Message must be ${MAX_MESSAGE_LEN} characters or fewer` });
  }

  const { data, error } = await supabaseAdmin
    .from('feedback')
    .insert({
      user_id: req.session.user.id,
      user_email: req.session.user.email,
      username: req.session.user.username,
      category,
      message,
    })
    .select('id, category, created_at')
    .single();

  if (error) return sendError(res, 500, error, 'save');
  res.json({ success: true, feedback: data });
});

// GET /api/feedback — list submissions (admin only)
router.get('/api/feedback', requireAuth, async (req, res) => {
  if (!isFeedbackAdmin(req.session.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { data, error } = await supabaseAdmin
    .from('feedback')
    .select('id, user_id, user_email, username, category, message, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return sendError(res, 500, error, 'load');
  res.json(data || []);
});

module.exports = router;
