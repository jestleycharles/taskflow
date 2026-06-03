const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');
const { isGuestUser } = require('../lib/user');

const router = express.Router();

const MESSAGE_SELECT =
  'id, team_id, user_id, content, edited_at, deleted_at, created_at, user:user_id(id, username, avatar_color, avatar_url)';

async function assertTeamMember(teamId, userId) {
  const { data } = await supabaseAdmin
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single();
  return !!data;
}

function rejectGuestWrite(req, res) {
  if (isGuestUser(req.session.user)) {
    res.status(403).json({ error: 'Guests can view chat but cannot send or edit messages' });
    return true;
  }
  return false;
}

// GET /api/teams/:teamId/chat — all members (including guests) can read
router.get('/api/teams/:teamId/chat', requireAuth, async (req, res) => {
  const { teamId } = req.params;
  if (!await assertTeamMember(teamId, req.session.user.id))
    return res.status(403).json({ error: 'Not a member' });

  const { data, error } = await supabaseAdmin
    .from('team_chat_messages')
    .select(MESSAGE_SELECT)
    .eq('team_id', teamId)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/teams/:teamId/chat
router.post('/api/teams/:teamId/chat', requireAuth, async (req, res) => {
  if (rejectGuestWrite(req, res)) return;

  const { teamId } = req.params;
  const userId = req.session.user.id;
  if (!await assertTeamMember(teamId, userId))
    return res.status(403).json({ error: 'Not a member' });

  const content = (req.body?.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Message cannot be empty' });
  if (content.length > 4000) return res.status(400).json({ error: 'Message is too long' });

  const { data, error } = await supabaseAdmin
    .from('team_chat_messages')
    .insert({ team_id: teamId, user_id: userId, content })
    .select(MESSAGE_SELECT)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /api/teams/:teamId/chat/:messageId — edit own message
router.patch('/api/teams/:teamId/chat/:messageId', requireAuth, async (req, res) => {
  if (rejectGuestWrite(req, res)) return;

  const { teamId, messageId } = req.params;
  const userId = req.session.user.id;
  if (!await assertTeamMember(teamId, userId))
    return res.status(403).json({ error: 'Not a member' });

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('team_chat_messages')
    .select('id, user_id, team_id, deleted_at')
    .eq('id', messageId)
    .eq('team_id', teamId)
    .single();

  if (fetchErr || !existing) return res.status(404).json({ error: 'Message not found' });
  if (existing.deleted_at) return res.status(400).json({ error: 'Cannot edit a deleted message' });
  if (String(existing.user_id) !== String(userId))
    return res.status(403).json({ error: 'You can only edit your own messages' });

  const content = (req.body?.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Message cannot be empty' });
  if (content.length > 4000) return res.status(400).json({ error: 'Message is too long' });

  const { data, error } = await supabaseAdmin
    .from('team_chat_messages')
    .update({ content, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .select(MESSAGE_SELECT)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/teams/:teamId/chat/:messageId — soft delete own message
router.delete('/api/teams/:teamId/chat/:messageId', requireAuth, async (req, res) => {
  if (rejectGuestWrite(req, res)) return;

  const { teamId, messageId } = req.params;
  const userId = req.session.user.id;
  if (!await assertTeamMember(teamId, userId))
    return res.status(403).json({ error: 'Not a member' });

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('team_chat_messages')
    .select('id, user_id, team_id, deleted_at')
    .eq('id', messageId)
    .eq('team_id', teamId)
    .single();

  if (fetchErr || !existing) return res.status(404).json({ error: 'Message not found' });
  if (existing.deleted_at) return res.status(400).json({ error: 'Message already deleted' });
  if (String(existing.user_id) !== String(userId))
    return res.status(403).json({ error: 'You can only delete your own messages' });

  const { data, error } = await supabaseAdmin
    .from('team_chat_messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)
    .select(MESSAGE_SELECT)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
