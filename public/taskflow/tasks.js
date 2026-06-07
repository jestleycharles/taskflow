/**
 * taskflow/tasks.js
 * Task detail modal, comments, and attachments.
 * Depends on: state.js, helpers.js, members.js
 */

// Task Detail Modal
async function openTaskModal(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  activeTaskId = taskId;
  resetTaskModalToDetailsTab();
  taskComments = [];
  lastLoadedCommentsSig = null;
  commentBatch?.reset();
  const commentSearchEl = document.getElementById('commentMessageSearch');
  if (commentSearchEl) commentSearchEl.value = '';
  editingTaskField = null;
  taskEditDraft = '';
  taskViewingOriginalField = null;
  editingCommentId = null;
  commentEditDraft = '';
  commentViewingOriginalId = null;
  clearCommentPendingFile();
  applyCommentComposerState();
  resetTaskDetailsDrawer();
  document.getElementById('commentsList').innerHTML = messageListSkeletonHtml();
  document.getElementById('taskModal').classList.remove('hidden');
  setTaskModalBusy(true, 'Loading task…');
  pushTaskflowOverlay('task');
  const showUnreadBadgeLoading = (task.unread_comment_count || 0) > 0;
  if (showUnreadBadgeLoading) showCommentUnreadBadgeLoading();
  try {
    const pc = PRIORITY_CONFIG[task.priority];
    document.getElementById('taskDetailPriority').innerHTML = `<span class="px-2 py-0.5 rounded-md text-xs ${pc.bg}">${pc.label}</span>`;
    renderTaskTitleArea(task);
    renderTaskDescArea(task);
    const canEdit = !isGuest();
    document.getElementById('taskEditBtn').classList.toggle('hidden', !canEdit);
    document.getElementById('taskEditDescBtn').classList.toggle('hidden', !canEdit);
    document.getElementById('taskDeleteBtn').classList.toggle('hidden', !canEdit);
    populateStatusDropdowns();
    document.getElementById('detailStatus').value = task.status;
    document.getElementById('detailPriority').value = task.priority;
    document.getElementById('detailDue').value = task.due_date ? task.due_date.split('T')[0] : '';
    document.getElementById('detailAssignee').value = task.assigned_to || '';
    document.getElementById('detailCreator').innerHTML = task.creator
      ? memberNameHtml(task.creator, task.creator.id, 'text-sm text-gray-300')
      : '<span class="text-sm text-gray-300">Unknown</span>';
    await loadTaskAttachments(taskId);
    renderTaskAttachmentsUi(task);
    await loadTaskCommentReadState(taskId);
    await loadComments(taskId);
    if (showUnreadBadgeLoading) {
      if (taskCommentsTabActive) {
        await finishCommentsTabLoading();
      } else {
        clearCommentUnreadBadgeLoading();
      }
    }
  } finally {
    if (activeTaskId === taskId) setTaskModalBusy(false);
  }
}
async function closeTaskModalUi() {
  if (taskModalClosing) return;
  taskModalClosing = true;
  const backdrop = document.querySelector('#taskModal > .modal-overlay');
  backdrop?.classList.add('pointer-events-none');
  setTaskModalBusy(true, 'Saving…');
  closeReactionFloats();
  dismissMessageComposer(
    document.getElementById('commentInput'),
    document.getElementById('commentSendBtn')
  );
  const closingTaskId = activeTaskId;
  try {
    if (closingTaskId) {
      await persistTaskCommentReadState(closingTaskId, true);
      const unread = tasks.find((t) => t.id === closingTaskId)?.unread_comment_count || 0;
      updateTaskCardUnreadBadge(closingTaskId, unread);
    }
  } finally {
    setTaskModalBusy(false);
  }
  document.getElementById('taskModal').classList.add('hidden');
  activeTaskId = null;
  resetTaskModalToDetailsTab();
  taskComments = [];
  lastLoadedCommentsSig = null;
  commentBatch?.reset();
  const commentSearchEl = document.getElementById('commentMessageSearch');
  if (commentSearchEl) commentSearchEl.value = '';
  editingTaskField = null;
  taskEditDraft = '';
  taskViewingOriginalField = null;
  editingCommentId = null;
  commentEditDraft = '';
  commentViewingOriginalId = null;
  clearCommentPendingFile();
  taskModalClosing = false;
  backdrop?.classList.remove('pointer-events-none');
}
function closeTaskModal() {
  if (taskModalClosing) return;
  requestCloseTaskflowOverlay();
}

function commentSearchText(c) {
  const parts = [c.content || ''];
  if (c.user?.username) parts.push(c.user.username);
  return parts.join(' ');
}

function renderComments(batchScrollHint) {
  const list = document.getElementById('commentsList');
  if (!list || !commentBatch) return;
  const scrollTop = list.scrollTop;
  const scrollHeight = list.scrollHeight;
  const atBottom = scrollHeight - list.clientHeight - scrollTop < 48;
  const emptyHtml = '<p class="text-sm text-gray-600 text-center py-4">No comments yet.</p>';
  const { scrollToTop } = commentBatch.renderList(
    list,
    taskComments,
    renderCommentItem,
    emptyHtml,
  );
  syncCommentVersionFocusUi();
  if (openReactionPicker || openReactorsPopover) syncReactionFloatUi();
  if (editingCommentId) {
    const ta = document.getElementById(`commentEditInput-${editingCommentId}`);
    if (ta) {
      ta.value = commentEditDraft;
      attachMentionAutocompleteToEditTextarea(ta);
      ta.focus();
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
    }
  } else if (batchScrollHint === 'older' || scrollToTop) {
    list.scrollTop = 0;
  } else if (!atBottom && commentBatch.isAtLatest()) {
    list.scrollTop = scrollTop;
  }
  syncMessageAttachmentsIn(list);
}

function renderTaskTitleArea(task) {
  const area = document.getElementById('taskDetailTitleArea');
  if (editingTaskField === 'title') {
    area.innerHTML = `<div class="space-y-2">
      <textarea id="taskTitleEditInput" rows="2" oninput="taskEditDraft=this.value"
        class="w-full bg-ink-700 border border-white/10 rounded-lg px-3 py-2 text-white text-lg font-semibold focus:outline-none focus:border-brand-500 transition resize-none"></textarea>
      <div class="flex gap-2 justify-end">
        <button type="button" onclick="cancelEditTask()" class="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 transition">Cancel</button>
        <button type="button" onclick="saveEditTask('title')" class="text-xs bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg transition font-medium">Save</button>
      </div>
    </div>`;
    const ta = document.getElementById('taskTitleEditInput');
    ta.value = taskEditDraft || task.title;
    ta.focus();
    return;
  }
  const showingOriginal = taskViewingOriginalField === 'title' && task.title_before_edit;
  const displayTitle = showingOriginal ? task.title_before_edit : task.title;
  const editedNote = task.title_edited_at
    ? `<span class="text-gray-600 font-normal text-xs"> · edited ${escHtml(formatChatDateTime(task.title_edited_at))}</span>`
    : '';
  const versionToggle = task.title_before_edit
    ? `<button type="button" onclick="toggleTaskVersion('title')" class="text-xs text-brand-500 hover:text-brand-400 transition mt-1 block">
        ${showingOriginal ? 'Show current title' : 'Show original title'}
      </button>`
    : '';
  const editedLabel = task.title_edited_at
    ? `<p class="text-xs text-gray-500 italic mb-1">${showingOriginal ? 'Original title' : 'Edited title'}</p>`
    : '';
  const body = task.title_edited_at
    ? `<div class="chat-msg-edited-card rounded-lg bg-ink-700/40 border border-white/5 px-3 py-2">
        ${editedLabel}
        <h2 class="text-lg font-semibold text-white leading-snug">${escHtml(displayTitle)}</h2>
        ${versionToggle}
      </div>`
    : `<h2 class="text-lg font-semibold text-white leading-snug">${escHtml(displayTitle)}</h2>`;
  area.innerHTML = `${body}${editedNote ? `<p class="text-xs mt-1">${editedNote}</p>` : ''}`;
}

function renderTaskDescArea(task) {
  const area = document.getElementById('taskDetailDescArea');
  if (editingTaskField === 'description') {
    area.innerHTML = `<div class="space-y-2 w-full">
      <textarea id="taskDescEditInput" rows="4" oninput="taskEditDraft=this.value"
        class="w-full bg-ink-700 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500 transition resize-none"></textarea>
      <div class="flex gap-2 justify-end">
        <button type="button" onclick="cancelEditTask()" class="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 transition">Cancel</button>
        <button type="button" onclick="saveEditTask('description')" class="text-xs bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg transition font-medium">Save</button>
      </div>
    </div>`;
    const ta = document.getElementById('taskDescEditInput');
    ta.value = taskEditDraft !== '' ? taskEditDraft : (task.description || '');
    ta.focus();
    return;
  }
  const showingOriginal = taskViewingOriginalField === 'description' && task.description_before_edit != null;
  const displayDesc = showingOriginal ? task.description_before_edit : (task.description || '');
  const empty = !displayDesc;
  const editedNote = task.description_edited_at
    ? `<p class="text-xs text-gray-600 mt-1">Edited ${escHtml(formatChatDateTime(task.description_edited_at))}</p>`
    : '';
  const versionToggle = task.description_edited_at && task.description_before_edit != null
    ? `<button type="button" onclick="toggleTaskVersion('description')" class="text-xs text-brand-500 hover:text-brand-400 transition mt-1 block">
        ${showingOriginal ? 'Show current description' : 'Show original description'}
      </button>`
    : '';
  const editedLabel = task.description_edited_at
    ? `<p class="text-xs text-gray-500 italic mb-1">${showingOriginal ? 'Original description' : 'Edited description'}</p>`
    : '';
  if (empty && !task.description_edited_at) {
    area.innerHTML = '<span class="text-gray-500">No description provided.</span>';
    return;
  }
  const body = task.description_edited_at
    ? `<div class="chat-msg-edited-card rounded-lg bg-ink-700/40 border border-white/5 px-3 py-2">
        ${editedLabel}
        <p class="whitespace-pre-wrap break-words">${displayDesc ? escHtml(displayDesc) : '<span class="text-gray-500 italic">Empty</span>'}</p>
        ${versionToggle}
      </div>${editedNote}`
    : `<p class="whitespace-pre-wrap break-words">${escHtml(displayDesc)}</p>${editedNote}`;
  area.innerHTML = body;
}

function startEditTask(field) {
  if (isGuest() || !activeTaskId) return;
  const task = tasks.find(t => t.id === activeTaskId);
  if (!task) return;
  editingTaskField = field;
  taskEditDraft = field === 'title' ? task.title : (task.description || '');
  renderTaskTitleArea(task);
  renderTaskDescArea(task);
}

function cancelEditTask() {
  editingTaskField = null;
  taskEditDraft = '';
  const task = tasks.find(t => t.id === activeTaskId);
  if (task) {
    renderTaskTitleArea(task);
    renderTaskDescArea(task);
  }
}

function toggleTaskVersion(field) {
  taskViewingOriginalField = taskViewingOriginalField === field ? null : field;
  const task = tasks.find(t => t.id === activeTaskId);
  if (!task) return;
  if (field === 'title') renderTaskTitleArea(task);
  else renderTaskDescArea(task);
}

async function saveEditTask(field) {
  if (!activeTaskId) return;
  const input = document.getElementById(field === 'title' ? 'taskTitleEditInput' : 'taskDescEditInput');
  const value = field === 'title' ? input?.value.trim() : (input?.value ?? '').trim();
  if (field === 'title' && !value) {
    showAlert('Title cannot be empty');
    return;
  }
  const r = await apiFetch(`/api/tasks/${activeTaskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [field]: value }),
  });
  const updated = await parseJsonResponse(r);
  if (!r.ok) {
    showAlert(updated.error || 'Failed to save');
    return;
  }
  const idx = tasks.findIndex(t => t.id === activeTaskId);
  if (idx !== -1) tasks[idx] = updated;
  editingTaskField = null;
  taskEditDraft = '';
  renderTaskTitleArea(updated);
  renderTaskDescArea(updated);
  renderTaskflow();
  loadComments(activeTaskId);
}

async function switchTab(tab) {
  closeReactionFloats();
  taskCommentsTabActive = tab === 'comments';
  ['details','comments'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('[onclick^="switchTab"]').forEach(btn => {
    const t = btn.getAttribute('onclick').match(/'(\w+)'/)[1];
    btn.className = t === tab
      ? 'tab-active text-sm py-3 mr-6 transition-colors' + (t === 'comments' ? ' relative' : '')
      : 'tab-inactive text-sm py-3 mr-6 transition-colors' + (t === 'comments' ? ' relative' : '');
  });
  if (tab === 'comments' && activeTaskId) {
    const taskId = activeTaskId;
    if (!taskComments.length) {
      if (commentUnreadBadgeLoading) showCommentUnreadBadgeLoading();
      document.getElementById('commentsList').innerHTML = messageListSkeletonHtml();
      await loadComments(taskId);
    }
    await markTaskCommentsRead(taskId, true);
    await finishCommentsTabLoading();
  } else if (activeTaskId) {
    updateTaskCommentUnreadBadge();
  }
}

async function loadTaskAttachments(taskId) {
  const r = await apiFetch(`/api/tasks/${taskId}/attachments`);
  const data = await parseJsonResponse(r);
  taskAttachments = r.ok ? (data || []) : [];
}

function isAttachmentPreviewable(mimeType) {
  const m = String(mimeType || '').toLowerCase();
  return m.startsWith('image/') || m === 'application/pdf';
}

function openAttachmentPreview(url, fileName, mimeType) {
  const modal = document.getElementById('attachmentPreviewModal');
  const body = document.getElementById('attachmentPreviewBody');
  const title = document.getElementById('attachmentPreviewTitle');
  const openLink = document.getElementById('attachmentPreviewOpenLink');
  if (!modal || !body) return;
  const mime = String(mimeType || '').toLowerCase();
  const name = fileName || 'Attachment';
  if (title) title.textContent = name;
  if (openLink) {
    openLink.href = url;
    openLink.classList.remove('hidden');
  }
  if (mime.startsWith('image/')) {
    body.innerHTML = `<img src="${escHtml(url)}" alt="${escHtml(name)}" />`;
  } else if (mime === 'application/pdf') {
    body.innerHTML = `<iframe src="${escHtml(url)}" title="${escHtml(name)}"></iframe>`;
  } else {
    body.innerHTML = '<p class="text-sm text-gray-500">Preview not available for this file type.</p>';
  }
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  pushTaskflowOverlay('attachmentPreview');
}

function closeAttachmentPreviewUi() {
  const modal = document.getElementById('attachmentPreviewModal');
  const body = document.getElementById('attachmentPreviewBody');
  if (body) body.innerHTML = '';
  modal?.classList.add('hidden');
  document.body.style.overflow = '';
}
function closeAttachmentPreview() {
  requestCloseTaskflowOverlay();
}

function renderTaskAttachmentsUi(task) {
  const guest = isGuest();
  const section = document.getElementById('taskAttachmentsSection');
  const list = document.getElementById('taskAttachmentsList');
  const uploadBlock = document.getElementById('taskAttachmentsUploadBlock');
  const coverBlock = document.getElementById('taskCoverBlock');
  const coverPreview = document.getElementById('taskCoverPreview');
  const coverManageRow = document.getElementById('taskCoverManageRow');
  const coverGuestNote = document.getElementById('taskCoverGuestNote');
  if (!section) return;
  const hasAttachments = taskAttachments.length > 0;
  const hasCover = !!task.cover_image_url;
  const showSection = !guest || hasAttachments || hasCover;
  section.classList.toggle('hidden', !showSection);
  if (!showSection) return;
  if (uploadBlock) uploadBlock.classList.toggle('hidden', guest);
  if (coverBlock) coverBlock.classList.toggle('hidden', guest && !hasCover);
  if (coverManageRow) coverManageRow.classList.toggle('hidden', guest);
  if (coverGuestNote) coverGuestNote.classList.toggle('hidden', !guest || !hasCover);
  if (list) {
    if (!hasAttachments) {
      list.innerHTML = guest
        ? ''
        : '<p class="text-xs text-gray-600">No attachments yet.</p>';
    } else {
      list.innerHTML = taskAttachments.map((a) => {
        const isImg = (a.mime_type || '').startsWith('image/');
        const previewable = isAttachmentPreviewable(a.mime_type);
        const previewBtn = previewable
          ? `<button type="button" data-preview-attachment data-url="${escHtml(a.file_url)}" data-mime="${escHtml(a.mime_type || '')}" data-name="${escHtml(a.file_name || '')}" class="attachment-icon-btn brand" title="Preview" aria-label="Preview ${escHtml(a.file_name)}">${ICON_EYE}</button>`
          : '';
        const coverBtn = !guest && isImg
          ? `<button type="button" class="attachment-icon-btn brand" onclick="setCoverFromAttachment('${a.id}')" title="Use as cover" aria-label="Use as cover">${ICON_IMAGE}</button>`
          : '';
        const delBtn = !guest
          ? `<button type="button" class="attachment-icon-btn danger" onclick="deleteTaskAttachment('${a.id}')" title="Remove" aria-label="Remove ${escHtml(a.file_name)}">${ICON_TRASH}</button>`
          : '';
        const thumb = isImg
          ? `<img src="${escHtml(a.file_url)}" alt="" class="attachment-file-thumb" data-preview-attachment data-url="${escHtml(a.file_url)}" data-mime="${escHtml(a.mime_type || '')}" data-name="${escHtml(a.file_name || '')}" ${storageImageOnErrorAttr()} />`
          : `<div class="attachment-file-icon">${attachmentFileIconHtml(a.mime_type)}</div>`;
        return `<div class="attachment-file-row">
          ${thumb}
          <span class="text-gray-300 truncate text-xs flex-1 min-w-0">${escHtml(a.file_name)}</span>
          <div class="flex gap-0.5 shrink-0">${previewBtn}${coverBtn}${delBtn}</div>
        </div>`;
      }).join('');
    }
  }
  if (coverPreview) {
    if (hasCover) {
      coverPreview.innerHTML = `<img src="${escHtml(task.cover_image_url)}" alt="" class="w-full h-32 object-cover" data-preview-cover data-url="${escHtml(task.cover_image_url)}" ${storageImageOnErrorAttr()} />`;
      coverPreview.classList.add('cursor-pointer');
      coverPreview.title = 'Preview cover';
    } else {
      coverPreview.innerHTML = '<p class="text-xs text-gray-600 p-4 text-center">No cover image</p>';
      coverPreview.classList.remove('cursor-pointer');
      coverPreview.removeAttribute('title');
    }
  }
  const clearBtn = document.getElementById('taskCoverClearBtn');
  if (clearBtn) clearBtn.classList.toggle('hidden', !hasCover || guest);

  // Sync inline cover preview (above drawer, below description)
  const inlineCoverBlock = document.getElementById('taskDetailCoverBlock');
  const inlineCoverPreview = document.getElementById('taskDetailCoverPreviewInline');
  if (inlineCoverBlock && inlineCoverPreview) {
    if (hasCover) {
      inlineCoverPreview.innerHTML = `<img src="${escHtml(task.cover_image_url)}" alt="" class="w-full object-cover max-h-48" data-preview-cover data-url="${escHtml(task.cover_image_url)}" ${storageImageOnErrorAttr()} />`;
      inlineCoverPreview.classList.add('cursor-pointer');
      inlineCoverBlock.classList.remove('hidden');
    } else {
      inlineCoverPreview.innerHTML = '';
      inlineCoverPreview.classList.remove('cursor-pointer');
      inlineCoverBlock.classList.add('hidden');
    }
  }
}

async function setCoverFromAttachment(attachmentId) {
  if (!activeTaskId || isGuest()) return;
  const r = await apiFetch(`/api/tasks/${activeTaskId}/cover`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attachment_id: attachmentId }),
  });
  const updated = await parseJsonResponse(r);
  if (!r.ok) {
    showAlert(updated.error || 'Failed to set cover');
    return;
  }
  const idx = tasks.findIndex((t) => t.id === activeTaskId);
  if (idx !== -1) tasks[idx] = updated;
  renderTaskAttachmentsUi(updated);
  renderTaskflow();
}

async function clearTaskCover() {
  if (!activeTaskId || isGuest()) return;
  const r = await apiFetch(`/api/tasks/${activeTaskId}/cover`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cover_image_url: null }),
  });
  const updated = await parseJsonResponse(r);
  if (!r.ok) {
    showAlert(updated.error || 'Failed to remove cover');
    return;
  }
  const idx = tasks.findIndex((t) => t.id === activeTaskId);
  if (idx !== -1) tasks[idx] = updated;
  renderTaskAttachmentsUi(updated);
  renderTaskflow();
}

async function deleteTaskAttachment(attachmentId) {
  if (!activeTaskId || isGuest()) return;
  const r = await apiFetch(`/api/tasks/${activeTaskId}/attachments/${attachmentId}`, { method: 'DELETE' });
  const d = await parseJsonResponse(r);
  if (!r.ok) {
    showAlert(d.error || 'Failed to remove attachment');
    return;
  }
  await loadTaskAttachments(activeTaskId);
  const task = tasks.find((t) => t.id === activeTaskId);
  if (task) {
    task.attachment_count = Math.max(0, (task.attachment_count || 1) - 1);
    renderTaskAttachmentsUi(task);
    renderTaskflow();
  }
}

async function onTaskAttachmentSelected(file) {
  if (!activeTaskId || !file || isGuest() || attachmentUploadBusy) return;
  const asCover = document.getElementById('taskAttachmentAsCover')?.checked && file.type.startsWith('image/');
  const busy = document.getElementById('taskAttachmentUploadBusy');
  attachmentUploadBusy = true;
  if (busy) busy.classList.remove('hidden');
  try {
    await uploadTaskAttachment(activeTaskId, file, asCover);
    await loadTaskAttachments(activeTaskId);
    const r = await apiFetch(`/api/teams/${teamId}/tasks`);
    const all = await parseJsonResponse(r);
    if (r.ok) {
      const updated = all.find((t) => t.id === activeTaskId);
      if (updated) {
        const idx = tasks.findIndex((t) => t.id === activeTaskId);
        if (idx !== -1) tasks[idx] = updated;
        renderTaskAttachmentsUi(updated);
        renderTaskflow();
      }
    }
  } catch (err) {
    showAlert(err.message || 'Upload failed');
  } finally {
    attachmentUploadBusy = false;
    if (busy) busy.classList.add('hidden');
  }
  document.getElementById('taskAttachmentFile').value = '';
}

async function onTaskCoverFileSelected(file) {
  if (!activeTaskId || !file || isGuest() || coverUploadBusy) return;
  const busy = document.getElementById('taskCoverUploadBusy');
  coverUploadBusy = true;
  if (busy) busy.classList.remove('hidden');
  try {
    const updated = await uploadTaskCover(activeTaskId, file);
    const idx = tasks.findIndex((t) => t.id === activeTaskId);
    if (idx !== -1) tasks[idx] = updated;
    await loadTaskAttachments(activeTaskId);
    renderTaskAttachmentsUi(updated);
    renderTaskflow();
  } catch (err) {
    showAlert(err.message || 'Upload failed');
  } finally {
    coverUploadBusy = false;
    if (busy) busy.classList.add('hidden');
  }
  document.getElementById('taskCoverFile').value = '';
}

async function updateTaskField(field, value) {
  if (!activeTaskId) return;
  const r = await apiFetch(`/api/tasks/${activeTaskId}`, {
    method: 'PATCH', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ [field]: value })
  });
  const updated = await parseJsonResponse(r);
  if (r.ok && !updated.error) {
    const idx = tasks.findIndex(t => t.id === activeTaskId);
    if (idx !== -1) tasks[idx] = updated;
    renderTaskflow();
    const task = tasks.find(t => t.id === activeTaskId);
    if (task) {
      renderTaskTitleArea(task);
      renderTaskDescArea(task);
      renderTaskAttachmentsUi(task);
    }
    loadComments(activeTaskId);
  }
}

function deleteTask() {
  if (!activeTaskId) return;
  showConfirm({
    title: 'Delete task',
    message: 'Delete this task? This cannot be undone.',
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: () => executeDeleteTask(),
  });
}

async function executeDeleteTask() {
  const taskId = activeTaskId;
  if (!taskId) return;
  const r = await apiFetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
  const d = await parseJsonResponse(r);
  if (!r.ok) {
    showAlert(d.error || 'Failed to delete task');
    return;
  }
  tasks = tasks.filter(t => t.id !== taskId);
  closeTaskModal();
  renderTaskflow();
}

function renderCommentActions(c) {
  if (isGuest() || c.is_system || String(c.user_id) !== String(currentUser?.id) || c.deleted_at) return '';
  if (editingCommentId === c.id) return '';
  return `<div class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
      <button type="button" onclick="startEditComment('${c.id}')" class="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-white/10" title="Edit">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
      </button>
      <button type="button" onclick="deleteComment('${c.id}')" class="text-gray-500 hover:text-red-400 p-1 rounded-lg hover:bg-red-500/10" title="Delete">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
      </button>
    </div>`;
}

function renderCommentItem(c) {
  if (c.is_system) {
    return `<div class="comment-system text-xs text-gray-400 leading-relaxed">
      <span class="text-brand-500/80 font-medium">Activity</span>
      <span class="mx-1.5 text-gray-600">·</span>
      ${escHtml(c.content)}
      <span class="text-gray-600 ml-1.5">${timeAgo(c.created_at)}</span>
    </div>`;
  }

  const user = c.user || { username: '?', avatar_color: '#4f6ef7' };

  if (c._pendingSend) {
    const hasAttachment = !!c._hasAttachment || !!(c.attachments && c.attachments.length);
    return `<div class="flex gap-3 chat-msg-pending" data-comment-id="${c.id}">
      ${userAvatarHtml(user, 'w-7 h-7')}
      <div class="flex-1 min-w-0">
        <div class="skeleton h-2.5 w-24 rounded mb-2"></div>
        ${messageBusyBodySkeletonHtml({ hasAttachment })}
      </div>
    </div>`;
  }

  const pendingOp = getPendingMessageOp('comment', c.id);
  if (pendingOp === 'delete') {
    return `<div class="flex gap-3" data-comment-id="${c.id}">
      ${userAvatarHtml(user, 'w-7 h-7')}
      <div class="flex-1 min-w-0">${messageDeleteBusySkeletonHtml()}</div>
    </div>`;
  }
  if (pendingOp === 'edit') {
    const hasAttachment = !!(c.attachments && c.attachments.length);
    return `<div class="flex gap-3" data-comment-id="${c.id}">
      ${userAvatarHtml(user, 'w-7 h-7')}
      <div class="flex-1 min-w-0">${messageBusyBodySkeletonHtml({ hasAttachment })}</div>
    </div>`;
  }

  if (c.deleted_at) {
    return `<div class="flex gap-3" data-comment-id="${c.id}">
      ${userAvatarHtml(user, 'w-7 h-7')}
      <div class="flex-1 min-w-0">
        <div class="chat-msg-tombstone rounded-xl p-3">
          <p class="text-xs text-gray-500 italic">Comment deleted</p>
          <p class="text-xs text-gray-600 mt-1.5">${memberNameHtml(user, c.user_id, 'text-xs inline')} · ${escHtml(formatChatDateTime(c.created_at))}</p>
        </div>
      </div>
    </div>`;
  }

  if (editingCommentId === c.id) {
    return `<div class="flex gap-3" data-comment-id="${c.id}">
      ${userAvatarHtml(user, 'w-7 h-7')}
      <div class="flex-1 min-w-0 bg-ink-700/80 border border-brand-500/30 rounded-xl p-3 space-y-2">
        <textarea id="commentEditInput-${c.id}" rows="3" oninput="commentEditDraft=this.value"
          class="w-full bg-ink-700 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500 transition resize-none"></textarea>
        <div class="flex gap-2 justify-end">
          <button type="button" onclick="cancelEditComment()" class="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 transition">Cancel</button>
          <button type="button" onclick="saveEditComment('${c.id}')" class="text-xs bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg transition font-medium">Save</button>
        </div>
      </div>
    </div>`;
  }

  const editedNote = c.edited_at
    ? `<span class="text-gray-600"> · edited ${escHtml(formatChatDateTime(c.edited_at))}</span>`
    : '';
  const hasOriginal = !!c.edited_at;
  const showingOriginal = hasOriginal && commentViewingOriginalId === c.id;
  const displayContent = showingOriginal ? c.content_before_edit : c.content;
  const versionToggle = hasOriginal
    ? `<button type="button" onclick="toggleCommentVersion('${c.id}')"
        class="text-xs text-brand-500 hover:text-brand-400 transition mt-1.5">
        ${showingOriginal ? 'Show new comment' : 'Show original comment'}
      </button>`
    : '';
  const editedLabel = c.edited_at
    ? `<p class="text-xs text-gray-500 italic mb-1">${showingOriginal ? 'Original comment' : 'Edited comment'}</p>`
    : '';
  const bodyHtml = c.edited_at
    ? `<div class="chat-msg-edited-card rounded-lg bg-ink-700/40 border border-white/5 px-3 py-2">
        ${editedLabel}
        ${displayContent ? `<p class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap break-words">${formatCommentBodyHtml({ ...c, content: displayContent })}</p>` : ''}
        ${versionToggle}
      </div>`
    : (displayContent
      ? `<p class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap break-words">${formatCommentBodyHtml(c)}</p>`
      : '');

  const attachmentsHtml = renderMessageAttachmentsHtml(c.attachments);
  const mentionedYou = !isGuestAuthor(c.user_id) && messageMentionsCurrentUser(displayContent);
  const mentionRowClass = mentionedYou ? ' msg-mentioned-you' : '';
  const versionActiveClass = showingOriginal ? ' chat-msg-version-active' : '';
  const guestNoMentions = isGuestAuthor(c.user_id) ? ' data-guest-no-mentions="1"' : '';

  return `<div class="group flex gap-3${versionActiveClass}${mentionRowClass}" data-comment-id="${c.id}"${guestNoMentions}>
      ${userAvatarHtml(user, 'w-7 h-7')}
      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between gap-2 mb-1">
          <div class="min-w-0">
            <span class="text-xs font-medium">${memberNameHtml(user, c.user_id, 'text-xs')}</span>
            <p class="text-xs text-gray-600 mt-0.5">${escHtml(formatChatDateTime(c.created_at))}${editedNote}</p>
          </div>
          ${renderCommentActions(c)}
        </div>
        ${bodyHtml}
        ${attachmentsHtml}
        ${renderReactionsBar('comment', c.id, c.reactions || [])}
      </div>
    </div>`;
}

function toggleCommentVersion(commentId) {
  commentViewingOriginalId = commentViewingOriginalId === commentId ? null : commentId;
  renderComments();
}

function syncCommentVersionFocusUi() {
  const list = document.getElementById('commentsList');
  const viewing = !!commentViewingOriginalId;
  list?.classList.toggle('chat-viewing-original', viewing);
  if (!list || !viewing) return;
  list.querySelectorAll('[data-comment-id]').forEach((el) => {
    el.classList.toggle('chat-msg-version-active', el.dataset.commentId === commentViewingOriginalId);
  });
}

function captureCommentEditDraft() {
  if (!editingCommentId) return;
  const ta = document.getElementById(`commentEditInput-${editingCommentId}`);
  if (ta) commentEditDraft = ta.value;
}

function startEditComment(commentId) {
  if (isGuest()) return;
  const c = taskComments.find((x) => x.id === commentId);
  if (!c || c.deleted_at || c.is_system) return;
  editingCommentId = commentId;
  commentEditDraft = c.content;
  renderComments();
}

function cancelEditComment() {
  editingCommentId = null;
  commentEditDraft = '';
  renderComments();
}

async function saveEditComment(commentId) {
  const taskId = activeTaskId;
  if (!taskId) return;
  const textarea = document.getElementById(`commentEditInput-${commentId}`);
  const content = prepareOutgoingMessage(textarea?.value);
  if (!content) return;
  editingCommentId = null;
  commentEditDraft = '';
  setPendingMessageOp('comment', commentId, 'edit');
  renderComments();
  try {
    const r = await apiFetch(`/api/tasks/${taskId}/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const updated = await parseJsonResponse(r);
    if (!r.ok) {
      showAlert(updated.error || 'Failed to edit comment');
      return;
    }
    const idx = taskComments.findIndex((c) => c.id === commentId);
    if (idx !== -1) taskComments[idx] = updated;
    if (commentViewingOriginalId === commentId) commentViewingOriginalId = null;
  } finally {
    clearPendingMessageOp('comment', commentId);
    renderComments();
  }
}

function deleteComment(commentId) {
  if (isGuest()) return;
  showConfirm({
    title: 'Delete comment',
    message: 'Delete this comment? This cannot be undone.',
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: () => executeDeleteComment(commentId),
  });
}

async function executeDeleteComment(commentId) {
  const taskId = activeTaskId;
  if (!taskId) return;
  if (editingCommentId === commentId) {
    editingCommentId = null;
    commentEditDraft = '';
  }
  setPendingMessageOp('comment', commentId, 'delete');
  renderComments();
  try {
    const r = await apiFetch(`/api/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' });
    const updated = await parseJsonResponse(r);
    if (!r.ok) {
      showAlert(updated.error || 'Failed to delete comment');
      return;
    }
    const idx = taskComments.findIndex((c) => c.id === commentId);
    if (idx !== -1) taskComments[idx] = updated;
    if (commentViewingOriginalId === commentId) commentViewingOriginalId = null;
  } finally {
    clearPendingMessageOp('comment', commentId);
    renderComments();
  }
}

function countUnreadTaskComments(comments, taskId) {
  const lastRead = taskCommentsLastReadAt[taskId] || 0;
  return (comments || []).filter((c) => {
    if (String(c.user_id) === String(currentUser?.id)) return false;
    return new Date(c.created_at).getTime() > lastRead;
  }).length;
}

function syncTaskUnreadCount(taskId, count) {
  const idx = tasks.findIndex((t) => t.id === taskId);
  if (idx !== -1) tasks[idx].unread_comment_count = count;
}

function updateTaskCardUnreadBadge(taskId, count) {
  const card = document.querySelector(`.task-card[data-id="${taskId}"]`);
  if (!card) return;
  const wrap = card.querySelector('.task-card-badges');
  if (!wrap) return;
  let badge = wrap.querySelector('.task-comment-unread-badge');
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'task-comment-unread-badge flex items-center justify-center rounded-full bg-red-500 text-white font-bold px-1';
      badge.title = 'Unread comments';
      wrap.insertBefore(badge, wrap.firstChild);
    }
    badge.textContent = count > 99 ? '99+' : String(count);
  } else if (badge) {
    badge.remove();
  }
}

function commentsSignature(comments) {
  return (comments || []).map((c) => `${c.id}:${c.created_at}:${c.edited_at || ''}:${c.deleted_at || ''}`).join('|');
}

let lastLoadedCommentsSig = null;

async function loadTaskCommentReadState(taskId) {
  const r = await apiFetch(`/api/tasks/${taskId}/comments/read`);
  if (!r.ok) return;
  const data = await parseJsonResponse(r);
  if (data?.last_read_at) {
    const t = new Date(data.last_read_at).getTime();
    if (!Number.isNaN(t)) taskCommentsLastReadAt[taskId] = t;
  } else if (taskCommentsLastReadAt[taskId] === undefined) {
    taskCommentsLastReadAt[taskId] = 0;
  }
}

function persistTaskCommentReadState(taskId, immediate = false) {
  const lastRead = taskCommentsLastReadAt[taskId];
  if (lastRead == null) return Promise.resolve();
  clearTimeout(taskCommentReadPersistTimer);
  const save = () => apiFetch(`/api/tasks/${taskId}/comments/read`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ last_read_at: new Date(lastRead).toISOString() }),
  });
  if (immediate) return save();
  return new Promise((resolve) => {
    taskCommentReadPersistTimer = setTimeout(async () => {
      await save();
      resolve();
    }, 300);
  });
}

async function markTaskCommentsRead(taskId, flushPersist = false) {
  const latest = taskComments.reduce((max, c) => {
    const t = new Date(c.created_at).getTime();
    return t > max ? t : max;
  }, 0);
  taskCommentsLastReadAt[taskId] = Math.max(taskCommentsLastReadAt[taskId] || 0, latest, Date.now());
  syncTaskUnreadCount(taskId, 0);
  updateTaskCardUnreadBadge(taskId, 0);
  updateTaskCommentUnreadBadge();
  await persistTaskCommentReadState(taskId, flushPersist);
}

function taskCommentUnreadDisplayCount(taskId) {
  if (activeTaskId === taskId && taskComments.length) {
    return countUnreadTaskComments(taskComments, taskId);
  }
  const task = tasks.find((t) => t.id === taskId);
  return task?.unread_comment_count || 0;
}

function updateTaskCommentUnreadBadge() {
  const badge = document.getElementById('commentUnreadBadge');
  if (!badge || !activeTaskId) return;
  if (commentUnreadBadgeLoading) return;
  if (taskCommentsTabActive) {
    badge.textContent = '';
    badge.innerHTML = '';
    badge.classList.remove('is-loading');
    badge.classList.add('hidden');
    return;
  }
  const unread = taskCommentUnreadDisplayCount(activeTaskId);
  syncTaskUnreadCount(activeTaskId, unread);
  updateTaskCardUnreadBadge(activeTaskId, unread);
  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.classList.remove('hidden');
  } else {
    badge.textContent = '';
    badge.classList.add('hidden');
  }
}

async function loadComments(taskId, { forceRender = false } = {}) {
  const list = document.getElementById('commentsList');
  const hadComments = taskComments.length > 0;
  if (!hadComments) {
    list.innerHTML = messageListSkeletonHtml();
  }
  const r = await apiFetch(`/api/tasks/${taskId}/comments`);
  const comments = await r.json();
  if (!Array.isArray(comments)) {
    if (!hadComments) {
      list.innerHTML = '<p class="text-sm text-gray-600 text-center py-4">No comments yet.</p>';
    }
    return;
  }
  const sig = commentsSignature(comments);
  const commentsChanged = sig !== lastLoadedCommentsSig || forceRender;
  taskComments = comments;
  if (commentsChanged) {
    lastLoadedCommentsSig = sig;
    if (editingCommentId) {
      captureCommentEditDraft();
      const editingComment = comments.find((c) => c.id === editingCommentId);
      if (editingComment && !editingComment.deleted_at && !editingComment.is_system) {
        const idx = taskComments.findIndex((c) => c.id === editingCommentId);
        if (idx !== -1) {
          taskComments[idx] = { ...editingComment, content: commentEditDraft || editingComment.content };
        }
      } else {
        renderComments();
      }
    } else {
      renderComments();
    }
    if (commentUnreadBadgeLoading) {
      if (taskCommentsTabActive && commentBatch.isAtLatest()) {
        await ensureCommentsScrolledToBottom();
      }
      if (!taskCommentsTabActive || commentBatch.isAtLatest()) {
        clearCommentUnreadBadgeLoading();
      }
    }
  }
  if (taskCommentsTabActive) {
    await markTaskCommentsRead(taskId, true);
  } else {
    const unread = countUnreadTaskComments(comments, taskId);
    syncTaskUnreadCount(taskId, unread);
    updateTaskCardUnreadBadge(taskId, unread);
    if (!commentUnreadBadgeLoading) updateTaskCommentUnreadBadge();
  }
  if (commentsChanged && (openReactionPicker || openReactorsPopover)) syncReactionFloatUi();
}

async function submitComment() {
  const taskId = activeTaskId;
  if (!taskId) return;
  const input = document.getElementById('commentInput');
  const btn = document.getElementById('commentSendBtn');
  const file = commentPendingFile;
  const textContent = prepareOutgoingMessage(input?.value);

  if (file && !isGuest()) {
    const key = `task-comment:${taskId}`;
    if (messageSendInFlight.has(key) || sendCooldownTimers.has(key)) return;
    if (!textContent && !file) return;

    messageSendInFlight.add(key);
    if (input) input.disabled = true;
    if (btn) btn.disabled = true;

    const pendingId = `pending-${Date.now()}`;
    commentBatch?.showLatestBatch();
    taskComments.push({
      id: pendingId,
      _pendingSend: true,
      _hasAttachment: true,
      user_id: currentUser?.id,
      user: currentUser,
      created_at: new Date().toISOString(),
      content: textContent || '',
    });
    renderComments();
    scrollCommentsToBottom?.();

    const form = new FormData();
    if (textContent) form.append('content', textContent);
    form.append('file', file);

    try {
      const r = await apiFetch(`/api/tasks/${taskId}/comments`, { method: 'POST', body: form });
      const data = await parseJsonResponse(r);
      if (!r.ok) {
        taskComments = taskComments.filter((c) => c.id !== pendingId);
        renderComments();
        const limited = messageSendRateLimitResult(r.status, data);
        if (limited) {
          applyMessageSendCooldown(key, {
            retryAfterMs: limited.rateLimit.retryAfterMs,
            error: limited.rateLimit.error,
            inputEl: input,
            sendBtnEl: btn,
            noticeEl: document.getElementById('commentSendCooldown'),
          });
          return;
        }
        showAlert(data.error || 'Failed to send comment');
        return;
      }
      taskComments = taskComments.filter((c) => c.id !== pendingId);
      if (input) input.value = '';
      clearCommentPendingFile();
      await loadComments(taskId);
    } catch {
      taskComments = taskComments.filter((c) => c.id !== pendingId);
      renderComments();
    } finally {
      messageSendInFlight.delete(key);
      if (input && !sendCooldownTimers.has(key)) input.disabled = false;
      if (btn && !sendCooldownTimers.has(key)) btn.disabled = false;
    }
    return;
  }

  await submitMessageOnce(`task-comment:${taskId}`, {
    inputEl: input,
    sendBtnEl: btn,
    cooldownNoticeEl: document.getElementById('commentSendCooldown'),
    getContent: () => prepareOutgoingMessage(input?.value),
    onBeforeSend: (content) => {
      const pendingId = `pending-${Date.now()}`;
      commentBatch?.showLatestBatch();
      taskComments.push({
        id: pendingId,
        _pendingSend: true,
        user_id: currentUser?.id,
        user: currentUser,
        created_at: new Date().toISOString(),
        content,
      });
      renderComments();
      return pendingId;
    },
    send: async (content, pendingId) => {
      const r = await apiFetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await parseJsonResponse(r);
      if (!r.ok) {
        if (pendingId) taskComments = taskComments.filter((c) => c.id !== pendingId);
        renderComments();
        const limited = messageSendRateLimitResult(r.status, data);
        if (limited) return limited;
        showAlert(data.error || 'Failed to send comment');
        return false;
      }
      if (pendingId) taskComments = taskComments.filter((c) => c.id !== pendingId);
      commentBatch?.showLatestBatch();
      await loadComments(taskId);
      return true;
    },
  });
}

function closeAllSidePanels() {
  closeActivityPanelUi();
  closeTeamPanelUi();
  closeSettingsPanelUi();
}
