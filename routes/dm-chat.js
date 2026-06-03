const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { sendError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const { isGuestUser, GUEST_EMAIL } = require('../lib/user');
const { fetchReactionsForMessages, attachReactionsToItems } = require('../lib/reactions');
const {
  normalizeEmail,
  isEmailBlocked,
  isSenderBlockedInConversation,
  isUserIgnored,
} = require('../lib/dm-blocks');

const router = express.Router();

const MESSAGE_SELECT =
  'id, conversation_id, user_id, content, content_before_edit, edited_at, deleted_at, created_at, user:user_id(id, username, avatar_color, avatar_url)';

const USER_PUBLIC_SELECT = 'id, username, email, avatar_color, avatar_url';

function rejectGuest(req, res) {
  if (isGuestUser(req.session.user)) {
    res.status(403).json({ error: 'Direct messages are only available for registered accounts' });
    return true;
  }
  return false;
}

function normalizeParticipants(userId1, userId2) {
  const a = String(userId1);
  const b = String(userId2);
  if (a === b) return { user_a_id: a, user_b_id: b, is_self: true };
  return a < b
    ? { user_a_id: a, user_b_id: b, is_self: false }
    : { user_a_id: b, user_b_id: a, is_self: false };
}

async function findRegisteredUserByEmail(email) {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) return null;
  const { data } = await supabaseAdmin
    .from('users')
    .select(USER_PUBLIC_SELECT)
    .eq('email', normalized)
    .maybeSingle();
  if (!data || data.email === GUEST_EMAIL || isGuestUser(data)) return null;
  return data;
}

async function getConversationForUser(conversationId, userId) {
  const { data, error } = await supabaseAdmin
    .from('dm_conversations')
    .select('id, user_a_id, user_b_id, created_at, last_message_at')
    .eq('id', conversationId)
    .single();
  if (error || !data) return null;
  const uid = String(userId);
  if (String(data.user_a_id) !== uid && String(data.user_b_id) !== uid) return null;
  return data;
}

function otherParticipant(conv, userId) {
  const uid = String(userId);
  const isSelf = String(conv.user_a_id) === String(conv.user_b_id);
  if (isSelf) return { is_self: true, user_id: uid };
  const otherId = String(conv.user_a_id) === uid ? conv.user_b_id : conv.user_a_id;
  return { is_self: false, user_id: otherId };
}

async function loadOtherUser(conv, userId) {
  const { is_self, user_id: otherId } = otherParticipant(conv, userId);
  if (is_self) {
    const { data } = await supabaseAdmin
      .from('users')
      .select(USER_PUBLIC_SELECT)
      .eq('id', userId)
      .single();
    return { is_self: true, user: data };
  }
  const { data } = await supabaseAdmin
    .from('users')
    .select(USER_PUBLIC_SELECT)
    .eq('id', otherId)
    .single();
  return { is_self: false, user: data };
}

async function getLastReadAt(conversationId, userId) {
  const { data } = await supabaseAdmin
    .from('dm_read_state')
    .select('last_read_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.last_read_at ? new Date(data.last_read_at).getTime() : 0;
}

async function getOtherParticipantId(conv, userId) {
  const uid = String(userId);
  if (String(conv.user_a_id) === String(conv.user_b_id)) return null;
  return String(conv.user_a_id) === uid ? conv.user_b_id : conv.user_a_id;
}

async function assertSenderNotBlocked(conv, senderId) {
  const otherId = await getOtherParticipantId(conv, senderId);
  if (!otherId) return null;
  const blocked = await isSenderBlockedInConversation(otherId, senderId);
  if (blocked) {
    return { status: 403, error: 'You cannot send messages in this conversation' };
  }
  return null;
}

async function countUnread(conversationId, userId, lastReadMs) {
  const { count, error } = await supabaseAdmin
    .from('dm_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .neq('user_id', userId)
    .is('deleted_at', null)
    .gt('created_at', new Date(lastReadMs).toISOString());
  if (error) return 0;
  return count || 0;
}

async function findOrCreateConversation(currentUserId, targetUserId) {
  const { user_a_id, user_b_id } = normalizeParticipants(currentUserId, targetUserId);
  const { data: existing } = await supabaseAdmin
    .from('dm_conversations')
    .select('id, user_a_id, user_b_id, created_at, last_message_at')
    .eq('user_a_id', user_a_id)
    .eq('user_b_id', user_b_id)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from('dm_conversations')
    .insert({ user_a_id, user_b_id })
    .select('id, user_a_id, user_b_id, created_at, last_message_at')
    .single();
  if (error) throw error;
  return data;
}

// GET /api/dm/conversations
router.get('/api/dm/conversations', requireAuth, async (req, res) => {
  if (rejectGuest(req, res)) return;
  const userId = req.session.user.id;

  const { data: convs, error } = await supabaseAdmin
    .from('dm_conversations')
    .select('id, user_a_id, user_b_id, created_at, last_message_at')
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .order('last_message_at', { ascending: false });

  if (error) return sendError(res, 500, error, 'load');

  const results = [];
  for (const conv of convs || []) {
    const { is_self, user } = await loadOtherUser(conv, userId);
    const { data: lastMsg } = await supabaseAdmin
      .from('dm_messages')
      .select('id, content, deleted_at, created_at, user_id')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastReadMs = await getLastReadAt(conv.id, userId);
    let unread_count = await countUnread(conv.id, userId, lastReadMs);
    const otherId = await getOtherParticipantId(conv, userId);
    if (otherId && await isUserIgnored(userId, otherId)) {
      unread_count = 0;
    }

    results.push({
      id: conv.id,
      is_self,
      other_user: user,
      last_message_at: conv.last_message_at,
      last_message: lastMsg
        ? {
            content: lastMsg.deleted_at ? null : lastMsg.content,
            deleted: !!lastMsg.deleted_at,
            created_at: lastMsg.created_at,
            is_mine: String(lastMsg.user_id) === String(userId),
          }
        : null,
      unread_count,
    });
  }

  res.json(results);
});

// POST /api/dm/conversations — start or open a chat by email (or self)
router.post('/api/dm/conversations', requireAuth, async (req, res) => {
  if (rejectGuest(req, res)) return;

  const userId = req.session.user.id;
  const emailInput = (req.body?.email || '').trim();

  let targetUserId = userId;
  if (emailInput) {
    const target = await findRegisteredUserByEmail(emailInput);
    if (!target) {
      return res.status(404).json({
        error: 'No registered user found with that email. They must sign up first (guest accounts cannot receive messages).',
      });
    }
    if (await isEmailBlocked(userId, target.email)) {
      return res.status(409).json({
        code: 'blocked_email',
        email: normalizeEmail(target.email),
        error: 'This email is in your block list.',
      });
    }
    targetUserId = target.id;
  }

  let conv;
  try {
    conv = await findOrCreateConversation(userId, targetUserId);
  } catch (err) {
    return sendError(res, 500, err, 'save');
  }

  const { is_self, user } = await loadOtherUser(conv, userId);
  res.json({
    id: conv.id,
    is_self,
    other_user: user,
    last_message_at: conv.last_message_at,
    last_message: null,
    unread_count: 0,
  });
});

// GET /api/dm/conversations/:conversationId/messages
router.get('/api/dm/conversations/:conversationId/messages', requireAuth, async (req, res) => {
  if (rejectGuest(req, res)) return;

  const { conversationId } = req.params;
  const userId = req.session.user.id;
  const conv = await getConversationForUser(conversationId, userId);
  if (!conv) return res.status(403).json({ error: 'Conversation not found' });

  const { data, error } = await supabaseAdmin
    .from('dm_messages')
    .select(MESSAGE_SELECT)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) return sendError(res, 500, error, 'load');
  const messages = data || [];
  const reactionsMap = await fetchReactionsForMessages('dm', messages.map((m) => m.id));
  res.json(attachReactionsToItems(messages, reactionsMap));
});

// GET /api/dm/conversations/:conversationId/read
router.get('/api/dm/conversations/:conversationId/read', requireAuth, async (req, res) => {
  if (rejectGuest(req, res)) return;

  const { conversationId } = req.params;
  const userId = req.session.user.id;
  if (!await getConversationForUser(conversationId, userId)) {
    return res.status(403).json({ error: 'Conversation not found' });
  }

  const { data, error } = await supabaseAdmin
    .from('dm_read_state')
    .select('last_read_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return sendError(res, 500, error, 'load');
  res.json({ last_read_at: data?.last_read_at || null });
});

// PUT /api/dm/conversations/:conversationId/read
router.put('/api/dm/conversations/:conversationId/read', requireAuth, async (req, res) => {
  if (rejectGuest(req, res)) return;

  const { conversationId } = req.params;
  const userId = req.session.user.id;
  if (!await getConversationForUser(conversationId, userId)) {
    return res.status(403).json({ error: 'Conversation not found' });
  }

  let incoming = new Date();
  if (req.body?.last_read_at) {
    const parsed = new Date(req.body.last_read_at);
    if (!Number.isNaN(parsed.getTime())) incoming = parsed;
  }

  const { data: existing } = await supabaseAdmin
    .from('dm_read_state')
    .select('last_read_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();

  const existingMs = existing?.last_read_at ? new Date(existing.last_read_at).getTime() : 0;
  const lastReadAt = new Date(Math.max(existingMs, incoming.getTime())).toISOString();

  const { data, error } = await supabaseAdmin
    .from('dm_read_state')
    .upsert(
      { conversation_id: conversationId, user_id: userId, last_read_at: lastReadAt },
      { onConflict: 'conversation_id,user_id' },
    )
    .select('last_read_at')
    .single();

  if (error) return sendError(res, 500, error, 'save');
  res.json({ last_read_at: data.last_read_at });
});

// POST /api/dm/conversations/:conversationId/messages
router.post('/api/dm/conversations/:conversationId/messages', requireAuth, async (req, res) => {
  if (rejectGuest(req, res)) return;

  const { conversationId } = req.params;
  const userId = req.session.user.id;
  const conv = await getConversationForUser(conversationId, userId);
  if (!conv) {
    return res.status(403).json({ error: 'Conversation not found' });
  }

  const blockErr = await assertSenderNotBlocked(conv, userId);
  if (blockErr) return res.status(blockErr.status).json({ error: blockErr.error });

  const content = (req.body?.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Message cannot be empty' });
  if (content.length > 4000) return res.status(400).json({ error: 'Message is too long' });

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('dm_messages')
    .insert({ conversation_id: conversationId, user_id: userId, content })
    .select(MESSAGE_SELECT)
    .single();

  if (error) return sendError(res, 500, error, 'load');

  await supabaseAdmin
    .from('dm_conversations')
    .update({ last_message_at: now })
    .eq('id', conversationId);

  const reactionsMap = await fetchReactionsForMessages('dm', [data.id]);
  res.json({ ...data, reactions: reactionsMap.get(data.id) || [] });
});

// PATCH /api/dm/conversations/:conversationId/messages/:messageId
router.patch('/api/dm/conversations/:conversationId/messages/:messageId', requireAuth, async (req, res) => {
  if (rejectGuest(req, res)) return;

  const { conversationId, messageId } = req.params;
  const userId = req.session.user.id;
  if (!await getConversationForUser(conversationId, userId)) {
    return res.status(403).json({ error: 'Conversation not found' });
  }

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('dm_messages')
    .select('id, user_id, conversation_id, deleted_at, content, content_before_edit, edited_at')
    .eq('id', messageId)
    .eq('conversation_id', conversationId)
    .single();

  if (fetchErr || !existing) return res.status(404).json({ error: 'Message not found' });
  if (existing.deleted_at) return res.status(400).json({ error: 'Cannot edit a deleted message' });
  if (String(existing.user_id) !== String(userId)) {
    return res.status(403).json({ error: 'You can only edit your own messages' });
  }

  const content = (req.body?.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Message cannot be empty' });
  if (content.length > 4000) return res.status(400).json({ error: 'Message is too long' });

  const updates = { content, edited_at: new Date().toISOString() };
  if (!existing.edited_at && existing.content !== content) {
    updates.content_before_edit = existing.content;
  }

  const { data, error } = await supabaseAdmin
    .from('dm_messages')
    .update(updates)
    .eq('id', messageId)
    .select(MESSAGE_SELECT)
    .single();

  if (error) return sendError(res, 500, error, 'load');
  const reactionsMap = await fetchReactionsForMessages('dm', [data.id]);
  res.json({ ...data, reactions: reactionsMap.get(data.id) || [] });
});

// DELETE /api/dm/conversations/:conversationId/messages/:messageId
router.delete('/api/dm/conversations/:conversationId/messages/:messageId', requireAuth, async (req, res) => {
  if (rejectGuest(req, res)) return;

  const { conversationId, messageId } = req.params;
  const userId = req.session.user.id;
  if (!await getConversationForUser(conversationId, userId)) {
    return res.status(403).json({ error: 'Conversation not found' });
  }

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('dm_messages')
    .select('id, user_id, conversation_id, deleted_at')
    .eq('id', messageId)
    .eq('conversation_id', conversationId)
    .single();

  if (fetchErr || !existing) return res.status(404).json({ error: 'Message not found' });
  if (existing.deleted_at) return res.status(400).json({ error: 'Message already deleted' });
  if (String(existing.user_id) !== String(userId)) {
    return res.status(403).json({ error: 'You can only delete your own messages' });
  }

  const { data, error } = await supabaseAdmin
    .from('dm_messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)
    .select(MESSAGE_SELECT)
    .single();

  if (error) return sendError(res, 500, error, 'load');
  const reactionsMap = await fetchReactionsForMessages('dm', [data.id]);
  res.json({ ...data, reactions: reactionsMap.get(data.id) || [] });
});

module.exports = router;
