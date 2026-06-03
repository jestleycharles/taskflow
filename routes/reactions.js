const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { sendError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const { isGuestUser } = require('../lib/user');
const {
  isValidReactionEmoji,
  fetchReactionsForMessages,
  groupReactions,
} = require('../lib/reactions');
const { isSenderBlockedInConversation } = require('../lib/dm-blocks');

const router = express.Router();

async function assertTeamMember(teamId, userId) {
  const { data } = await supabaseAdmin
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single();
  return !!data;
}

async function assertDmParticipant(conversationId, userId) {
  const { data } = await supabaseAdmin
    .from('dm_conversations')
    .select('user_a_id, user_b_id')
    .eq('id', conversationId)
    .single();
  if (!data) return false;
  const uid = String(userId);
  return String(data.user_a_id) === uid || String(data.user_b_id) === uid;
}

async function resolveTeamMessage(messageType, messageId) {
  if (messageType === 'chat') {
    const { data, error } = await supabaseAdmin
      .from('team_chat_messages')
      .select('team_id, deleted_at')
      .eq('id', messageId)
      .maybeSingle();
    if (error || !data || data.deleted_at) return null;
    return data.team_id;
  }
  if (messageType === 'comment') {
    const { data, error } = await supabaseAdmin
      .from('comments')
      .select('task_id, task:tasks(team_id)')
      .eq('id', messageId)
      .maybeSingle();
    if (error || !data) return null;
    return data?.task?.team_id || null;
  }
  return null;
}

async function resolveDmMessage(messageId) {
  const { data, error } = await supabaseAdmin
    .from('dm_messages')
    .select('conversation_id, deleted_at')
    .eq('id', messageId)
    .maybeSingle();
  if (error || !data || data.deleted_at) return null;
  return data.conversation_id;
}

// POST /api/reactions/toggle — add or remove a reaction (non-guest)
router.post('/api/reactions/toggle', requireAuth, async (req, res) => {
  if (isGuestUser(req.session.user)) {
    return res.status(403).json({ error: 'Guests can view reactions but cannot react' });
  }

  const userId = req.session.user.id;
  const messageType = req.body?.messageType;
  const messageId = req.body?.messageId;
  const emoji = req.body?.emoji;

  if (!['chat', 'comment', 'dm'].includes(messageType)) {
    return res.status(400).json({ error: 'Invalid message type' });
  }
  if (!messageId) return res.status(400).json({ error: 'messageId required' });
  if (!isValidReactionEmoji(emoji)) return res.status(400).json({ error: 'Invalid reaction' });

  if (messageType === 'dm') {
    const conversationId = await resolveDmMessage(messageId);
    if (!conversationId) return res.status(404).json({ error: 'Message not found' });
    const { data: conv } = await supabaseAdmin
      .from('dm_conversations')
      .select('user_a_id, user_b_id')
      .eq('id', conversationId)
      .single();
    if (!conv || !await assertDmParticipant(conversationId, userId)) {
      return res.status(403).json({ error: 'Not a participant' });
    }
    const uid = String(userId);
    const otherId = String(conv.user_a_id) === String(conv.user_b_id)
      ? null
      : (String(conv.user_a_id) === uid ? conv.user_b_id : conv.user_a_id);
    if (otherId && await isSenderBlockedInConversation(otherId, userId)) {
      return res.status(403).json({ error: 'You cannot react in this conversation' });
    }
  } else {
    const teamId = await resolveTeamMessage(messageType, messageId);
    if (!teamId) return res.status(404).json({ error: 'Message not found' });
    if (!await assertTeamMember(teamId, userId)) {
      return res.status(403).json({ error: 'Not a member' });
    }
  }

  const { data: existing } = await supabaseAdmin
    .from('message_reactions')
    .select('id')
    .eq('message_type', messageType)
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji)
    .maybeSingle();

  if (existing) {
    const { error } = await supabaseAdmin.from('message_reactions').delete().eq('id', existing.id);
    if (error) return sendError(res, 500, error, 'save');
  } else {
    const { error } = await supabaseAdmin.from('message_reactions').insert({
      message_type: messageType,
      message_id: messageId,
      user_id: userId,
      emoji,
    });
    if (error) return sendError(res, 400, error, 'save');
  }

  const reactionsMap = await fetchReactionsForMessages(messageType, [messageId]);
  res.json({ reactions: reactionsMap.get(messageId) || [] });
});

module.exports = { router, fetchReactionsForMessages, groupReactions };
