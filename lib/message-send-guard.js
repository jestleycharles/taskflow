const SEND_COOLDOWN_MS = 5000;
const RECENT_MESSAGE_LOOKBACK = 5;
const SIMILARITY_THRESHOLD = 0.85;
const SHORT_EXTENSION_MAX_EXTRA = 3;
const CLUSTER_MIN_SIZE = 3;
/** Skip expensive fuzzy compare above this length (avoids OOM / timeouts on long chat). */
const MAX_FUZZY_COMPARE_LEN = 128;

const RECENT_MESSAGE_SELECT = {
  dm_messages: 'content, content_before_edit, edited_at, deleted_at, created_at',
  team_chat_messages: 'content, content_before_edit, edited_at, deleted_at, created_at',
  comments: 'content, created_at',
};

/**
 * Enforces per-user send rules in a single thread/channel/task using the last
 * few messages: cooldown, duplicates, near-duplicates, and repeat patterns.
 */
async function assertCanSendUserMessage(client, {
  table,
  scopeColumn,
  scopeId,
  userId,
  content,
  excludeSystem = false,
  skipSpamGuard = false,
}) {
  const trimmed = String(content || '').trim();
  if (skipSpamGuard) return { ok: true, content: trimmed };

  try {
    // Fetch extra rows so deleted messages do not consume the lookback window.
    const fetchLimit = RECENT_MESSAGE_LOOKBACK * 4;
    const selectColumns = RECENT_MESSAGE_SELECT[table] || 'content, created_at';

    let query = client
      .from(table)
      .select(selectColumns)
      .eq(scopeColumn, scopeId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(fetchLimit);

    if (excludeSystem) query = query.eq('is_system', false);

    const { data, error } = await query;
    if (error) {
      return { ok: false, status: 500, error: 'Could not send message. Please try again.' };
    }

    const recent = (data || [])
      .filter((m) => !m.deleted_at)
      .slice(0, RECENT_MESSAGE_LOOKBACK);
    if (!recent.length) return { ok: true, content: trimmed };

    const assessment = assessMessageSpam(trimmed, recent);
    if (!assessment.ok) {
      return { ok: false, status: 429, error: assessment.error };
    }

    return { ok: true, content: trimmed };
  } catch (err) {
    console.error('[message-send-guard]', err);
    return { ok: false, status: 500, error: 'Could not send message. Please try again.' };
  }
}

function assessMessageSpam(newContent, recentMessages) {
  const last = recentMessages[0];
  const lastAt = new Date(last.created_at).getTime();
  if (!Number.isNaN(lastAt)) {
    const elapsed = Date.now() - lastAt;
    if (elapsed < SEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((SEND_COOLDOWN_MS - elapsed) / 1000);
      return {
        ok: false,
        error: `Please wait ${waitSec} second${waitSec === 1 ? '' : 's'} before sending another message`,
      };
    }
  }

  if (isLowEffortSpam(newContent)) {
    return { ok: false, error: 'Please avoid sending repetitive or low-effort messages' };
  }

  const comparisonMessages = expandForSpamComparison(recentMessages);
  const similarRecent = comparisonMessages.filter((m) =>
    isSpamSimilar(String(m.content || ''), newContent)
  );

  if (similarRecent.some((m) => String(m.content || '').trim() === newContent)) {
    return { ok: false, error: 'This message is the same as a recent message you sent' };
  }

  if (similarRecent.length >= 2) {
    return {
      ok: false,
      error: 'Too many similar messages recently. Change what you send or wait a bit.',
    };
  }

  if (similarRecent.length >= 1) {
    return {
      ok: false,
      error: 'This message is too similar to one of your recent messages',
    };
  }

  if (hasSimilarityCluster(recentMessages, CLUSTER_MIN_SIZE)) {
    return {
      ok: false,
      error: 'You\'re sending too many similar messages in a row. Please slow down.',
    };
  }

  return { ok: true };
}

/** Each logical message; edited messages also contribute their pre-edit text for comparison. */
function expandForSpamComparison(messages) {
  const expanded = [];
  for (const m of messages) {
    expanded.push({ content: m.content, created_at: m.created_at });
    if (!m.edited_at || m.content_before_edit == null) continue;
    const original = String(m.content_before_edit).trim();
    const current = String(m.content || '').trim();
    if (original && original !== current) {
      expanded.push({ content: m.content_before_edit, created_at: m.created_at });
    }
  }
  return expanded;
}

/** True when two messages are effectively the same spam (exact, fuzzy, or tiny tweak). */
function isSpamSimilar(a, b) {
  const left = String(a || '').trim();
  const right = String(b || '').trim();
  if (!left || !right) return false;
  if (left === right) return true;

  const na = normalizeForComparison(left);
  const nb = normalizeForComparison(right);
  if (na === nb) return true;

  const ca = compactForm(left);
  const cb = compactForm(right);
  if (ca && cb && ca === cb) return true;

  const fuzzyAllowed =
    ca.length <= MAX_FUZZY_COMPARE_LEN &&
    cb.length <= MAX_FUZZY_COMPARE_LEN;

  if (fuzzyAllowed && isShortExtension(ca, cb)) return true;

  if (!fuzzyAllowed) return false;

  const minLen = Math.min(ca.length, cb.length, na.length, nb.length);
  if (minLen >= 4) {
    if (similarityRatio(ca, cb) >= SIMILARITY_THRESHOLD) return true;
    if (similarityRatio(na, nb) >= SIMILARITY_THRESHOLD) return true;
  }

  if (minLen >= 3 && Math.max(ca.length, cb.length) <= 16) {
    const dist = levenshtein(ca, cb);
    if (dist <= 2 && Math.abs(ca.length - cb.length) <= 2) return true;
  }

  return false;
}

function normalizeForComparison(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function compactForm(text) {
  return normalizeForComparison(text).replace(/[^a-z0-9]/g, '');
}

/** e.g. "asdf" vs "asdf1", "hi" vs "hii", "test" vs "test!" */
function isShortExtension(a, b) {
  if (!a || !b) return false;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length < 2) return false;
  const extra = longer.length - shorter.length;
  if (extra === 0) return shorter === longer;
  if (extra > SHORT_EXTENSION_MAX_EXTRA) return false;
  return longer.startsWith(shorter) || longer.endsWith(shorter);
}

function similarityRatio(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a.length > MAX_FUZZY_COMPARE_LEN || b.length > MAX_FUZZY_COMPARE_LEN) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (a.length > MAX_FUZZY_COMPARE_LEN || b.length > MAX_FUZZY_COMPARE_LEN) {
    return Math.abs(a.length - b.length) + 1;
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev = new Array(cols);
  let curr = new Array(cols);

  for (let j = 0; j < cols; j++) prev[j] = j;

  for (let i = 1; i < rows; i++) {
    curr[0] = i;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[cols - 1];
}

function isLowEffortSpam(text) {
  const compact = compactForm(text);
  if (compact.length < 6) return false;
  const unique = new Set(compact).size;
  if (unique <= 2) return true;
  if (/^(.)\1{5,}$/.test(compact)) return true;
  const words = normalizeForComparison(text).split(' ').filter(Boolean);
  if (words.length >= 3 && new Set(words).size === 1) return true;
  return false;
}

/** Several recent messages are all minor variations of each other. */
function hasSimilarityCluster(messages, minSize) {
  if (messages.length < minSize) return false;
  const shortEnough = messages.filter((m) => {
    const c = compactForm(String(m.content || ''));
    return c.length > 0 && c.length <= MAX_FUZZY_COMPARE_LEN;
  });
  if (shortEnough.length < minSize) return false;

  for (let i = 0; i < shortEnough.length; i++) {
    let clusterSize = 0;
    for (let j = 0; j < shortEnough.length; j++) {
      if (isSpamSimilar(shortEnough[i].content, shortEnough[j].content)) clusterSize++;
    }
    if (clusterSize >= minSize) return true;
  }
  return false;
}

module.exports = { assertCanSendUserMessage, SEND_COOLDOWN_MS, RECENT_MESSAGE_LOOKBACK };
