/**
 * TaskSplit team settings — adapted from taskflow/panels.js
 */

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
  if (!grid) return;
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
  if (!el) return;
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

function selectEditTeamPreset(presetId) {
  const preset = avatarPresets.find((p) => p.id === presetId);
  if (!preset) return;
  editTeamDraft.presetId = presetId;
  editTeamDraft.avatar_url = preset.url;
  editTeamDraft.pendingFile = null;
  renderEditTeamAvatarPresetGrid();
  updateEditTeamPreview();
}

function applyGuestTeamAvatarUploadUi() {
  const guest = isGuest();
  document.getElementById('editTeamAvatarUploadLabel')?.classList.toggle('hidden', guest);
  document.getElementById('editTeamAvatarUploadGuestNote')?.classList.toggle('hidden', !guest);
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

async function reloadWorkspace() {
  await refreshAll();
  syncTeamDataFromWorkspace();
  applyTeamHeader();
  renderMemberList(teamData?.members || []);
  applyCurrentUserTeamRoleUi();
  applyMembershipActionsUi();
  if (typeof captureTeamRoleStateSig === 'function') captureTeamRoleStateSig();
}

function applyTasksplitCurrencyUi() {
  const section = document.getElementById('tasksplitCurrencySection');
  const select = document.getElementById('tasksplitCurrencySelect');
  const isOwner = teamData?.userRole === 'owner';
  section?.classList.toggle('hidden', !isOwner);
  if (select) {
    select.value = getTeamCurrencyCode();
    select.disabled = !isOwner;
  }
}

function showTasksplitCurrencyMsg(text, ok) {
  const msg = document.getElementById('tasksplitCurrencyMsg');
  if (!msg) return;
  if (!text) {
    msg.classList.add('hidden');
    return;
  }
  msg.textContent = text;
  msg.className = `text-xs mt-1 ${ok ? 'text-emerald-400' : 'text-red-400'}`;
  msg.classList.remove('hidden');
}

async function saveTasksplitCurrency() {
  if (teamData?.userRole !== 'owner') return;
  const select = document.getElementById('tasksplitCurrencySelect');
  const code = select?.value;
  if (!code || code === getTeamCurrencyCode()) return;

  select.disabled = true;
  showTasksplitCurrencyMsg('Saving…', true);
  const r = await apiFetch(`/api/teams/${teamId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currency_code: code }),
  });
  const data = await parseJsonResponse(r);
  select.disabled = false;
  if (!r.ok) {
    select.value = getTeamCurrencyCode();
    showTasksplitCurrencyMsg(data.error || 'Failed to save currency', false);
    return;
  }
  if (workspaceData?.team) workspaceData.team.currency_code = data.currency_code;
  if (teamData) teamData.currency_code = data.currency_code;
  showTasksplitCurrencyMsg('Currency updated', true);
  updateSummaryBar?.();
  renderExpensesList?.();
  renderBalances?.();
  setTimeout(() => showTasksplitCurrencyMsg('', true), 2000);
}

function openSettingsPanel() {
  if (teamData?.userRole !== 'owner') return;
  closeTaskflowOverlayBeforeOpen('settings');
  if (chatPanelOpen) closeChatPanelUi();
  closeAllPanels();
  document.getElementById('settingsPanel').classList.remove('hidden');
  setSidePanelMobileOpen(true);
  pushTaskflowOverlay('settings');
  applyMembershipActionsUi();
  applyTasksplitCurrencyUi();
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
  document.getElementById('editTeamName').value = teamData.name || '';
  document.getElementById('editTeamDesc').value = teamData.description || '';
  editTeamDraft = {
    presetId: typeof matchPresetId === 'function' ? matchPresetId(teamData.avatar_url) : null,
    avatar_url: teamData.avatar_url,
    pendingFile: null,
  };
  document.getElementById('editTeamAvatarFile').value = '';
  if (typeof loadAvatarPresets === 'function' && !avatarPresets.length) await loadAvatarPresets();
  if (typeof renderEditTeamAvatarPresetGrid === 'function') renderEditTeamAvatarPresetGrid();
  if (typeof updateEditTeamPreview === 'function') updateEditTeamPreview();
  if (typeof applyGuestTeamAvatarUploadUi === 'function') applyGuestTeamAvatarUploadUi();
  if (typeof resetEditTeamDetailsDrawer === 'function') resetEditTeamDetailsDrawer();
  document.getElementById('editTeamModal').classList.remove('hidden');
  pushTaskflowOverlay('editTeam');
  setTimeout(() => document.getElementById('editTeamName').focus(), 50);
}

function closeEditTeamModal() {
  document.getElementById('editTeamModal').classList.add('hidden');
  hideEditTeamError();
  if (typeof resetEditTeamDetailsDrawer === 'function') resetEditTeamDetailsDrawer();
  dismissTaskflowOverlayHistory('editTeam');
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

  if (editTeamDraft.pendingFile && !isGuest()) {
    const form = new FormData();
    form.append('avatar', editTeamDraft.pendingFile);
    const upR = await apiFetch(`/api/teams/${teamId}/avatar/upload`, { method: 'POST', body: form });
    const upD = await parseJsonResponse(upR);
    if (!upR.ok) {
      teamFormSaving = false;
      btn.disabled = false;
      btn.textContent = 'Save changes';
      await reloadWorkspace();
      return showEditTeamError(upD.error || 'Team saved but avatar upload failed');
    }
    patchD.avatar_url = upD.team?.avatar_url;
    patchD.avatar_color = upD.team?.avatar_color;
  } else if (
    editTeamDraft.presetId &&
    typeof matchPresetId === 'function' &&
    editTeamDraft.presetId !== matchPresetId(teamData.avatar_url)
  ) {
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
      await reloadWorkspace();
      return showEditTeamError(presetD.error || 'Team saved but avatar update failed');
    }
    Object.assign(patchD, presetD.team || {});
  }

  if (workspaceData?.team) Object.assign(workspaceData.team, patchD);
  teamFormSaving = false;
  btn.disabled = false;
  btn.textContent = 'Save changes';
  await reloadWorkspace();
  closeEditTeamModal();
}

function isRegisteredMemberEmail(email) {
  return String(email || '').trim().toLowerCase() !== 'guest@taskflow.app';
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
  const canLeave = !isGuest() && teamData?.userRole === 'member';
  leaveSection?.classList.toggle('hidden', !canLeave);

  const candidates = transferOwnershipCandidates();
  const showTransfer = !isGuest() && teamData?.userRole === 'owner' && candidates.length > 0;
  transferSection?.classList.toggle('hidden', !showTransfer);
  const deleteBlock = document.getElementById('dangerZoneDeleteBlock');
  deleteBlock?.classList.toggle('border-t', showTransfer);
  deleteBlock?.classList.toggle('pt-4', showTransfer);
  const select = document.getElementById('transferOwnershipSelect');
  if (select && showTransfer) {
    select.innerHTML =
      '<option value="">Select a member…</option>' +
      candidates.map((m) => `<option value="${m.id}">${escHtml(m.username)} (${escHtml(m.email)})</option>`).join('');
  }
}

function confirmLeaveTeam() {
  const name = teamData?.name || 'this team';
  showConfirm({
    title: 'Leave team',
    message: `Leave "${name}"? You will lose access to this team and its expenses.`,
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
  leavePresence();
  showNavigationLoading('Leaving team…');
  const r = await apiFetch(`/api/teams/${teamId}/leave`, { method: 'POST' });
  const d = await r.json();
  if (!r.ok) {
    hideNavigationLoading();
    showAlert(d.error || 'Could not leave team');
    startPolling();
    if (typeof startChatPolling === 'function') startChatPolling();
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
    message: `Transfer ownership of "${teamData?.name || 'this team'}" to ${name}?`,
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
  await reloadWorkspace();
  hideNavigationLoading();
  showAlert('Ownership transferred. You are now a team member.', 'Done');
}

function deleteTeam() {
  if (isGuest() && typeof isGuestProtectedTeam === 'function' && isGuestProtectedTeam()) {
    showTeamDeleteLockModal();
    return;
  }
  const name = teamData?.name || 'this team';
  showConfirm({
    title: 'Delete team',
    message: `Delete "${name}" permanently? All expenses, chat, and activity will be lost.`,
    confirmLabel: 'Delete team',
    danger: true,
    onConfirm: () => executeDeleteTeam(),
  });
}

async function executeDeleteTeam() {
  closeSettingsPanelUi();
  closeTeamPanelUi();
  stopTaskflowBackgroundWork();
  leavePresence();
  showNavigationLoading('Deleting team…');
  const r = await apiFetch(`/api/teams/${teamId}`, { method: 'DELETE' });
  const d = await r.json();
  if (!r.ok) {
    hideNavigationLoading();
    showAlert(d.error || 'Failed to delete team');
    startPolling();
    if (typeof startChatPolling === 'function') startChatPolling();
    startPresence();
    return;
  }
  window.location = '/dashboard';
}
