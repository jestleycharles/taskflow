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
  if (typeof updateBalanceNavUi === 'function') updateBalanceNavUi();
  if (typeof applyTasksplitCurrencyUi === 'function') applyTasksplitCurrencyUi();
  if (typeof applyTasksplitModeUpgradeUi === 'function') applyTasksplitModeUpgradeUi();
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
  renderMemberAvatars(teamData?.members || []);
  applyTasksplitInviteUi();
  applyCurrentUserTeamRoleUi();
  applyMembershipActionsUi();
  if (typeof captureTeamRoleStateSig === 'function') captureTeamRoleStateSig();
  if (typeof initMentionComposers === 'function') initMentionComposers();
  return true;
}

async function refreshAll() {
  await loadWorkspace();
  await Promise.all([loadExpenses(), loadBalances()]);
  if (!document.getElementById('activityPanel').classList.contains('hidden')) {
    await loadActivity();
  }
  pollExpenseCommentsIfOpen();
}

function startPolling() {
  clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    await Promise.all([loadExpenses(), loadBalances()]);
    if (typeof pollTeamRoleStateForTasksplit === 'function') await pollTeamRoleStateForTasksplit();
    if (!document.getElementById('activityPanel').classList.contains('hidden')) {
      await loadActivity();
    }
    pollExpenseCommentsIfOpen();
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

    await Promise.all([loadExpenses(), loadBalances()]);
    applyChatComposerState();
    if (typeof loadChatReadState === 'function') await loadChatReadState();
    if (typeof loadChat === 'function') await loadChat();
    startPolling();
    if (typeof startChatPolling === 'function') startChatPolling();
    startPresence();
    // Zoom/pan disabled for now — re-enable when TASKSPLIT_ZOOM_ENABLED is true in zoom.js
    if (typeof TASKSPLIT_ZOOM_ENABLED !== 'undefined' && TASKSPLIT_ZOOM_ENABLED) {
      if (typeof initTaskflowZoom === 'function') initTaskflowZoom();
      if (typeof initTaskflowPan === 'function') initTaskflowPan();
      if (typeof scheduleTaskflowZoomRemeasure === 'function') scheduleTaskflowZoomRemeasure();
    }
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
  if (e.key === 'Enter' && !e.shiftKey && !e.defaultPrevented) {
    e.preventDefault();
    submitChatMessage();
  }
});
document.getElementById('chatMessagesList')?.addEventListener('scroll', () => {
  if (openReactionPicker || openReactorsPopover) syncReactionFloatUi();
}, { passive: true });

document.addEventListener('click', (e) => {
  if (e.target.closest('#reactionFloatLayer') || e.target.closest('[data-reaction-add]') || e.target.closest('[data-reaction-pill]')) return;
  if (openReactionPicker || openReactorsPopover) closeReactionFloats();
});

document.addEventListener('pointerdown', onReactionPillPointerDown);
document.addEventListener('pointermove', onReactionPillPointerMove);
document.addEventListener('pointerup', onReactionPillPointerUp);
document.addEventListener('pointercancel', clearReactionPress);
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('[data-reaction-pill]')) e.preventDefault();
});

expenseCommentBatch = MessageBatch.create({
  getMessages: () => expenseComments,
  getSearchText: (c) => [c.content || '', c.content_before_edit || '', c.user?.username || ''].join(' '),
  onBatchChange: (hint) => renderExpenseComments(hint),
});
expenseCommentBatch.bindListEvents(document.getElementById('expenseCommentsList'));

document.getElementById('expenseCommentSearch')?.addEventListener('input', (e) => {
  expenseCommentBatch?.setSearchQuery(e.target.value);
  renderExpenseComments();
});

document.getElementById('expenseCommentInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.defaultPrevented) {
    e.preventDefault();
    submitExpenseComment();
  }
});

document.getElementById('expenseCommentAttachBtn')?.addEventListener('click', () => {
  document.getElementById('expenseCommentAttachInput')?.click();
});
document.getElementById('expenseCommentAttachInput')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) setExpenseCommentPendingFile(file);
});
document.getElementById('expenseCommentAttachClearBtn')?.addEventListener('click', clearExpenseCommentPendingFile);

document.getElementById('expensePaidBy')?.addEventListener('change', () => {
  const payerId = document.getElementById('expensePaidBy')?.value;
  if (!payerId) return;
  const cb = document.querySelector(`.expense-participant-cb[value="${CSS.escape(payerId)}"]`);
  if (cb) cb.checked = true;
  onExpenseParticipantsChange?.();
});

document.getElementById('expenseAmount')?.addEventListener('input', () => {
  updateExpenseSplitHint?.();
});

document.getElementById('expenseAttachInput')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (file) uploadExpenseAttachment(file);
});

document.getElementById('expenseDetailTabDetails')?.addEventListener('click', (e) => {
  const el = e.target.closest('[data-preview-attachment]');
  if (!el) return;
  e.preventDefault();
  openAttachmentPreview(el.dataset.url, el.dataset.name, el.dataset.mime);
});

document.getElementById('expenseCommentsList')?.addEventListener('click', (e) => {
  const el = e.target.closest('[data-preview-attachment]');
  if (!el) return;
  e.preventDefault();
  openAttachmentPreview(el.dataset.url, el.dataset.name, el.dataset.mime);
});
document.getElementById('expenseCommentsList')?.addEventListener('scroll', () => {
  if (openReactionPicker || openReactorsPopover) syncReactionFloatUi();
}, { passive: true });

document.getElementById('chatMessagesList')?.addEventListener('click', (e) => {
  const el = e.target.closest('[data-preview-attachment]');
  if (!el) return;
  e.preventDefault();
  openAttachmentPreview(el.dataset.url, el.dataset.name, el.dataset.mime);
});

document.getElementById('memberList')?.addEventListener('click', (e) => {
  const cancelBtn = e.target.closest('.cancel-invite-btn');
  if (cancelBtn) {
    cancelInvite(cancelBtn.dataset.userId, cancelBtn.dataset.username);
    return;
  }
  const btn = e.target.closest('.remove-member-btn');
  if (!btn) return;
  removeMember(btn.dataset.userId, btn.dataset.username);
});

document.getElementById('memberList')?.addEventListener('change', (e) => {
  const sel = e.target.closest('.assign-role-select');
  if (!sel) return;
  assignMemberCustomRole(sel.dataset.userId, sel.value || null);
});

document.getElementById('teamRoleColorSwatches')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-hex]');
  if (!btn) return;
  setTeamRoleFormColor(btn.dataset.hex);
});
document.getElementById('teamRoleColorPicker')?.addEventListener('input', (e) => {
  setTeamRoleFormColor(e.target.value);
});
document.getElementById('teamRoleHexInput')?.addEventListener('input', (e) => {
  const hex = normalizeRoleHex(e.target.value);
  if (hex) setTeamRoleFormColor(hex);
});
if (typeof ROLE_PRESET_COLORS !== 'undefined') renderTeamRoleColorSwatches(ROLE_PRESET_COLORS[0]);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('attachmentPreviewModal')?.classList.contains('hidden')) {
    closeAttachmentPreview();
  }
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
