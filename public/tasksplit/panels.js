/**
 * TaskSplit side panels — activity, members, and balances.
 */

let activitySearchQuery = '';

function openActivityPanel() {
  closeTaskflowOverlayBeforeOpen('activity');
  if (chatPanelOpen) closeChatPanelUi();
  closeAllPanels();
  document.getElementById('activityPanel').classList.remove('hidden');
  setSidePanelMobileOpen(true);
  loadActivity();
  pushTaskflowOverlay('activity');
}

function closeActivityPanelUi() {
  document.getElementById('activityPanel').classList.add('hidden');
  setSidePanelMobileOpen(false);
}

function closeActivityPanel() {
  requestCloseTaskflowOverlay();
}

function openTeamPanel() {
  closeTaskflowOverlayBeforeOpen('team');
  if (chatPanelOpen) closeChatPanelUi();
  closeAllPanels();
  document.getElementById('teamPanel').classList.remove('hidden');
  setSidePanelMobileOpen(true);
  renderMemberList(teamData?.members || workspaceData?.members || []);
  applyTasksplitInviteUi();
  applyMembershipActionsUi?.();
  updateMemberStatsDisplay();
  pushTaskflowOverlay('team');
}

function isDuoAtCapacity() {
  if (workspaceData?.team?.expense_mode !== 'duo') return false;
  const members = workspaceData?.members?.length || 0;
  const pending = workspaceData?.pending_invites?.length || 0;
  return members + pending >= 2;
}

function applyTasksplitInviteUi() {
  const isOwner = workspaceData?.role === 'owner';
  const guestOwner = !!workspaceData?.owner_is_guest;
  const duoFull = isDuoAtCapacity();
  const section = document.getElementById('tasksplitInviteSection');
  const guestNote = document.getElementById('tasksplitInviteGuestNote');
  const duoNote = document.getElementById('tasksplitDuoCapacityNote');

  if (section) section.classList.toggle('hidden', !isOwner || guestOwner);
  if (guestNote) guestNote.classList.toggle('hidden', !isOwner || !guestOwner);

  if (duoNote) {
    duoNote.classList.toggle('hidden', !isOwner || guestOwner || !duoFull);
    duoNote.textContent =
      'This duo workspace already has 2 members (or pending invites). Remove someone or cancel an invite to add more.';
  }

  const emailInput = document.getElementById('tasksplitInviteEmail');
  const inviteBtn = section?.querySelector('button[onclick="tasksplitInviteMember()"]');
  const linkBtn = document.getElementById('tasksplitInviteLinkBlock')?.querySelector('button');
  if (emailInput) emailInput.disabled = duoFull;
  if (inviteBtn) inviteBtn.disabled = duoFull;
  if (linkBtn) linkBtn.disabled = duoFull;
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

function closeTeamPanelUi() {
  document.getElementById('teamPanel').classList.add('hidden');
  setSidePanelMobileOpen(false);
}

function closeTeamPanel() {
  requestCloseTaskflowOverlay();
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
