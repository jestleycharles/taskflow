/**
 * taskflow/panels.js
 * Activity, team, and settings side panels; team management.
 * Depends on: state.js, helpers.js, members.js, team-taskflow.js
 */

// Activity Panel
function openActivityPanel() {
  closeTaskflowOverlayBeforeOpen('activity');
  if (chatPanelOpen) closeChatPanelUi();
  closeAllSidePanels();
  document.getElementById('activityPanel').classList.remove('hidden');
  setSidePanelMobileOpen(true);
  loadActivity({ background: activityLogs.length > 0 });
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
  closeAllSidePanels();
  document.getElementById('teamPanel').classList.remove('hidden');
  setSidePanelMobileOpen(true);
  fetchOnlineMembers();
  pushTaskflowOverlay('team');
}
function closeTeamPanelUi() {
  document.getElementById('teamPanel').classList.add('hidden');
  setSidePanelMobileOpen(false);
}
function closeTeamPanel() {
  requestCloseTaskflowOverlay();
}

// Settings Panel (owners only)
function openSettingsPanel() {
  if (teamData?.userRole !== 'owner') return;
  closeTaskflowOverlayBeforeOpen('settings');
  if (chatPanelOpen) closeChatPanelUi();
  closeAllSidePanels();
  document.getElementById('settingsPanel').classList.remove('hidden');
  setSidePanelMobileOpen(true);
  pushTaskflowOverlay('settings');
}
function closeSettingsPanelUi() {
  document.getElementById('settingsPanel').classList.add('hidden');
  setSidePanelMobileOpen(false);
  setSettingsDangerZoneOpen(false);
}
function closeSettingsPanel() {
  requestCloseTaskflowOverlay();
}

function setSettingsDangerZoneOpen(open) {
  const content = document.getElementById('dangerZoneContent');
  const btn = document.getElementById('dangerZoneToggleBtn');
  const label = document.getElementById('dangerZoneToggleLabel');
  const chevron = document.getElementById('dangerZoneChevron');
  if (!content || !btn) return;
  content.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.classList.toggle('drawer-open', open);
  if (label) label.textContent = open ? 'Close danger zone' : 'Danger zone';
  if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
}

function toggleSettingsDangerZone() {
  const content = document.getElementById('dangerZoneContent');
  if (!content) return;
  setSettingsDangerZoneOpen(content.classList.contains('hidden'));
}

function toggleAddTaskOptional() {
  const content = document.getElementById('addTaskOptionalContent');
  const btn = document.getElementById('addTaskOptionalToggleBtn');
  const label = document.getElementById('addTaskOptionalLabel');
  const chevron = document.getElementById('addTaskOptionalChevron');
  if (!content) return;
  const open = content.classList.contains('hidden');
  content.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.classList.toggle('drawer-open', open);
  if (label) label.textContent = open ? 'Hide details' : 'Add details';
  if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
}

function resetAddTaskOptionalDrawer() {
  const content = document.getElementById('addTaskOptionalContent');
  const btn = document.getElementById('addTaskOptionalToggleBtn');
  const label = document.getElementById('addTaskOptionalLabel');
  const chevron = document.getElementById('addTaskOptionalChevron');
  if (content) content.classList.add('hidden');
  if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.classList.remove('drawer-open'); }
  if (label) label.textContent = 'Add details';
  if (chevron) chevron.style.transform = '';
}

function toggleTaskDetailsOptional() {
  const content = document.getElementById('taskDetailsOptionalContent');
  const btn = document.getElementById('taskDetailsOptionalToggleBtn');
  const label = document.getElementById('taskDetailsOptionalLabel');
  const chevron = document.getElementById('taskDetailsOptionalChevron');
  if (!content) return;
  const open = content.classList.contains('hidden');
  content.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.classList.toggle('drawer-open', open);
  if (label) label.textContent = open ? 'Hide details' : 'Details';
  if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
}

function resetTaskDetailsDrawer() {
  const content = document.getElementById('taskDetailsOptionalContent');
  const btn = document.getElementById('taskDetailsOptionalToggleBtn');
  const label = document.getElementById('taskDetailsOptionalLabel');
  const chevron = document.getElementById('taskDetailsOptionalChevron');
  if (content) content.classList.add('hidden');
  if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.classList.remove('drawer-open'); }
  if (label) label.textContent = 'Details';
  if (chevron) chevron.style.transform = '';
}

function setEditTeamDetailsDrawerOpen(open) {
  const content = document.getElementById('editTeamDetailsContent');
  const btn = document.getElementById('editTeamDetailsToggleBtn');
  const label = document.getElementById('editTeamDetailsLabel');
  const chevron = document.getElementById('editTeamDetailsChevron');
  if (!content || !btn) return;
  content.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.classList.toggle('drawer-open', open);
  if (label) label.textContent = open ? 'Hide avatar & description' : 'Avatar & description';
  if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
}

function toggleEditTeamDetails() {
  const content = document.getElementById('editTeamDetailsContent');
  if (!content) return;
  setEditTeamDetailsDrawerOpen(content.classList.contains('hidden'));
}

function resetEditTeamDetailsDrawer() {
  setEditTeamDetailsDrawerOpen(false);
}

function setTeamRoleAddDrawerOpen(open) {
  const content = document.getElementById('teamRoleAddContent');
  const btn = document.getElementById('teamRoleAddToggleBtn');
  const label = document.getElementById('teamRoleAddLabel');
  const chevron = document.getElementById('teamRoleAddChevron');
  if (!content || !btn) return;
  content.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.classList.toggle('drawer-open', open);
  const editing = !!editingTeamRoleId;
  if (label) label.textContent = open ? (editing ? 'Hide role editor' : 'Hide add role') : (editing ? 'Edit role' : 'Add role');
  if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
}

function toggleTeamRoleAddDrawer() {
  const content = document.getElementById('teamRoleAddContent');
  if (!content) return;
  setTeamRoleAddDrawerOpen(content.classList.contains('hidden'));
}

function resetTeamRoleAddDrawer() {
  setTeamRoleAddDrawerOpen(false);
}

function setColumnAddDrawerOpen(open) {
  const content = document.getElementById('columnAddContent');
  const btn = document.getElementById('columnAddToggleBtn');
  const label = document.getElementById('columnAddLabel');
  const chevron = document.getElementById('columnAddChevron');
  if (!content || !btn) return;
  content.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.classList.toggle('drawer-open', open);
  const editing = !!editingColumnId;
  if (label) label.textContent = open ? (editing ? 'Hide column editor' : 'Hide add column') : (editing ? 'Edit column' : 'Add column');
  if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
}

function toggleColumnAddDrawer() {
  const content = document.getElementById('columnAddContent');
  if (!content) return;
  setColumnAddDrawerOpen(content.classList.contains('hidden'));
}

function resetColumnAddDrawer() {
  setColumnAddDrawerOpen(false);
}

function applyTeamHeader() {
  if (!teamData) return;
  document.title = `TaskFlow — ${teamData.name}`;
  document.getElementById('teamName').textContent = teamData.name;
  const navAvatar = document.getElementById('teamNavAvatar');
  navAvatar.className = 'w-6 h-6 rounded-md overflow-hidden flex items-center justify-center text-white text-[10px] font-bold shrink-0';
  applyTeamAvatarToElement(navAvatar, teamData);
}

function matchPresetId(url) {
  if (!url) return null;
  const found = avatarPresets.find((p) => p.url === url || url.endsWith(p.url));
  return found?.id || null;
}

async function loadAvatarPresets() {
  const r = await apiFetch('/api/profile/avatars');
  if (r.ok) avatarPresets = await parseJsonResponse(r);
}

function renderEditTeamAvatarPresetGrid() {
  const grid = document.getElementById('editTeamAvatarPresetGrid');
  const activeId = editTeamDraft.pendingFile ? null : (editTeamDraft.presetId || matchPresetId(editTeamDraft.avatar_url));
  grid.innerHTML = avatarPresets.map((p) => `
    <button type="button" onclick="selectEditTeamPreset('${p.id}')"
      class="avatar-preset-btn w-10 h-10 rounded-xl overflow-hidden p-0 border border-white/10 ${activeId === p.id ? 'selected' : ''}"
      title="${escHtml(p.label)}">
      <img src="${escHtml(p.url)}" alt="" class="w-full h-full object-cover" />
    </button>`).join('');
}

function updateEditTeamPreview() {
  const el = document.getElementById('editTeamAvatarPreview');
  const name = document.getElementById('editTeamName').value.trim() || teamData?.name || 'Team';
  if (editTeamDraft.pendingFile) {
    el.innerHTML = '';
    el.style.background = '';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(editTeamDraft.pendingFile);
    img.alt = '';
    img.className = 'w-full h-full object-cover';
    el.appendChild(img);
    return;
  }
  applyTeamAvatarToElement(el, {
    name,
    avatar_color: teamData?.avatar_color,
    avatar_url: editTeamDraft.avatar_url,
  });
}

function showEditTeamError(msg) {
  const el = document.getElementById('editTeamError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideEditTeamError() {
  document.getElementById('editTeamError').classList.add('hidden');
}

async function openEditTeamModal() {
  if (teamData?.userRole !== 'owner') return;
  hideEditTeamError();
  document.getElementById('editTeamName').value = teamData.name;
  document.getElementById('editTeamDesc').value = teamData.description || '';
  editTeamDraft = {
    presetId: matchPresetId(teamData.avatar_url),
    avatar_url: teamData.avatar_url,
    pendingFile: null,
  };
  document.getElementById('editTeamAvatarFile').value = '';
  if (!avatarPresets.length) await loadAvatarPresets();
  renderEditTeamAvatarPresetGrid();
  updateEditTeamPreview();
  applyGuestTeamAvatarUploadUi();
  resetEditTeamDetailsDrawer();
  document.getElementById('editTeamModal').classList.remove('hidden');
  pushTaskflowOverlay('editTeam');
  setTimeout(() => document.getElementById('editTeamName').focus(), 50);
}

function closeEditTeamModal() {
  document.getElementById('editTeamModal').classList.add('hidden');
  hideEditTeamError();
  resetEditTeamDetailsDrawer();
  dismissTaskflowOverlayHistory('editTeam');
}

function selectEditTeamPreset(presetId) {
  const preset = avatarPresets.find((p) => p.id === presetId);
  if (!preset) return;
  editTeamDraft.presetId = presetId;
  editTeamDraft.avatar_url = preset.url;
  editTeamDraft.pendingFile = null;
  renderEditTeamAvatarPresetGrid();
  updateEditTeamPreview();
}

async function saveEditTeam() {
  if (teamFormSaving || teamData?.userRole !== 'owner') return;
  const name = document.getElementById('editTeamName').value.trim();
  const description = document.getElementById('editTeamDesc').value.trim();
  if (!name) return showEditTeamError('Team name is required');

  hideEditTeamError();
  const btn = document.getElementById('editTeamSaveBtn');
  teamFormSaving = true;
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const patchR = await apiFetch(`/api/teams/${teamId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
  const patchD = await parseJsonResponse(patchR);
  if (!patchR.ok) {
    teamFormSaving = false;
    btn.disabled = false;
    btn.textContent = 'Save changes';
    return showEditTeamError(patchD.error || 'Failed to save team');
  }
  teamData = { ...teamData, ...patchD };

  if (editTeamDraft.pendingFile && !isGuest()) {
    const form = new FormData();
    form.append('avatar', editTeamDraft.pendingFile);
    const upR = await apiFetch(`/api/teams/${teamId}/avatar/upload`, { method: 'POST', body: form });
    const upD = await parseJsonResponse(upR);
    if (!upR.ok) {
      teamFormSaving = false;
      btn.disabled = false;
      btn.textContent = 'Save changes';
      applyTeamHeader();
      return showEditTeamError(upD.error || 'Team saved but avatar upload failed');
    }
    teamData = { ...teamData, ...upD.team };
  } else if (editTeamDraft.presetId && editTeamDraft.presetId !== matchPresetId(teamData.avatar_url)) {
    const presetR = await apiFetch(`/api/teams/${teamId}/avatar/preset`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset: editTeamDraft.presetId }),
    });
    const presetD = await parseJsonResponse(presetR);
    if (!presetR.ok) {
      teamFormSaving = false;
      btn.disabled = false;
      btn.textContent = 'Save changes';
      applyTeamHeader();
      return showEditTeamError(presetD.error || 'Team saved but avatar update failed');
    }
    teamData = { ...teamData, ...presetD.team };
  }

  teamFormSaving = false;
  btn.disabled = false;
  btn.textContent = 'Save changes';
  applyTeamHeader();
  closeEditTeamModal();
}

document.getElementById('editTeamAvatarFile')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  editTeamDraft.pendingFile = file;
  editTeamDraft.presetId = null;
  renderEditTeamAvatarPresetGrid();
  updateEditTeamPreview();
});

document.getElementById('editTeamName')?.addEventListener('input', updateEditTeamPreview);

function cancelInvite(userId, username) {
  const name = username || teamData?.pending_invites?.find((p) => String(p.id) === String(userId))?.username;
  if (!name) return;
  showConfirm({
    title: 'Cancel invite',
    message: `Cancel the invitation for ${name}? They will no longer see this team invite.`,
    confirmLabel: 'Cancel invite',
    danger: true,
    onConfirm: () => executeCancelInvite(userId),
  });
}

async function executeCancelInvite(userId) {
  const r = await apiFetch(`/api/teams/${teamId}/invites/${userId}`, { method: 'DELETE' });
  const d = await r.json();
  if (!r.ok) {
    showAlert(d.error || 'Failed to cancel invite');
    return;
  }
  await loadTeam();
}

function removeMember(userId, username) {
  const name = username || teamData?.members?.find(m => String(m.id) === String(userId))?.username;
  if (!name) return;
  showConfirm({
    title: 'Remove member',
    message: `Remove ${name} from this team? They will lose access to all tasks and activity.`,
    confirmLabel: 'Remove',
    danger: true,
    onConfirm: () => executeRemoveMember(userId),
  });
}

async function executeRemoveMember(userId) {
  const r = await apiFetch(`/api/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
  const d = await r.json();
  if (!r.ok) {
    showAlert(d.error || 'Failed to remove member');
    return;
  }
  await loadTeam();
}

function isRegisteredMemberEmail(email) {
  return String(email || '').trim().toLowerCase() !== GUEST_EMAIL;
}

function transferOwnershipCandidates() {
  return (teamData?.members || []).filter(
    (m) =>
      m.role !== 'owner' &&
      String(m.id) !== String(currentUser?.id) &&
      isRegisteredMemberEmail(m.email),
  );
}

function applyMembershipActionsUi() {
  const leaveSection = document.getElementById('teamPanelLeaveSection');
  const transferSection = document.getElementById('transferOwnershipSection');
  const canLeave =
    !isGuest() && teamData?.userRole === 'member';
  leaveSection?.classList.toggle('hidden', !canLeave);

  const candidates = transferOwnershipCandidates();
  const showTransfer =
    !isGuest() && teamData?.userRole === 'owner' && candidates.length > 0;
  transferSection?.classList.toggle('hidden', !showTransfer);
  const deleteBlock = document.getElementById('dangerZoneDeleteBlock');
  deleteBlock?.classList.toggle('border-t', showTransfer);
  deleteBlock?.classList.toggle('pt-4', showTransfer);
  const select = document.getElementById('transferOwnershipSelect');
  if (select && showTransfer) {
    select.innerHTML =
      '<option value="">Select a member…</option>' +
      candidates
        .map(
          (m) =>
            `<option value="${m.id}">${escHtml(m.username)} (${escHtml(m.email)})</option>`,
        )
        .join('');
  }
}

function confirmLeaveTeam() {
  const name = teamData?.name || 'this team';
  showConfirm({
    title: 'Leave team',
    message: `Leave "${name}"? You will lose access to this team, tasks, and chat.`,
    confirmLabel: 'Leave team',
    danger: true,
    onConfirm: () => executeLeaveTeam(),
  });
}

function stopTaskflowBackgroundWork() {
  clearInterval(pollInterval);
  clearInterval(chatPollInterval);
  clearInterval(presenceInterval);
  clearInterval(onlinePollInterval);
  pollInterval = null;
  chatPollInterval = null;
  presenceInterval = null;
  onlinePollInterval = null;
}

async function executeLeaveTeam() {
  closeSettingsPanelUi();
  closeTeamPanelUi();
  stopTaskflowBackgroundWork();
  setNavigatingAway(true);
  showNavigationLoading('Leaving team…');
  const r = await apiFetch(`/api/teams/${teamId}/leave`, { method: 'POST' });
  const d = await r.json();
  if (!r.ok) {
    hideNavigationLoading();
    showAlert(d.error || 'Could not leave team');
    startPolling();
    startChatPolling();
    startPresence();
    return;
  }
  window.location = '/dashboard';
}

function confirmTransferOwnership() {
  const select = document.getElementById('transferOwnershipSelect');
  const targetId = select?.value;
  if (!targetId) {
    showAlert('Choose a member to transfer ownership to.');
    return;
  }
  const target = teamData?.members?.find((m) => String(m.id) === String(targetId));
  const name = target?.username || 'this member';
  showConfirm({
    title: 'Transfer ownership',
    message: `Transfer ownership of "${teamData?.name || 'this team'}" to ${name}? You will become a member and they will control invites and settings.`,
    confirmLabel: 'Transfer ownership',
    danger: true,
    onConfirm: () => executeTransferOwnership(targetId),
  });
}

async function executeTransferOwnership(targetUserId) {
  closeSettingsPanelUi();
  closeTeamPanelUi();
  showNavigationLoading('Transferring ownership…');
  const r = await apiFetch(`/api/teams/${teamId}/transfer-ownership`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: targetUserId }),
  });
  const d = await r.json();
  if (!r.ok) {
    hideNavigationLoading();
    showAlert(d.error || 'Could not transfer ownership');
    return;
  }
  await loadTeam();
  hideNavigationLoading();
  showAlert('Ownership transferred. You are now a team member.', 'Done');
}

function deleteTeam() {
  if (isGuest() && isGuestProtectedTeam()) {
    showTeamDeleteLockModal();
    return;
  }
  const name = teamData?.name || 'this team';
  showConfirm({
    title: 'Delete team',
    message: `Delete "${name}" permanently? All tasks, comments, and activity will be lost. This cannot be undone.`,
    confirmLabel: 'Delete team',
    danger: true,
    onConfirm: () => executeDeleteTeam(),
  });
}

async function executeDeleteTeam() {
  closeSettingsPanelUi();
  closeTeamPanelUi();
  stopTaskflowBackgroundWork();
  setNavigatingAway(true);
  showNavigationLoading('Deleting team…');
  const r = await apiFetch(`/api/teams/${teamId}`, { method: 'DELETE' });
  const d = await r.json();
  if (!r.ok) {
    hideNavigationLoading();
    showAlert(d.error || 'Failed to delete team');
    startPolling();
    startChatPolling();
    startPresence();
    return;
  }
  window.location = '/dashboard';
}

function renderActivityItem(log) {
  const user = log.user || { username: 'Someone', avatar_color: '#4f6ef7' };
  return `<div class="flex gap-3 py-3 border-b border-white/5 last:border-0">
      ${userAvatarHtml(user, 'w-8 h-8 shrink-0')}
      <div class="min-w-0">
        <p class="text-gray-300 text-sm leading-relaxed">
          <span class="text-white font-medium">${escHtml(user.username)}</span>
          ${escHtml(log.description)}
        </p>
        <p class="text-gray-600 text-xs mt-0.5">${new Date(log.created_at).toLocaleString()}</p>
      </div>
    </div>`;
}

function renderActivity(batchScrollHint) {
  const list = document.getElementById('activityList');
  if (!list || !activityBatch) return;
  const prevHeight = list.scrollHeight;
  const scrollTop = list.scrollTop;
  const atBottom = list.scrollHeight - list.clientHeight - scrollTop < 48;
  const emptyHtml = '<p class="text-sm text-gray-600 text-center py-4">No activity yet.</p>';
  const { scrollToTop, scrollToBottom } = activityBatch.renderList(
    list,
    activityLogs,
    renderActivityItem,
    emptyHtml,
  );

  if (batchScrollHint === 'older' || scrollToBottom) {
    if (batchScrollHint === 'older' && !atBottom) {
      list.scrollTop = scrollTop + (list.scrollHeight - prevHeight);
    } else if (scrollToBottom) {
      list.scrollTop = list.scrollHeight;
    }
  } else if (batchScrollHint === 'newer' || scrollToTop) {
    list.scrollTop = 0;
  } else if (!atBottom && activityBatch.isAtLatest()) {
    list.scrollTop = scrollTop;
  }
}

async function loadActivity(options = {}) {
  const { background = false } = options;
  if (!background && !activityLogs.length) showActivityLoading();
  const r = await apiFetch(`/api/teams/${teamId}/activity`);
  const logs = await r.json();
  if (!Array.isArray(logs)) return;
  activityLogs = logs;
  renderActivity();
}
