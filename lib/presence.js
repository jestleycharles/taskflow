const ONLINE_THRESHOLD_MS = 30000;
/** Scope for dashboard / direct-message presence (logged-in app session). */
const APP_SCOPE = '__app__';
/** userId:teamId -> last heartbeat timestamp */
const lastSeen = new Map();

function presenceKey(userId, teamId) {
  return `${String(userId)}:${String(teamId)}`;
}

function ping(userId, teamId) {
  lastSeen.set(presenceKey(userId, teamId), Date.now());
}

function leave(userId, teamId) {
  lastSeen.delete(presenceKey(userId, teamId));
}

function getOnlineUserIds(userIds, teamId) {
  const now = Date.now();
  const tid = String(teamId);
  return userIds
    .map(String)
    .filter((id) => {
      const seen = lastSeen.get(`${id}:${tid}`);
      return seen != null && now - seen < ONLINE_THRESHOLD_MS;
    });
}

function removeStale() {
  const now = Date.now();
  for (const [key, ts] of lastSeen) {
    if (now - ts > ONLINE_THRESHOLD_MS * 4) lastSeen.delete(key);
  }
}

setInterval(removeStale, 60000);

module.exports = { ping, leave, getOnlineUserIds, ONLINE_THRESHOLD_MS, APP_SCOPE };
