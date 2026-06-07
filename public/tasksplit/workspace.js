/**
 * TaskSplit workspace bridge — sync teamData for shared taskflow modules.
 */

function syncTeamDataFromWorkspace() {
  if (!workspaceData) {
    teamData = null;
    return;
  }
  const team = workspaceData.team || {};
  teamData = {
    ...team,
    team,
    members: workspaceData.members || [],
    roles: workspaceData.roles || [],
    pending_invites: workspaceData.pending_invites || [],
    separate_role_members: !!workspaceData.separate_role_members,
    userRole: workspaceData.role,
    role: workspaceData.role,
    member_count: workspaceData.members?.length ?? 0,
    online_count: workspaceData.online_count ?? onlineUserIds.size,
    owner_is_guest: workspaceData.owner_is_guest,
  };
}

function updateMemberStatsDisplay() {
  const total = teamData?.member_count ?? teamData?.members?.length ?? 0;
  const online = teamData?.online_count ?? onlineUserIds.size;
  const el = document.getElementById('teamMemberStats');
  const btnEl = document.getElementById('teamBtnMemberStats');
  const panelEl = document.getElementById('teamPanelMemberStats');
  if (el) {
    el.innerHTML = memberStatsWithDotHtml(online, total);
    el.classList.toggle('hidden', !total);
  }
  if (btnEl) {
    btnEl.innerHTML = total ? ` · ${memberStatsWithDotHtml(online, total)}` : '';
  }
  if (panelEl) {
    panelEl.innerHTML = total
      ? `${total} member${total === 1 ? '' : 's'} · ${memberStatsWithDotHtml(online, total)}`
      : '';
  }
}

function renderMemberAvatars(members) {
  const container = document.getElementById('memberAvatars');
  if (!container) return;
  container.innerHTML = (members || [])
    .slice(0, 4)
    .map((m) => userAvatarHtml(m, 'w-7 h-7 pointer-events-none'))
    .join('');
}

function renderMemberList(members) {
  const list = document.getElementById('memberList');
  if (!list) return;
  const isOwner = teamData?.userRole === 'owner';
  const assignHint = isOwner && typeof canAssignTeamRoles === 'function' && canAssignTeamRoles()
    ? '<p class="text-xs text-gray-500 mb-3 shrink-0">Assign a display role to each member (owner cannot be changed). Pending invites cannot be assigned roles until they accept.</p>'
    : '';
  list.innerHTML = assignHint + renderMemberSectionsHtml(membersWithPending(members || []), {
    showAssign: typeof canAssignTeamRoles === 'function' && canAssignTeamRoles(),
    showRemove: isOwner,
    showPermissionRole: !(typeof canAssignTeamRoles === 'function' && canAssignTeamRoles()),
  });
}

function closeAllSidePanels() {
  closeActivityPanelUi?.();
  closeTeamPanelUi?.();
  closeBalancePanelUi?.();
  closeSettingsPanelUi?.();
  closeChatPanelUi?.();
}

function applySettingsNavUi() {
  const btn = document.getElementById('settingsNavBtn');
  if (btn) btn.classList.toggle('hidden', teamData?.userRole !== 'owner');
}

function isGuest() {
  return !!currentUser?.is_guest;
}

function isUserOnline(userId) {
  return onlineUserIds.has(String(userId));
}

function memberAvatarHtml(user, sizeClass = 'w-8 h-8') {
  const online = isUserOnline(user?.id);
  const title = online ? 'Online' : escHtml(user?.username || '?');
  return `<div class="relative shrink-0 self-start ${sizeClass.split(' ')[0]} ${sizeClass.split(' ')[1] || ''}" title="${title}">
      ${userAvatarHtml(user, sizeClass)}
      ${online ? '<span class="online-dot absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-ink-800" title="Online"></span>' : ''}
    </div>`;
}

function chatMessageAvatarHtml(user, userId) {
  const id = userId || user?.id;
  const online = id && isUserOnline(id);
  const title = online ? 'Online' : escHtml(user?.username || '?');
  return `<div class="relative shrink-0 self-start w-8 h-8" title="${title}">
      ${userAvatarHtml(user, 'w-8 h-8')}
      ${online ? '<span class="online-dot absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-ink-800" title="Online"></span>' : ''}
    </div>`;
}

function setSidePanelMobileOpen(open) {
  document.body.classList.toggle('side-panel-mobile-open', open && TF_VIEWPORT.isMobile());
  document.getElementById('panelMobileBackdrop')?.classList.toggle('hidden', !open || !TF_VIEWPORT.isMobile());
}

function clearChatPendingFile() {
  chatPendingFile = null;
  if (chatAttachPreviewUrl) {
    URL.revokeObjectURL(chatAttachPreviewUrl);
    chatAttachPreviewUrl = null;
  }
  const input = document.getElementById('chatAttachInput');
  if (input) input.value = '';
  document.getElementById('chatAttachPreview')?.classList.add('hidden');
}

function renderChatAttachPreview() {
  const wrap = document.getElementById('chatAttachPreview');
  const thumb = document.getElementById('chatAttachPreviewThumb');
  const nameEl = document.getElementById('chatAttachPreviewName');
  const sizeEl = document.getElementById('chatAttachPreviewSize');
  if (!wrap || !chatPendingFile) {
    wrap?.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  if (nameEl) nameEl.textContent = chatPendingFile.name;
  if (sizeEl) sizeEl.textContent = formatFileSize(chatPendingFile.size);
  if (thumb) {
    if (chatAttachPreviewUrl) URL.revokeObjectURL(chatAttachPreviewUrl);
    if (chatPendingFile.type.startsWith('image/')) {
      chatAttachPreviewUrl = URL.createObjectURL(chatPendingFile);
      thumb.innerHTML = `<img src="${chatAttachPreviewUrl}" alt="" class="attachment-file-thumb" />`;
    } else {
      chatAttachPreviewUrl = null;
      thumb.innerHTML = `<div class="attachment-file-icon">${attachmentFileIconHtml(chatPendingFile.type)}</div>`;
    }
  }
}

function setChatPendingFile(file) {
  if (!file || isGuest()) return;
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  if (!allowed.includes(file.type)) {
    showAlert('File type not allowed. Use JPEG, PNG, WebP, GIF, or PDF.');
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    showAlert('File must be 8 MB or smaller.');
    return;
  }
  chatPendingFile = file;
  renderChatAttachPreview();
  applyChatComposerState();
}

function applyChatComposerState() {
  const guest = isGuest();
  document.getElementById('chatComposerActive')?.classList.toggle('hidden', guest);
  document.getElementById('chatGuestNotice')?.classList.toggle('hidden', !guest);
  document.getElementById('chatAttachPreview')?.classList.toggle('hidden', guest || !chatPendingFile);
  if (guest && typeof clearChatPendingFile === 'function') clearChatPendingFile();
}

async function pollTeamRoleStateForTasksplit() {
  if (typeof pollTeamRoleState === 'function') {
    await pollTeamRoleState();
    if (workspaceData && teamData) {
      workspaceData.members = teamData.members;
      workspaceData.roles = teamData.roles;
      workspaceData.pending_invites = teamData.pending_invites;
      workspaceData.separate_role_members = teamData.separate_role_members;
      workspaceData.role = teamData.userRole;
    }
  }
}

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
  await reloadWorkspace();
}

function removeMember(userId, username) {
  const name = username || teamData?.members?.find((m) => String(m.id) === String(userId))?.username;
  if (!name) return;
  showConfirm({
    title: 'Remove member',
    message: `Remove ${name} from this team? They will lose access to all expenses and activity.`,
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
  await reloadWorkspace();
}
