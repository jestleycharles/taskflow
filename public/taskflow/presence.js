/**
 * taskflow/presence.js
 * Online presence, toasts, and navigation away.
 * Depends on: state.js, helpers.js, team-taskflow.js
 */

// Presence: heartbeat while on board; leave on tab close / navigate away;
// others detect offline via polling (or immediately after leave ping).
async function pingPresence() {
  if (presenceLeft) return;
  await apiFetch('/api/presence/ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamId }),
  });
}

function stopPresenceTimers() {
  clearInterval(presenceInterval);
  clearInterval(onlinePollInterval);
  presenceInterval = null;
  onlinePollInterval = null;
}

function leavePresence() {
  if (presenceLeft) return;
  presenceLeft = true;
  stopPresenceTimers();
  const body = JSON.stringify({ teamId });
  fetch('/api/presence/leave', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

function dismissToast(el) {
  if (!el || el.classList.contains('toast-exit')) return;
  el.classList.remove('toast-enter');
  el.classList.add('toast-exit');
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

function showPresenceToast(member, kind) {
  const online = kind === 'online';
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast-enter pointer-events-auto flex items-center gap-3 p-3 rounded-xl bg-ink-800/95 border border-white/15 shadow-2xl backdrop-blur-md';
  toast.setAttribute('role', 'status');
  const dotClass = online
    ? 'online-dot absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-ink-800'
    : 'absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-gray-500 border-2 border-ink-800';
  const message = online ? 'came online' : 'went offline';
  toast.innerHTML = `
    <div class="relative shrink-0">
      ${userAvatarHtml(member, 'w-9 h-9 text-sm')}
      <span class="${dotClass}"></span>
    </div>
    <div class="flex-1 min-w-0 pr-1">
      <p class="text-sm truncate">${memberNameHtml(member, member.id, 'text-sm')}</p>
      <p class="text-xs text-gray-400">${message}</p>
    </div>
    <button type="button" class="toast-close shrink-0 text-gray-500 hover:text-white transition p-1 rounded-lg hover:bg-white/10" aria-label="Dismiss">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
    </button>`;
  toast.querySelector('.toast-close').addEventListener('click', () => dismissToast(toast));
  container.appendChild(toast);
  setTimeout(() => dismissToast(toast), TOAST_AUTO_DISMISS_MS);
}

function notifyPresenceChanges(newlyOnlineIds, newlyOfflineIds) {
  for (const id of newlyOnlineIds) {
    if (String(id) === String(currentUser?.id)) continue;
    const member = teamData?.members?.find(m => String(m.id) === String(id));
    if (member) showPresenceToast(member, 'online');
  }
  for (const id of newlyOfflineIds) {
    if (String(id) === String(currentUser?.id)) continue;
    const member = teamData?.members?.find(m => String(m.id) === String(id));
    if (member) showPresenceToast(member, 'offline');
  }
}

async function fetchOnlineMembers() {
  if (presenceLeft) return;
  const r = await apiFetch(`/api/teams/${teamId}/online`);
  if (!r.ok) return;
  const ids = await r.json();
  if (!Array.isArray(ids)) return;
  const next = new Set(ids.map(String));
  const newlyOnline = [...next].filter(id => !knownOnlineUserIds.has(id));
  const newlyOffline = [...knownOnlineUserIds].filter(id => !next.has(id));

  if (presenceInitialized) {
    notifyPresenceChanges(newlyOnline, newlyOffline);
  } else {
    presenceInitialized = true;
  }

  knownOnlineUserIds = next;
  const changed = next.size !== onlineUserIds.size || [...next].some(id => !onlineUserIds.has(id))
    || [...onlineUserIds].some(id => !next.has(id));
  onlineUserIds = next;
  if (teamData) {
    teamData.online_count = next.size;
    updateMemberStatsDisplay();
  }
  if (changed && teamData?.members) {
    renderMemberList(teamData.members);
    renderMemberAvatars(teamData.members);
  }
  if (changed && chatMessages.length && chatPanelOpen) renderChatMessages();
}

function startPresence() {
  pingPresence();
  fetchOnlineMembers();
  presenceInterval = setInterval(pingPresence, 15000);
  onlinePollInterval = setInterval(fetchOnlineMembers, ONLINE_POLL_MS);
}

function navigateToDashboard() {
  leavePresence();
  showNavigationLoading('Returning to dashboard…');
  window.location = '/dashboard';
}

window.addEventListener('pagehide', leavePresence);
document.querySelector('nav a[href="/dashboard"]')?.addEventListener('click', (e) => {
  e.preventDefault();
  navigateToDashboard();
});
