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

function closeAllSidePanels() {
  closeActivityPanel();
  closeTeamPanel();
  closeBalancePanel();
  closeSettingsPanelUi?.();
  closeChatPanelUi?.();
}

function applySettingsNavUi() {
  const btn = document.getElementById('settingsNavBtn');
  if (btn) btn.classList.toggle('hidden', teamData?.userRole !== 'owner');
}

function applyCurrentUserTeamRoleUi() {
  applySettingsNavUi();
  const leaveSection = document.getElementById('teamPanelLeaveSection');
  if (leaveSection) {
    leaveSection.classList.toggle('hidden', teamData?.userRole === 'owner');
  }
}

function isGuest() {
  return !!currentUser?.is_guest;
}

function memberNameHtml(memberOrUser, userId, extraClass = '') {
  const user = memberOrUser || {};
  if (!user?.username) return `<span class="${extraClass}">?</span>`;
  const crown = user.role === 'owner' ? '👑 ' : '';
  return `<span class="font-medium ${extraClass}">${crown}${escHtml(user.username)}</span>`;
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

function setSidePanelMobileOpen(open) {
  document.body.classList.toggle('side-panel-mobile-open', open && TF_VIEWPORT.isMobile());
  document.getElementById('panelMobileBackdrop')?.classList.toggle('hidden', !open || !TF_VIEWPORT.isMobile());
}

function applyChatComposerState() {
  const guest = isGuest();
  document.getElementById('chatComposerActive')?.classList.toggle('hidden', guest);
  document.getElementById('chatGuestNotice')?.classList.toggle('hidden', !guest);
  document.getElementById('chatAttachPreview')?.classList.toggle('hidden', guest || !chatPendingFile);
  if (guest && typeof clearChatPendingFile === 'function') clearChatPendingFile();
}
