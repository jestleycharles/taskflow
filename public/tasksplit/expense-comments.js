/**
 * TaskSplit expense detail comments — mirrors taskflow task comments.
 */

function setExpenseDetailTab(tab) {
  expenseDetailTab = tab;
  document.getElementById('expenseDetailTabDetails')?.classList.toggle('hidden', tab !== 'details');
  document.getElementById('expenseDetailTabComments')?.classList.toggle('hidden', tab !== 'comments');
  document.getElementById('expenseDetailTabBtnDetails')?.classList.toggle('tab-active', tab === 'details');
  document.getElementById('expenseDetailTabBtnComments')?.classList.toggle('tab-active', tab === 'comments');
  if (tab === 'comments') {
    loadExpenseComments(activeExpenseId);
    setTimeout(() => document.getElementById('expenseCommentInput')?.focus(), 50);
  }
}

function scrollExpenseCommentsToBottom() {
  const list = document.getElementById('expenseCommentsList');
  if (list) list.scrollTop = list.scrollHeight;
}

function renderExpenseCommentActions(c) {
  if (String(c.user_id) !== String(currentUser?.id) || c.deleted_at) return '';
  return `<div class="flex gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
    <button type="button" onclick="startEditExpenseComment('${c.id}')" class="text-gray-500 hover:text-white p-1 rounded" title="Edit">✎</button>
    <button type="button" onclick="deleteExpenseComment('${c.id}')" class="text-gray-500 hover:text-red-400 p-1 rounded" title="Delete">🗑</button>
  </div>`;
}

function renderExpenseCommentBody(c) {
  const user = c.user || { username: '?', avatar_color: '#4f6ef7' };

  if (c._pendingSend) {
    const hasAttachment = !!c._hasAttachment || !!(c.attachments && c.attachments.length);
    return `<div class="flex gap-3 expense-comment-pending" data-expense-comment-id="${c.id}">
      ${userAvatarHtml(user, 'w-7 h-7 shrink-0')}
      <div class="flex-1 min-w-0">${messageBusyBodySkeletonHtml({ hasAttachment })}</div>
    </div>`;
  }

  const pendingOp = getPendingMessageOp('expense_comment', c.id);
  if (pendingOp === 'delete') {
    return `<div class="flex gap-3" data-expense-comment-id="${c.id}">
      ${userAvatarHtml(user, 'w-7 h-7 shrink-0')}
      <div class="flex-1 min-w-0">${messageDeleteBusySkeletonHtml()}</div>
    </div>`;
  }
  if (pendingOp === 'edit') {
    return `<div class="flex gap-3" data-expense-comment-id="${c.id}">
      ${userAvatarHtml(user, 'w-7 h-7 shrink-0')}
      <div class="flex-1 min-w-0">${messageBusyBodySkeletonHtml({ hasAttachment: !!(c.attachments && c.attachments.length) })}</div>
    </div>`;
  }

  if (c.deleted_at) {
    return `<div class="rounded-xl p-3 bg-white/[0.02]" data-expense-comment-id="${c.id}">
      <p class="text-xs text-gray-500 italic">Comment deleted</p>
      <p class="text-xs text-gray-600 mt-1.5">${memberNameHtml(user, c.user_id, 'text-xs inline')} · ${escHtml(formatChatDateTime(c.created_at))}</p>
    </div>`;
  }

  if (editingExpenseCommentId === c.id) {
    return `<div class="bg-ink-700/80 border border-brand-500/30 rounded-xl p-3 space-y-2" data-expense-comment-id="${c.id}">
      <textarea id="expenseCommentEditInput-${c.id}" rows="3" oninput="expenseCommentEditDraft=this.value"
        class="w-full bg-ink-700 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500 transition resize-none"></textarea>
      <div class="flex gap-2 justify-end">
        <button type="button" onclick="cancelEditExpenseComment()" class="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 transition">Cancel</button>
        <button type="button" onclick="saveEditExpenseComment('${c.id}')" class="text-xs bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg transition font-medium">Save</button>
      </div>
    </div>`;
  }

  const editedNote = c.edited_at
    ? `<span class="text-gray-600"> · edited ${escHtml(formatChatDateTime(c.edited_at))}</span>`
    : '';
  const hasOriginal = !!c.edited_at;
  const showingOriginal = hasOriginal && expenseCommentViewingOriginalId === c.id;
  const displayContent = showingOriginal ? c.content_before_edit : c.content;
  const versionToggle = hasOriginal
    ? `<button type="button" onclick="toggleExpenseCommentVersion('${c.id}')"
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
  const mentionedYou = messageMentionsCurrentUser(displayContent);
  const mentionRowClass = mentionedYou ? ' msg-mentioned-you' : '';
  const versionActiveClass = showingOriginal ? ' chat-msg-version-active' : '';

  return `<div class="group flex gap-3${versionActiveClass}${mentionRowClass}" data-expense-comment-id="${c.id}">
      ${userAvatarHtml(user, 'w-7 h-7 shrink-0')}
      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between gap-2 mb-1">
          <div class="min-w-0">
            <span class="text-xs font-medium">${memberNameHtml(user, c.user_id, 'text-xs')}</span>
            <p class="text-xs text-gray-600 mt-0.5">${escHtml(formatChatDateTime(c.created_at))}${editedNote}</p>
          </div>
          ${renderExpenseCommentActions(c)}
        </div>
        ${bodyHtml}
        ${attachmentsHtml}
        ${renderReactionsBar('expense_comment', c.id, c.reactions || [])}
      </div>
    </div>`;
}

function toggleExpenseCommentVersion(commentId) {
  expenseCommentViewingOriginalId = expenseCommentViewingOriginalId === commentId ? null : commentId;
  renderExpenseComments();
}

function captureExpenseCommentEditDraft() {
  if (!editingExpenseCommentId) return;
  const ta = document.getElementById(`expenseCommentEditInput-${editingExpenseCommentId}`);
  if (ta) expenseCommentEditDraft = ta.value;
}

function renderExpenseComments(batchScrollHint) {
  const list = document.getElementById('expenseCommentsList');
  if (!list || !expenseCommentBatch) return;
  const scrollTop = list.scrollTop;
  const scrollHeight = list.scrollHeight;
  const atBottom = scrollHeight - list.clientHeight - scrollTop < 48;
  const emptyHtml = '<p class="text-sm text-gray-600 text-center py-8">No comments yet. Start the discussion.</p>';
  const { scrollToTop } = expenseCommentBatch.renderList(
    list,
    expenseComments,
    renderExpenseCommentBody,
    emptyHtml,
  );
  if (openReactionPicker || openReactorsPopover) syncReactionFloatUi();
  if (batchScrollHint === 'bottom' || (batchScrollHint !== 'top' && atBottom)) {
    scrollExpenseCommentsToBottom();
  } else if (batchScrollHint === 'top' || scrollToTop) {
    list.scrollTop = 0;
  } else {
    list.scrollTop = scrollTop;
  }
  if (editingExpenseCommentId) {
    const ta = document.getElementById(`expenseCommentEditInput-${editingExpenseCommentId}`);
    if (ta) {
      ta.value = expenseCommentEditDraft;
      ta.focus();
    }
  }
}

async function loadExpenseComments(expenseId) {
  if (!expenseId) return;
  const r = await apiFetch(`/api/teams/${teamId}/tasksplit/expenses/${expenseId}/comments`);
  const data = await parseJsonResponse(r);
  if (!r.ok) return;
  expenseComments = Array.isArray(data) ? data : [];
  expenseCommentsReady = true;
  renderExpenseComments('bottom');
}

function clearExpenseCommentPendingFile() {
  expenseCommentPendingFile = null;
  if (expenseCommentAttachPreviewUrl) {
    URL.revokeObjectURL(expenseCommentAttachPreviewUrl);
    expenseCommentAttachPreviewUrl = null;
  }
  const input = document.getElementById('expenseCommentAttachInput');
  if (input) input.value = '';
  document.getElementById('expenseCommentAttachPreview')?.classList.add('hidden');
}

function renderExpenseCommentAttachPreview() {
  const wrap = document.getElementById('expenseCommentAttachPreview');
  const thumb = document.getElementById('expenseCommentAttachPreviewThumb');
  const nameEl = document.getElementById('expenseCommentAttachPreviewName');
  const sizeEl = document.getElementById('expenseCommentAttachPreviewSize');
  if (!wrap || !expenseCommentPendingFile) {
    wrap?.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  if (nameEl) nameEl.textContent = expenseCommentPendingFile.name;
  if (sizeEl) sizeEl.textContent = formatFileSize(expenseCommentPendingFile.size);
  if (thumb) {
    if (expenseCommentAttachPreviewUrl) URL.revokeObjectURL(expenseCommentAttachPreviewUrl);
    if (expenseCommentPendingFile.type.startsWith('image/')) {
      expenseCommentAttachPreviewUrl = URL.createObjectURL(expenseCommentPendingFile);
      thumb.innerHTML = `<img src="${expenseCommentAttachPreviewUrl}" alt="" class="attachment-file-thumb" />`;
    } else {
      expenseCommentAttachPreviewUrl = null;
      thumb.innerHTML = `<div class="attachment-file-icon">${attachmentFileIconHtml(expenseCommentPendingFile.type)}</div>`;
    }
  }
}

function setExpenseCommentPendingFile(file) {
  if (!file) return;
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  if (!allowed.includes(file.type)) {
    showAlert('File type not allowed. Use JPEG, PNG, WebP, GIF, or PDF.');
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    showAlert('File must be 8 MB or smaller.');
    return;
  }
  expenseCommentPendingFile = file;
  renderExpenseCommentAttachPreview();
}

async function submitExpenseComment() {
  const expenseId = activeExpenseId;
  if (!expenseId) return;
  const input = document.getElementById('expenseCommentInput');
  const btn = document.getElementById('expenseCommentSendBtn');
  const file = expenseCommentPendingFile;
  const textContent = prepareOutgoingMessage(input?.value);

  const key = `expense-comment:${expenseId}`;
  if (messageSendInFlight.has(key) || sendCooldownTimers.has(key)) return;
  if (!textContent && !file) return;

  messageSendInFlight.add(key);
  if (input) input.disabled = true;
  if (btn) btn.disabled = true;

  const pendingId = `pending-${Date.now()}`;
  expenseCommentBatch?.showLatestBatch();
  expenseComments.push({
    id: pendingId,
    _pendingSend: true,
    _hasAttachment: !!file,
    user_id: currentUser?.id,
    user: currentUser,
    created_at: new Date().toISOString(),
    content: textContent || '',
  });
  renderExpenseComments('bottom');
  scrollExpenseCommentsToBottom();

  try {
    let r;
    if (file) {
      const form = new FormData();
      if (textContent) form.append('content', textContent);
      form.append('file', file);
      r = await apiFetch(`/api/teams/${teamId}/tasksplit/expenses/${expenseId}/comments`, { method: 'POST', body: form });
    } else {
      r = await apiFetch(`/api/teams/${teamId}/tasksplit/expenses/${expenseId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: textContent }),
      });
    }
    const data = await parseJsonResponse(r);
    if (!r.ok) {
      expenseComments = expenseComments.filter((c) => c.id !== pendingId);
      renderExpenseComments();
      const limited = messageSendRateLimitResult(r.status, data);
      if (limited) {
        applyMessageSendCooldown(key, {
          retryAfterMs: limited.rateLimit.retryAfterMs,
          error: limited.rateLimit.error,
          inputEl: input,
          sendBtnEl: btn,
          noticeEl: document.getElementById('expenseCommentSendCooldown'),
        });
        return;
      }
      showAlert(data.error || 'Failed to send comment');
      return;
    }
    expenseComments = expenseComments.filter((c) => c.id !== pendingId);
    expenseComments.push(data);
    if (input) input.value = '';
    clearExpenseCommentPendingFile();
    renderExpenseComments('bottom');
    scrollExpenseCommentsToBottom();
  } catch {
    expenseComments = expenseComments.filter((c) => c.id !== pendingId);
    renderExpenseComments();
  } finally {
    messageSendInFlight.delete(key);
    if (input) input.disabled = false;
    if (btn) btn.disabled = false;
  }
}

function startEditExpenseComment(commentId) {
  const c = expenseComments.find((x) => x.id === commentId);
  if (!c || c.deleted_at) return;
  editingExpenseCommentId = commentId;
  expenseCommentEditDraft = c.content;
  renderExpenseComments();
}

function cancelEditExpenseComment() {
  editingExpenseCommentId = null;
  expenseCommentEditDraft = '';
  renderExpenseComments();
}

async function saveEditExpenseComment(commentId) {
  const expenseId = activeExpenseId;
  if (!expenseId) return;
  const textarea = document.getElementById(`expenseCommentEditInput-${commentId}`);
  const content = prepareOutgoingMessage(textarea?.value);
  if (!content) return;
  editingExpenseCommentId = null;
  expenseCommentEditDraft = '';
  setPendingMessageOp('expense_comment', commentId, 'edit');
  renderExpenseComments();
  try {
    const r = await apiFetch(`/api/teams/${teamId}/tasksplit/expenses/${expenseId}/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const updated = await parseJsonResponse(r);
    if (!r.ok) {
      showAlert(updated.error || 'Failed to edit comment');
      return;
    }
    const idx = expenseComments.findIndex((c) => c.id === commentId);
    if (idx !== -1) expenseComments[idx] = updated;
    if (expenseCommentViewingOriginalId === commentId) expenseCommentViewingOriginalId = null;
  } finally {
    clearPendingMessageOp('expense_comment', commentId);
    renderExpenseComments();
  }
}

function deleteExpenseComment(commentId) {
  showConfirm({
    title: 'Delete comment',
    message: 'Delete this comment? This cannot be undone.',
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: () => executeDeleteExpenseComment(commentId),
  });
}

async function executeDeleteExpenseComment(commentId) {
  const expenseId = activeExpenseId;
  if (!expenseId) return;
  if (editingExpenseCommentId === commentId) {
    editingExpenseCommentId = null;
    expenseCommentEditDraft = '';
  }
  setPendingMessageOp('expense_comment', commentId, 'delete');
  renderExpenseComments();
  try {
    const r = await apiFetch(`/api/teams/${teamId}/tasksplit/expenses/${expenseId}/comments/${commentId}`, { method: 'DELETE' });
    const updated = await parseJsonResponse(r);
    if (!r.ok) {
      showAlert(updated.error || 'Failed to delete comment');
      return;
    }
    const idx = expenseComments.findIndex((c) => c.id === commentId);
    if (idx !== -1) expenseComments[idx] = updated;
    if (expenseCommentViewingOriginalId === commentId) expenseCommentViewingOriginalId = null;
  } finally {
    clearPendingMessageOp('expense_comment', commentId);
    renderExpenseComments();
  }
}

function resetExpenseDetailComments() {
  activeExpenseId = null;
  expenseComments = [];
  expenseCommentsReady = false;
  editingExpenseCommentId = null;
  expenseCommentEditDraft = '';
  expenseCommentViewingOriginalId = null;
  clearExpenseCommentPendingFile();
  expenseCommentBatch?.reset();
  const searchEl = document.getElementById('expenseCommentSearch');
  if (searchEl) searchEl.value = '';
}
