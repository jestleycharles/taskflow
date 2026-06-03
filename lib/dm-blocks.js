const { supabaseAdmin } = require('./supabase');

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

async function getBlockedEmails(userId) {
  const { data, error } = await supabaseAdmin
    .from('dm_blocked_emails')
    .select('email, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => r.email);
}

async function isEmailBlocked(userId, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const { data } = await supabaseAdmin
    .from('dm_blocked_emails')
    .select('email')
    .eq('user_id', userId)
    .eq('email', normalized)
    .maybeSingle();
  return !!data;
}

async function addBlockedEmail(userId, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  const { error } = await supabaseAdmin
    .from('dm_blocked_emails')
    .upsert({ user_id: userId, email: normalized }, { onConflict: 'user_id,email' });
  if (error) throw error;
}

async function removeBlockedEmail(userId, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  const { error } = await supabaseAdmin
    .from('dm_blocked_emails')
    .delete()
    .eq('user_id', userId)
    .eq('email', normalized);
  if (error) throw error;
}

async function getBlockedUserIds(blockerId) {
  const { data, error } = await supabaseAdmin
    .from('dm_user_blocks')
    .select('blocked_user_id')
    .eq('blocker_id', blockerId);
  if (error) throw error;
  return (data || []).map((r) => String(r.blocked_user_id));
}

async function isSenderBlockedInConversation(blockerId, senderId) {
  if (!blockerId || !senderId || String(blockerId) === String(senderId)) return false;
  const { data } = await supabaseAdmin
    .from('dm_user_blocks')
    .select('blocked_user_id')
    .eq('blocker_id', blockerId)
    .eq('blocked_user_id', senderId)
    .maybeSingle();
  return !!data;
}

async function blockUser(blockerId, blockedUserId, blockedEmail) {
  if (String(blockerId) === String(blockedUserId)) return;
  const { error } = await supabaseAdmin
    .from('dm_user_blocks')
    .upsert(
      { blocker_id: blockerId, blocked_user_id: blockedUserId },
      { onConflict: 'blocker_id,blocked_user_id' },
    );
  if (error) throw error;
  if (blockedEmail) await addBlockedEmail(blockerId, blockedEmail);
}

async function unblockUserById(blockerId, blockedUserId) {
  const { error } = await supabaseAdmin
    .from('dm_user_blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_user_id', blockedUserId);
  if (error) throw error;
}

async function getIgnoredUserIds(userId) {
  const { data, error } = await supabaseAdmin
    .from('dm_ignored_users')
    .select('ignored_user_id')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map((r) => String(r.ignored_user_id));
}

async function isUserIgnored(userId, otherUserId) {
  if (!userId || !otherUserId) return false;
  const { data } = await supabaseAdmin
    .from('dm_ignored_users')
    .select('ignored_user_id')
    .eq('user_id', userId)
    .eq('ignored_user_id', otherUserId)
    .maybeSingle();
  return !!data;
}

async function ignoreUser(userId, ignoredUserId) {
  if (String(userId) === String(ignoredUserId)) return;
  const { error } = await supabaseAdmin
    .from('dm_ignored_users')
    .upsert(
      { user_id: userId, ignored_user_id: ignoredUserId },
      { onConflict: 'user_id,ignored_user_id' },
    );
  if (error) throw error;
}

async function unignoreUser(userId, ignoredUserId) {
  const { error } = await supabaseAdmin
    .from('dm_ignored_users')
    .delete()
    .eq('user_id', userId)
    .eq('ignored_user_id', ignoredUserId);
  if (error) throw error;
}

async function getDmSettings(userId) {
  const [blocked_emails, blocked_user_ids, ignored_user_ids] = await Promise.all([
    getBlockedEmails(userId),
    getBlockedUserIds(userId),
    getIgnoredUserIds(userId),
  ]);
  return { blocked_emails, blocked_user_ids, ignored_user_ids };
}

module.exports = {
  normalizeEmail,
  getBlockedEmails,
  isEmailBlocked,
  addBlockedEmail,
  removeBlockedEmail,
  getBlockedUserIds,
  isSenderBlockedInConversation,
  blockUser,
  unblockUserById,
  getIgnoredUserIds,
  isUserIgnored,
  ignoreUser,
  unignoreUser,
  getDmSettings,
};
