/**
 * TaskSplit page bootstrap.
 */

function applyTeamHeader() {
  const team = workspaceData?.team;
  if (!team) return;

  document.title = `${team.name} — TaskSplit`;
  document.getElementById('teamName').textContent = team.name;

  const modeIcon = document.getElementById('teamModeIcon');
  if (modeIcon) {
    modeIcon.innerHTML = team.expense_mode ? taskSplitModeIconHtml(team.expense_mode) : '';
  }

  const navAvatar = document.getElementById('teamNavAvatar');
  applyTeamAvatarToElement(navAvatar, team);

  const members = workspaceData.members || [];
  const container = document.getElementById('memberAvatars');
  container.innerHTML = members
    .slice(0, 4)
    .map((m) => userAvatarHtml(m, 'w-7 h-7 pointer-events-none'))
    .join('');

  syncTeamDataFromWorkspace();
  updateMemberStatsDisplay();
  applySettingsNavUi();
}

async function loadWorkspace() {
  const r = await apiFetch(`/api/teams/${teamId}/tasksplit`);
  const data = await parseJsonResponse(r);

  if (!r.ok) {
    if (r.status === 400) {
      window.location = `/taskflow/${teamId}`;
      return false;
    }
    if (r.status === 403 || r.status === 404) {
      window.location = '/dashboard';
      return false;
    }
    showAlert(data.error || 'Failed to load workspace');
    return false;
  }

  workspaceData = data;
  balances = data.balances;
  syncTeamDataFromWorkspace();
  applyTeamHeader();
  renderBalances();
  applyTasksplitInviteUi();
  applyCurrentUserTeamRoleUi();
  applyMembershipActionsUi();
  return true;
}

async function refreshAll() {
  await loadWorkspace();
  await loadExpenses();
  await loadBalances();
  if (!document.getElementById('activityPanel').classList.contains('hidden')) {
    await loadActivity();
  }
}

function startPolling() {
  clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    await loadExpenses();
    await loadBalances();
    if (!document.getElementById('activityPanel').classList.contains('hidden')) {
      await loadActivity();
    }
  }, POLL_MS);
}

async function init() {
  showNavigationLoading('Loading TaskSplit…');
  try {
    const meR = await apiFetch('/api/me');
    const meData = await parseJsonResponse(meR);
    if (!meR.ok) {
      if (meR.status === 401) {
        window.location = '/login';
        return;
      }
      return;
    }
    currentUser = meData;
    if (currentUser.is_guest) {
      window.location = '/dashboard';
      return;
    }

    const ok = await loadWorkspace();
    if (!ok) return;

    await loadExpenses();
    applyChatComposerState();
    if (typeof loadChatReadState === 'function') await loadChatReadState();
    if (typeof loadChat === 'function') await loadChat();
    startPolling();
    if (typeof startChatPolling === 'function') startChatPolling();
    startPresence();
    if (typeof initTaskflowZoom === 'function') initTaskflowZoom();
    if (typeof initTaskflowPan === 'function') initTaskflowPan();
    if (typeof scheduleTaskflowZoomRemeasure === 'function') scheduleTaskflowZoomRemeasure();
  } finally {
    hideNavigationLoading();
  }
}

chatBatch = MessageBatch.create({
  getMessages: () => chatMessages,
  getSearchText: (m) => {
    const parts = [m.content || ''];
    if (m.content_before_edit) parts.push(m.content_before_edit);
    if (m.user?.username) parts.push(m.user.username);
    return parts.join(' ');
  },
  onBatchChange: (hint) => renderChatMessages(hint),
});
chatBatch.bindListEvents(document.getElementById('chatMessagesList'));

document.getElementById('chatMessageSearch')?.addEventListener('input', (e) => {
  chatBatch?.setSearchQuery(e.target.value);
  renderChatMessages();
});

document.getElementById('chatInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.defaultPrevented) submitChatMessage();
});
document.getElementById('chatAttachBtn')?.addEventListener('click', () => {
  if (isGuest()) return;
  document.getElementById('chatAttachInput')?.click();
});
document.getElementById('chatAttachInput')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file && typeof setChatPendingFile === 'function') setChatPendingFile(file);
});
document.getElementById('chatAttachClearBtn')?.addEventListener('click', () => {
  if (typeof clearChatPendingFile === 'function') clearChatPendingFile();
});

const chatInput = document.getElementById('chatInput');
if (chatInput && typeof MentionAutocomplete !== 'undefined') {
  MentionAutocomplete.attach(chatInput, { getTeamData: () => teamData });
}

document.getElementById('activityMessageSearch')?.addEventListener('input', (e) => {
  activitySearchQuery = e.target.value;
  renderActivity();
});

document.getElementById('editTeamAvatarFile')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  editTeamDraft.pendingFile = file;
  editTeamDraft.presetId = null;
  if (typeof renderEditTeamAvatarPresetGrid === 'function') renderEditTeamAvatarPresetGrid();
  if (typeof updateEditTeamPreview === 'function') updateEditTeamPreview();
});

document.getElementById('editTeamName')?.addEventListener('input', () => {
  if (typeof updateEditTeamPreview === 'function') updateEditTeamPreview();
});

window.tfResetPageNavigationUi = () => {
  hideNavigationLoading();
};

window.addEventListener('popstate', () => {
  if (!taskflowHistoryPopping) resetTransientNavigationUi?.();
  if (taskflowHistoryPopping) {
    taskflowHistoryPopping = false;
    return;
  }
  const overlay = getTopTaskflowOverlay();
  if (overlay) closeTaskflowOverlayUi(overlay);
});

init();
