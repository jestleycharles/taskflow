/**
 * board/boot.js
 * DOM event wiring and page bootstrap. Load last.
 * Depends on: all other board/* modules.
 */

document.getElementById('commentInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.defaultPrevented) submitComment();
});
document.getElementById('commentAttachBtn')?.addEventListener('click', () => {
  if (isGuest()) return;
  document.getElementById('commentAttachInput')?.click();
});
document.getElementById('commentAttachInput')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) setCommentPendingFile(file);
});
document.getElementById('commentAttachClearBtn')?.addEventListener('click', clearCommentPendingFile);
document.getElementById('commentsList')?.addEventListener('click', (e) => {
  const el = e.target.closest('[data-preview-attachment]');
  if (!el) return;
  e.preventDefault();
  openAttachmentPreview(el.dataset.url, el.dataset.name, el.dataset.mime);
});
document.getElementById('commentsList')?.addEventListener('scroll', () => {
  if (openReactionPicker || openReactorsPopover) syncReactionFloatUi();
  if (openMentionRolePopover) closeMentionRolePopover();
}, { passive: true });

document.getElementById('taskAttachmentsList')?.addEventListener('click', (e) => {
  const el = e.target.closest('[data-preview-attachment]');
  if (!el) return;
  e.preventDefault();
  openAttachmentPreview(el.dataset.url, el.dataset.name, el.dataset.mime);
});

document.getElementById('taskCoverPreview')?.addEventListener('click', (e) => {
  const img = e.target.closest('[data-preview-cover]') || e.target.closest('#taskCoverPreview')?.querySelector('[data-preview-cover]');
  if (!img?.dataset.url) return;
  openAttachmentPreview(img.dataset.url, 'Cover image', 'image/jpeg');
});

document.getElementById('taskDetailCoverPreviewInline')?.addEventListener('click', (e) => {
  const img = e.target.closest('[data-preview-cover]') || e.target.closest('#taskDetailCoverPreviewInline')?.querySelector('[data-preview-cover]');
  if (!img?.dataset.url) return;
  openAttachmentPreview(img.dataset.url, 'Cover image', 'image/jpeg');
});

document.getElementById('kanbanBoard')?.addEventListener('click', (e) => {
  const cover = e.target.closest('[data-preview-cover]');
  if (!cover?.dataset.url) return;
  e.stopPropagation();
  e.preventDefault();
  openAttachmentPreview(cover.dataset.url, cover.dataset.name || 'Cover', cover.dataset.mime || 'image/jpeg');
}, true);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('attachmentPreviewModal')?.classList.contains('hidden')) {
    closeAttachmentPreview();
  }
});

document.addEventListener('click', (e) => {
  if (e.target.closest('#reactionFloatLayer') || e.target.closest('[data-reaction-add]') || e.target.closest('[data-reaction-pill]')) return;
  if (openReactionPicker || openReactorsPopover) closeReactionFloats();
  if (!e.target.closest('.mention-role') && !e.target.closest('#mentionFloatLayer')) closeMentionRolePopover();
});

document.addEventListener('pointerdown', onReactionPillPointerDown);
document.addEventListener('pointermove', onReactionPillPointerMove);
document.addEventListener('pointerup', onReactionPillPointerUp);
document.addEventListener('pointercancel', clearReactionPress);
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('[data-reaction-pill]')) e.preventDefault();
});

document.getElementById('chatInput')?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.defaultPrevented) {
    e.preventDefault();
    submitChatMessage();
  }
});

document.getElementById('chatAttachBtn')?.addEventListener('click', () => {
  if (isGuest()) return;
  document.getElementById('chatAttachInput')?.click();
});
document.getElementById('chatAttachInput')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) setChatPendingFile(file);
});
document.getElementById('chatAttachClearBtn')?.addEventListener('click', clearChatPendingFile);
document.getElementById('chatMessagesList')?.addEventListener('click', (e) => {
  const el = e.target.closest('[data-preview-attachment]');
  if (!el) return;
  e.preventDefault();
  openAttachmentPreview(el.dataset.url, el.dataset.name, el.dataset.mime);
});

document.getElementById('chatMessagesList')?.addEventListener('scroll', () => {
  if (openReactionPicker || openReactorsPopover) syncReactionFloatUi();
  if (openMentionRolePopover) closeMentionRolePopover();
}, { passive: true });

function onMentionRolePointerDown(e) {
  const el = e.target.closest('.mention-role');
  if (!el || e.button !== 0) return;
  const commentRow = el.closest('[data-comment-id]');
  if (commentRow?.dataset.guestNoMentions === '1') return;
  clearMentionRolePress();
  mentionRolePress = {
    el,
    startX: e.clientX,
    startY: e.clientY,
    longFired: false,
    timer: setTimeout(() => {
      if (!mentionRolePress || mentionRolePress.el !== el) return;
      mentionRolePress.longFired = true;
      showMentionRolePopover(el);
    }, MENTION_ROLE_LONG_PRESS_MS),
  };
}

function onMentionRolePointerMove(e) {
  if (!mentionRolePress) return;
  const moved = Math.hypot(e.clientX - mentionRolePress.startX, e.clientY - mentionRolePress.startY);
  if (moved > 12) clearMentionRolePress();
}

function onMentionRolePointerUp(e) {
  const el = e.target.closest('.mention-role');
  if (!mentionRolePress || !el || mentionRolePress.el !== el) {
    clearMentionRolePress();
    return;
  }
  clearTimeout(mentionRolePress.timer);
  const wasLong = mentionRolePress.longFired;
  clearMentionRolePress();
  if (wasLong) {
    e.preventDefault();
    return;
  }
}

document.addEventListener('pointerdown', onMentionRolePointerDown);
document.addEventListener('pointermove', onMentionRolePointerMove);
document.addEventListener('pointerup', onMentionRolePointerUp);
document.addEventListener('pointercancel', clearMentionRolePress);

document.addEventListener('mouseover', (e) => {
  if (!(e.target instanceof Element)) return;
  const el = e.target.closest('.mention-role');
  if (!el) return;
  if (el.closest('[data-guest-no-mentions="1"]')) return;
  showMentionRolePopover(el);
});

document.addEventListener('mouseout', (e) => {
  if (!(e.target instanceof Element)) return;
  const from = e.target.closest('.mention-role');
  const to = e.relatedTarget instanceof Element
    ? e.relatedTarget.closest('.mention-role, #mentionFloatLayer')
    : null;
  if (from && !to) closeMentionRolePopover();
});

document.getElementById('memberList').addEventListener('click', (e) => {
  const cancelBtn = e.target.closest('.cancel-invite-btn');
  if (cancelBtn) {
    cancelInvite(cancelBtn.dataset.userId, cancelBtn.dataset.username);
    return;
  }
  const btn = e.target.closest('.remove-member-btn');
  if (!btn) return;
  removeMember(btn.dataset.userId, btn.dataset.username);
});

document.getElementById('memberList').addEventListener('change', (e) => {
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

renderTeamRoleColorSwatches(ROLE_PRESET_COLORS[0]);

document.getElementById('columnColorSwatches')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-hex]');
  if (!btn) return;
  setColumnFormColor(btn.dataset.hex);
});
document.getElementById('columnColorPicker')?.addEventListener('input', (e) => {
  setColumnFormColor(e.target.value);
});
document.getElementById('columnHexInput')?.addEventListener('input', (e) => {
  const hex = normalizeRoleHex(e.target.value);
  if (hex) setColumnFormColor(hex);
});

renderColumnColorSwatches(ROLE_PRESET_COLORS[0]);

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

commentBatch = MessageBatch.create({
  getMessages: () => taskComments,
  getSearchText: commentSearchText,
  onBatchChange: (hint) => renderComments(hint),
});
commentBatch.bindListEvents(document.getElementById('commentsList'));

activityBatch = MessageBatch.create({
  batchSize: 50,
  anchor: 'start',
  getMessages: () => activityLogs,
  getSearchText: (l) => [l.description || '', l.user?.username || ''].join(' '),
  emptySearchHtml: '<p class="text-sm text-gray-600 text-center py-8">No activity matches your search.</p>',
  onBatchChange: (hint) => renderActivity(hint),
});
activityBatch.bindListEvents(document.getElementById('activityList'));

document.getElementById('chatMessageSearch')?.addEventListener('input', (e) => {
  chatBatch?.setSearchQuery(e.target.value);
  renderChatMessages();
});
document.getElementById('commentMessageSearch')?.addEventListener('input', (e) => {
  commentBatch?.setSearchQuery(e.target.value);
  renderComments();
});
document.getElementById('activityMessageSearch')?.addEventListener('input', (e) => {
  activityBatch?.setSearchQuery(e.target.value);
  renderActivity();
});

initGuestCommentMentionGuard();

document.getElementById('taskAttachmentFile')?.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f) onTaskAttachmentSelected(f);
});
document.getElementById('taskCoverFile')?.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f) onTaskCoverFileSelected(f);
});

initAttachmentDropZone('addTaskDropZone', 'addTaskAttachmentFiles', { multiple: true, onFiles: renderAddTaskFilesList });
initAttachmentDropZone('addTaskCoverDropZone', 'addTaskCoverFile', { onFiles: renderAddTaskCoverPreview });
initAttachmentDropZone('taskAttachmentDropZone', 'taskAttachmentFile');
initAttachmentDropZone('taskCoverDropZone', 'taskCoverFile');

window.tfResetPageNavigationUi = () => {
  hideNavigationLoading();
};

window.addEventListener('popstate', () => {
  if (!boardHistoryPopping) resetTransientNavigationUi();
  if (boardHistoryPopping) {
    boardHistoryPopping = false;
    return;
  }
  const overlay = getTopBoardOverlay();
  if (overlay) closeBoardOverlayUi(overlay);
});

initBoardZoom();
initBoardPan();
init();