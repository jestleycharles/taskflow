/**
 * TaskSplit side panels — activity, members, and balances.
 */

let activitySearchQuery = '';

function hideBalanceSidebarForPanel() {
  document.getElementById('balanceSidebar')?.classList.add('hidden');
  document.getElementById('balanceSidebar')?.classList.remove('lg:flex');
}

function restoreBalanceSidebarIfNeeded() {
  const isSolo = workspaceData?.team?.expense_mode === 'solo';
  const sidebar = document.getElementById('balanceSidebar');
  if (!sidebar || isSolo) return;
  sidebar.classList.remove('hidden');
  sidebar.classList.add('lg:flex');
}

function openActivityPanel() {
  closeAllPanels();
  hideBalanceSidebarForPanel();
  document.getElementById('activityPanel').classList.remove('hidden');
  setSidePanelMobileOpen(true);
  loadActivity();
}

function closeActivityPanel() {
  document.getElementById('activityPanel').classList.add('hidden');
  setSidePanelMobileOpen(false);
  restoreBalanceSidebarIfNeeded();
}

function openTeamPanel() {
  closeAllPanels();
  hideBalanceSidebarForPanel();
  document.getElementById('teamPanel').classList.remove('hidden');
  setSidePanelMobileOpen(true);
  renderMemberList();
  applyTasksplitInviteUi();
  applyMembershipActionsUi?.();
  updateMemberStatsDisplay();
}

function applyTasksplitInviteUi() {
  const isOwner = workspaceData?.role === 'owner';
  const guestOwner = !!workspaceData?.owner_is_guest;
  const section = document.getElementById('tasksplitInviteSection');
  const guestNote = document.getElementById('tasksplitInviteGuestNote');
  if (section) section.classList.toggle('hidden', !isOwner || guestOwner);
  if (guestNote) guestNote.classList.toggle('hidden', !isOwner || !guestOwner);
}

async function tasksplitInviteMember() {
  if (workspaceData?.owner_is_guest) return;
  const email = document.getElementById('tasksplitInviteEmail')?.value.trim();
  const msg = document.getElementById('tasksplitInviteMsg');
  if (!email) return;

  const r = await apiFetch(`/api/teams/${teamId}/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const d = await parseJsonResponse(r);
  msg?.classList.remove('hidden');
  if (d.success) {
    msg.className = 'text-xs mt-2 text-emerald-400';
    msg.textContent = d.pending
      ? `Invitation sent to ${d.user?.username || email}`
      : `${d.user?.username || email} added!`;
    document.getElementById('tasksplitInviteEmail').value = '';
    await refreshAll();
  } else {
    msg.className = 'text-xs mt-2 text-red-400';
    msg.textContent = d.error || 'Invite failed';
  }
}

async function tasksplitCopyInviteLink() {
  if (workspaceData?.owner_is_guest) return;
  const msg = document.getElementById('tasksplitInviteLinkMsg');
  const r = await apiFetch(`/api/teams/${teamId}/invite-links`, { method: 'POST' });
  const d = await parseJsonResponse(r);
  if (!r.ok || !d.link?.url) {
    msg?.classList.remove('hidden');
    msg.className = 'text-xs mt-2 text-red-400';
    msg.textContent = d.error || 'Could not create invite link';
    return;
  }
  try {
    await navigator.clipboard.writeText(d.link.url);
    msg?.classList.remove('hidden');
    msg.className = 'text-xs mt-2 text-emerald-400';
    msg.textContent = 'Link copied to clipboard';
  } catch {
    msg?.classList.remove('hidden');
    msg.className = 'text-xs mt-2 text-amber-400 break-all';
    msg.textContent = d.link.url;
  }
}

function closeTeamPanel() {
  document.getElementById('teamPanel').classList.add('hidden');
  setSidePanelMobileOpen(false);
  restoreBalanceSidebarIfNeeded();
}

function renderMemberList() {
  const list = document.getElementById('teamMemberList');
  const members = workspaceData?.members || [];
  if (!members.length) {
    list.innerHTML = '<p class="text-gray-600 text-sm text-center py-8">No members yet</p>';
    return;
  }

  list.innerHTML = members
    .map(
      (m) => {
        const online = typeof isUserOnline === 'function' ? isUserOnline(m.id) : false;
        const avatar = typeof memberAvatarHtml === 'function'
          ? memberAvatarHtml(m, 'w-9 h-9 shrink-0')
          : userAvatarHtml(m, 'w-9 h-9 shrink-0');
        return `
    <div class="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
      ${avatar}
      <div class="min-w-0 flex-1">
        <p class="text-white text-sm font-medium truncate">${escHtml(m.username)}</p>
        <p class="text-gray-500 text-xs truncate">${escHtml(m.email)}</p>
      </div>
      <span class="ml-auto text-xs px-2 py-0.5 rounded-full border shrink-0 ${m.role === 'owner' ? 'border-brand-500/40 text-brand-500 bg-brand-500/10' : 'border-white/10 text-gray-400'}">${m.role}</span>
    </div>`;
      },
    )
    .join('');
}

function getFilteredActivityLogs() {
  const q = activitySearchQuery.trim().toLowerCase();
  if (!q) return activityLogs;
  return activityLogs.filter((log) => {
    const user = log.user?.username || '';
    const desc = log.description || '';
    return user.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
  });
}

function renderActivity() {
  const list = document.getElementById('activityList');
  const logs = getFilteredActivityLogs();

  if (!logs.length) {
    list.innerHTML = activitySearchQuery.trim()
      ? '<p class="text-gray-600 text-sm text-center py-8">No matching activity</p>'
      : '<p class="text-gray-600 text-sm text-center py-8">No activity yet</p>';
    return;
  }

  list.innerHTML = logs
    .map((log) => {
      const user = log.user || { username: 'Someone', avatar_color: '#4f6ef7' };
      return `
    <div class="flex gap-3 py-3 border-b border-white/5 last:border-0">
      ${userAvatarHtml(user, 'w-8 h-8 shrink-0')}
      <div class="min-w-0">
        <p class="text-gray-300 text-sm leading-relaxed">
          <span class="text-white font-medium">${escHtml(user.username)}</span>
          ${escHtml(log.description)}
        </p>
        <p class="text-gray-600 text-xs mt-0.5">${new Date(log.created_at).toLocaleString()}</p>
      </div>
    </div>`;
    })
    .join('');
}

async function loadActivity() {
  const r = await apiFetch(`/api/teams/${teamId}/activity`);
  const logs = await parseJsonResponse(r);
  if (!Array.isArray(logs)) return;
  activityLogs = logs;
  renderActivity();
}
