const ONLINE_THRESHOLD_MS = 45000;
const lastSeen = new Map();

function ping(userId) {
  lastSeen.set(String(userId), Date.now());
}

function getOnlineUserIds(userIds) {
  const now = Date.now();
  return userIds
    .map(String)
    .filter((id) => {
      const seen = lastSeen.get(id);
      return seen != null && now - seen < ONLINE_THRESHOLD_MS;
    });
}

function removeStale() {
  const now = Date.now();
  for (const [id, ts] of lastSeen) {
    if (now - ts > ONLINE_THRESHOLD_MS * 4) lastSeen.delete(id);
  }
}

setInterval(removeStale, 60000);

module.exports = { ping, getOnlineUserIds, ONLINE_THRESHOLD_MS };
