const { supabaseAdmin } = require('./supabase');

const REACTION_EMOJIS = {
  love: { label: 'Love', symbol: '❤️' },
  money: { label: 'Money', symbol: '🤑' },
  ok: { label: 'OK', symbol: '👍' },
  haha: { label: 'Haha', symbol: '😂' },
  sad: { label: 'Sad', symbol: '😢' },
  angry: { label: 'Angry', symbol: '😠' },
  fire: { label: 'Fire', symbol: '🔥' },
  clap: { label: 'Clap', symbol: '👏' },
  think: { label: 'Think', symbol: '🤔' },
  party: { label: 'Party', symbol: '🎉' },
  eyes: { label: 'Eyes', symbol: '👀' },
  hundred: { label: '100', symbol: '💯' },
};

function isValidReactionEmoji(emoji) {
  return typeof emoji === 'string' && Object.prototype.hasOwnProperty.call(REACTION_EMOJIS, emoji);
}

function groupReactions(rows) {
  const byMessage = new Map();
  for (const row of rows || []) {
    const key = row.message_id;
    if (!byMessage.has(key)) byMessage.set(key, {});
    const msg = byMessage.get(key);
    if (!msg[row.emoji]) {
      msg[row.emoji] = { emoji: row.emoji, count: 0, users: [] };
    }
    const bucket = msg[row.emoji];
    bucket.count += 1;
    if (row.user) {
      bucket.users.push({
        id: row.user.id,
        username: row.user.username,
        avatar_color: row.user.avatar_color,
        avatar_url: row.user.avatar_url,
      });
    }
  }
  const result = new Map();
  for (const [messageId, buckets] of byMessage) {
    result.set(messageId, Object.values(buckets));
  }
  return result;
}

async function fetchReactionsForMessages(messageType, messageIds) {
  if (!messageIds.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from('message_reactions')
    .select('message_id, emoji, user_id, user:user_id(id, username, avatar_color, avatar_url)')
    .eq('message_type', messageType)
    .in('message_id', messageIds);
  if (error) throw error;
  return groupReactions(data);
}

function attachReactionsToItems(items, reactionsMap, idKey = 'id') {
  return items.map((item) => ({
    ...item,
    reactions: reactionsMap.get(item[idKey]) || [],
  }));
}

module.exports = {
  REACTION_EMOJIS,
  isValidReactionEmoji,
  fetchReactionsForMessages,
  attachReactionsToItems,
  groupReactions,
};
