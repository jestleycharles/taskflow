/**
 * board/team-board.js
 * Team loading, member rendering, board rendering, and init().
 * Depends on: state.js, helpers.js, members.js
 */

async function init() {
  showNavigationLoading('Loading team…');
  try {
    const r = await apiFetch('/api/me');
    const meData = await parseJsonResponse(r);
    if (!r.ok) {
      if (isApiUnauthorizedUpdate(r, meData)) return;
      if (r.status === 401) {
        window.location = '/login';
        return;
      }
      return;
    }
    currentUser = meData;
    if (currentUser.error) return;
    const teamOk = await loadTeam();
    if (!teamOk) return;
    await loadTasks();
    applyChatComposerState();
    applyCommentComposerState();
    applyGuestTeamAvatarUploadUi();
    syncAddTaskModalUi();
    await loadChatReadState();
    await loadChat();
    startPolling();
    startChatPolling();
    startPresence();
  } finally {
    hideNavigationLoading();
  }
}

function isGuest() {
  return !!currentUser?.is_guest;
}

function applyChatComposerState() {
  const guest = isGuest();
  document.getElementById('chatComposerActive').classList.toggle('hidden', guest);
  document.getElementById('chatGuestNotice').classList.toggle('hidden', !guest);
  document.getElementById('chatAttachPreview')?.classList.toggle('hidden', guest || !chatPendingFile);
  if (guest) clearChatPendingFile();
}

function applyCommentComposerState() {
  const guest = isGuest();
  document.getElementById('commentAttachBtn')?.classList.toggle('hidden', guest);
  document.getElementById('commentAttachPreview')?.classList.toggle('hidden', guest || !commentPendingFile);
  if (guest) clearCommentPendingFile();
}

function clearCommentPendingFile() {
  commentPendingFile = null;
  if (commentAttachPreviewUrl) {
    URL.revokeObjectURL(commentAttachPreviewUrl);
    commentAttachPreviewUrl = null;
  }
  const input = document.getElementById('commentAttachInput');
  if (input) input.value = '';
  document.getElementById('commentAttachPreview')?.classList.add('hidden');
}

function renderCommentAttachPreview() {
  const wrap = document.getElementById('commentAttachPreview');
  const thumb = document.getElementById('commentAttachPreviewThumb');
  const nameEl = document.getElementById('commentAttachPreviewName');
  const sizeEl = document.getElementById('commentAttachPreviewSize');
  if (!wrap || !commentPendingFile) {
    wrap?.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  if (nameEl) nameEl.textContent = commentPendingFile.name;
  if (sizeEl) sizeEl.textContent = formatFileSize(commentPendingFile.size);
  if (thumb) {
    if (commentAttachPreviewUrl) URL.revokeObjectURL(commentAttachPreviewUrl);
    if (commentPendingFile.type.startsWith('image/')) {
      commentAttachPreviewUrl = URL.createObjectURL(commentPendingFile);
      thumb.innerHTML = `<img src="${commentAttachPreviewUrl}" alt="" class="attachment-file-thumb" />`;
    } else {
      commentAttachPreviewUrl = null;
      thumb.innerHTML = `<div class="attachment-file-icon">${attachmentFileIconHtml(commentPendingFile.type)}</div>`;
    }
  }
}

function setCommentPendingFile(file) {
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
  commentPendingFile = file;
  renderCommentAttachPreview();
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
  chatPendingFile = file;
  renderChatAttachPreview();
}

function applyGuestTeamAvatarUploadUi() {
  const guest = isGuest();
  const label = document.getElementById('editTeamAvatarUploadLabel');
  const note = document.getElementById('editTeamAvatarUploadGuestNote');
  const input = document.getElementById('editTeamAvatarFile');
  const hint = document.querySelector('#editTeamModal .flex.items-center.gap-4.mb-4 .text-sm.text-gray-300');
  if (label) label.classList.toggle('hidden', guest);
  if (note) note.classList.toggle('hidden', !guest);
  if (input && guest) input.value = '';
  if (hint) hint.textContent = guest ? 'Choose a preset avatar' : 'Choose a preset or upload your own';
}

function applyInviteSectionState() {
  const section = document.getElementById('inviteSection');
  const email = document.getElementById('inviteEmail');
  const btn = document.getElementById('inviteBtn');
  const linkBtn = document.getElementById('copyInviteLinkBtn');
  const linkBlock = document.getElementById('inviteLinkBlock');
  const guestNote = document.getElementById('inviteGuestExclusive');
  if (!section || section.classList.contains('hidden')) return;
  const ownerGuest = !!teamData?.owner_is_guest;
  if (guestNote) guestNote.classList.toggle('hidden', !ownerGuest);
  if (email) email.disabled = ownerGuest;
  if (btn) btn.disabled = ownerGuest;
  if (linkBtn) linkBtn.disabled = ownerGuest;
  if (linkBlock) linkBlock.classList.toggle('opacity-50', ownerGuest);
}

async function loadTeam() {
  const prevColSig = columnsStructureSig(teamColumns.length ? teamColumns : teamData?.columns);
  const r = await apiFetch(`/api/teams/${teamId}`);
  const data = await parseJsonResponse(r);
  if (!r.ok) {
    if (isTeamAccessLostResponse(r.status, data)) {
      showTeamGoneModal();
      return false;
    }
    window.location = '/dashboard';
    return false;
  }
  teamData = data;
  teamData.roles = teamData.roles || [];
  teamData.columns = teamData.columns || [];
  teamColumns = teamData.columns;
  teamData.separate_role_members = !!teamData.separate_role_members;
  teamData.pending_invites = teamData.pending_invites || [];
  const columnsChanged = columnsStructureSig(teamData.columns) !== prevColSig;
  applyTeamHeader();
  if (columnsChanged) {
    renderKanbanBoard();
    populateStatusDropdowns();
  }
  renderMemberAvatars(teamData.members);
  renderMemberList(teamData.members);
  populateAssigneeDropdowns(teamData.members);
  applyCurrentUserTeamRoleUi();
  fetchOnlineMembers();
  updateMemberStatsDisplay();
  captureTeamRoleStateSig();
  initMentionComposers();
  applyInviteSectionState();
  if (tasks.length) renderBoard();
  ensureBoardTasksRendered();
  return true;
}

function updateMemberStatsDisplay() {
  const total = teamData?.member_count ?? teamData?.members?.length ?? 0;
  const online = teamData?.online_count ?? onlineUserIds.size;
  const label = `${online}/${total} online`;
  const el = document.getElementById('teamMemberStats');
  const btnEl = document.getElementById('teamBtnMemberStats');
  const panelEl = document.getElementById('teamPanelMemberStats');
  if (el) {
    el.textContent = label;
    el.classList.toggle('hidden', !total);
  }
  if (btnEl) btnEl.textContent = total ? ` · ${label}` : '';
  if (panelEl) panelEl.textContent = total ? `${total} member${total === 1 ? '' : 's'} · ${label}` : '';
}

function renderMemberAvatars(members) {
  const container = document.getElementById('memberAvatars');
  container.innerHTML = members.slice(0, 4).map(m =>
    userAvatarHtml(m, 'w-7 h-7 pointer-events-none')
  ).join('');
}

function memberAvatarHtml(m, sizeClass) {
  const online = isUserOnline(m.id);
  return `<div class="relative shrink-0" title="${escHtml(m.username)}">
      ${userAvatarHtml(m, sizeClass)}
      ${online ? '<span class="online-dot absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-ink-800" title="Online"></span>' : ''}
    </div>`;
}

function isUserOnline(userId) {
  return onlineUserIds.has(String(userId));
}

function chatMessageAvatarHtml(user, userId) {
  const id = userId || user?.id;
  const online = id && isUserOnline(id);
  const title = online ? 'Online on this board' : escHtml(user?.username || '?');
  return `<div class="relative shrink-0 self-start w-8 h-8" title="${title}">
      ${userAvatarHtml(user, 'w-8 h-8')}
      ${online ? '<span class="online-dot absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-ink-800" title="Online"></span>' : ''}
    </div>`;
}

function renderMemberList(members) {
  const isOwner = teamData?.userRole === 'owner';
  const assignHint = isOwner && canAssignTeamRoles()
    ? '<p class="text-xs text-gray-500 mb-3 shrink-0">Assign a display role to each member (owner cannot be changed). Pending invites cannot be assigned roles until they accept.</p>'
    : '';
  document.getElementById('memberList').innerHTML =
    assignHint +
    renderMemberSectionsHtml(membersWithPending(members), {
      showAssign: canAssignTeamRoles(),
      showRemove: isOwner,
      showPermissionRole: !canAssignTeamRoles(),
    });
  if (teamData?.userRole !== 'owner') {
    document.getElementById('inviteSection').classList.add('hidden');
  } else {
    document.getElementById('inviteSection').classList.remove('hidden');
    applyInviteSectionState();
  }
}

function populateAssigneeDropdowns(members) {
  const opts = '<option value="">Unassigned</option>' + members.map(m =>
    `<option value="${m.id}">${escHtml(m.username)}</option>`).join('');
  document.getElementById('taskAssignee').innerHTML = opts;
  document.getElementById('detailAssignee').innerHTML = opts;
}

function getTeamColumns() {
  return teamColumns.length ? teamColumns : (teamData?.columns || []);
}

function columnsStructureSig(columns) {
  return JSON.stringify(
    (columns || [])
      .map((c) => `${c.id}:${c.name}:${c.slug}:${c.sort_order}`)
      .sort(),
  );
}

function columnDropZoneId(slug) {
  return `col-${slug}`;
}

function getColumnDropZone(slug) {
  const id = columnDropZoneId(slug);
  return (
    document.getElementById(id)
    || document.querySelector(`#kanbanBoard .kanban-col[data-status="${slug}"] .drop-zone`)
  );
}

function boardHasTaskSkeletons() {
  return !!document.querySelector('#kanbanBoard .task-skeleton');
}

function ensureBoardTasksRendered() {
  if (tasks.length && boardHasTaskSkeletons()) renderBoard();
}

function columnLabel(slug) {
  const col = getTeamColumns().find((c) => c.slug === slug);
  return col?.name || slug;
}

function populateStatusDropdowns() {
  const cols = getTeamColumns();
  const opts = cols.map((c) =>
    `<option value="${escHtml(c.slug)}">${escHtml(c.name)}</option>`).join('');
  const detail = document.getElementById('detailStatus');
  if (detail) detail.innerHTML = opts;
  const addSel = document.getElementById('addTaskColumnSelect');
  if (addSel) addSel.innerHTML = opts;
  if (activeTaskId && detail) {
    const task = tasks.find((t) => t.id === activeTaskId);
    if (task) detail.value = task.status;
  }
}

function taskSkeletonHtml() {
  return `<div class="task-skeleton border-l-2 border-gray-700 bg-ink-800 border border-white/10 rounded-xl p-3.5">
    <div class="flex items-start justify-between gap-2 mb-2.5">
      <div class="skeleton h-3.5 w-3/4 rounded"></div>
      <div class="skeleton h-5 w-14 rounded-md shrink-0"></div>
    </div>
    <div class="skeleton h-2.5 w-full rounded mb-3.5"></div>
    <div class="flex items-center justify-between">
      <div class="skeleton h-2.5 w-12 rounded"></div>
    </div>
  </div>`;
}

function renderKanbanBoard() {
  const board = document.getElementById('kanbanBoard');
  if (!board) return;
  const cols = getTeamColumns();
  const minW = Math.max(700, cols.length * 220);
  board.style.minWidth = cols.length ? `${minW}px` : '';
  if (!cols.length) {
    board.innerHTML = '<p class="text-sm text-gray-500 p-4">Loading columns…</p>';
    return;
  }
  board.innerHTML = cols.map((col) => {
    const color = col.color_hex || '#64748b';
    return `<div class="kanban-col board-pan-surface flex-1 flex flex-col min-w-[200px]" data-status="${escHtml(col.slug)}">
      <div class="board-pan-surface flex items-center justify-between mb-3 px-1">
        <div class="flex items-center gap-2 min-w-0">
          <div class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${escHtml(color)}"></div>
          <span class="text-xs font-semibold uppercase tracking-widest truncate" style="color:${escHtml(color)}">${escHtml(col.name)}</span>
          <span id="count-${escHtml(col.slug)}" class="text-xs rounded-full px-2 py-0.5 shrink-0" style="background:${escHtml(color)}22;color:${escHtml(color)}">0</span>
        </div>
        <button type="button" onclick="openAddTask('${escHtml(col.slug)}')" class="text-gray-500 hover:text-white transition p-1 rounded-lg hover:bg-white/10 shrink-0" aria-label="Add task to ${escHtml(col.name)}">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
        </button>
      </div>
      <div class="drop-zone board-pan-surface flex-1 rounded-xl p-2 space-y-2" id="${columnDropZoneId(col.slug)}"
        ondragover="dragOver(event)" ondrop="drop(event)" ondragleave="dragLeave(event)">
        ${taskSkeletonHtml()}${taskSkeletonHtml()}
      </div>
    </div>`;
  }).join('') + '<div class="kanban-pan-spacer hidden md:block" aria-hidden="true"></div>';
  scheduleBoardZoomRemeasure();
}

async function loadTasks() {
  const r = await apiFetch(`/api/teams/${teamId}/tasks`);
  const data = await parseJsonResponse(r);
  if (!r.ok) {
    if (isTeamAccessLostResponse(r.status, data)) showTeamGoneModal();
    return;
  }
  tasks = data;
  renderBoard();
}

function boardTaskFieldsChanged(a, b) {
  if (!a || !b) return true;
  const keys = ['id', 'title', 'description', 'status', 'priority', 'due_date', 'assigned_to', 'position', 'cover_image_url', 'attachment_count'];
  if (keys.some((k) => a[k] !== b[k])) return true;
  return JSON.stringify(a.assignee) !== JSON.stringify(b.assignee);
}

function mergePolledTasks(newTasks) {
  const prevMap = new Map(tasks.map((t) => [t.id, t]));
  const prevIds = new Set(tasks.map((t) => t.id));
  const nextIds = new Set(newTasks.map((t) => t.id));
  let boardDirty = prevIds.size !== nextIds.size;
  const merged = newTasks.map((nt) => {
    const prev = prevMap.get(nt.id);
    let unread = nt.unread_comment_count || 0;
    const lastRead = taskCommentsLastReadAt[nt.id];
    if (lastRead != null && (prev?.unread_comment_count || 0) === 0) unread = 0;
    if (nt.id === activeTaskId && taskCommentsTabActive) unread = 0;
    const mergedTask = { ...nt, unread_comment_count: unread };
    if (!boardDirty && (!prev || boardTaskFieldsChanged(prev, mergedTask))) boardDirty = true;
    return mergedTask;
  });
  return { merged, boardDirty };
}

function renderBoard({ animateNew = false } = {}) {
  const existingIds = new Set(
    [...document.querySelectorAll('.task-card[data-id]')].map((el) => el.dataset.id)
  );
  getTeamColumns().forEach((col) => {
    const status = col.slug;
    const zone = getColumnDropZone(status);
    const countEl = document.getElementById(`count-${status}`);
    if (!zone) return;
    const colTasks = getSortedColumnTasks(status);
    if (countEl) countEl.textContent = colTasks.length;
    zone.innerHTML = '';
    colTasks.forEach((task) => {
      const isNew = animateNew && !existingIds.has(String(task.id));
      zone.appendChild(createTaskCard(task, isNew));
    });
  });
  scheduleBoardZoomRemeasure();
}

function getSortedColumnTasks(status) {
  return tasks
    .filter((t) => t.status === status)
    .sort((a, b) => (a.position || 0) - (b.position || 0));
}

function clearTaskDragIndicators() {
  dragOverTaskId = null;
  dragOverTaskPlacement = null;
  document.querySelectorAll('.task-card.drag-over-top, .task-card.drag-over-bottom').forEach((el) => {
    el.classList.remove('drag-over-top', 'drag-over-bottom');
  });
}

function createTaskCard(task, animate = false) {
  const el = document.createElement('div');
  el.className = `task-card bg-ink-800 border border-white/10 hover:border-white/20 rounded-xl p-3.5 priority-${task.priority}${animate ? ' fade-up' : ''}`;
  el.dataset.id = task.id;
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    draggedTaskId = task.id;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    draggedTaskId = null;
    clearTaskDragIndicators();
    if (layoutPersistQueued) flushLayoutPersist();
  });
  el.addEventListener('dragover', (e) => {
    if (!draggedTaskId || draggedTaskId === task.id) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = el.getBoundingClientRect();
    const placement = e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
    if (dragOverTaskId !== task.id || dragOverTaskPlacement !== placement) {
      clearTaskDragIndicators();
      dragOverTaskId = task.id;
      dragOverTaskPlacement = placement;
      el.classList.add(placement === 'top' ? 'drag-over-top' : 'drag-over-bottom');
    }
  });
  el.addEventListener('dragleave', (e) => {
    if (!el.contains(e.relatedTarget)) {
      el.classList.remove('drag-over-top', 'drag-over-bottom');
      if (dragOverTaskId === task.id) {
        dragOverTaskId = null;
        dragOverTaskPlacement = null;
      }
    }
  });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleTaskCardDrop(task, e);
  });
  el.onclick = () => openTaskModal(task.id);

  const due = task.due_date ? formatDue(task.due_date) : null;
  const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const attCount = task.attachment_count || 0;
  const coverHtml = task.cover_image_url
    ? `<div class="task-card-cover" data-preview-cover data-url="${escHtml(task.cover_image_url)}" data-mime="image/jpeg" data-name="Cover" role="button" tabindex="0" title="Preview cover"><img src="${escHtml(task.cover_image_url)}" alt="" loading="lazy" ${storageImageOnErrorAttr()} /></div>`
    : '';

  el.innerHTML = `
    ${coverHtml}
    <div class="flex items-start justify-between gap-2 mb-2">
      <p class="text-sm text-white font-medium leading-snug">${escHtml(task.title)}</p>
      <span class="text-xs px-1.5 py-0.5 rounded-md ${pc.bg} shrink-0">${pc.label}</span>
    </div>
    ${task.description ? `<p class="text-xs text-gray-500 mb-2.5 line-clamp-2">${escHtml(task.description)}</p>` : ''}
    <div class="flex items-center justify-between mt-2">
      ${task.assignee ? `<div class="flex items-center gap-1.5">
        ${userAvatarHtml(task.assignee, 'w-5 h-5')}
        <span class="text-xs">${memberNameHtml(task.assignee, task.assignee.id, 'text-xs')}</span>
      </div>` : '<div></div>'}
      <div class="task-card-badges flex items-center gap-2 shrink-0">
        ${attCount > 0 ? `<span class="task-attachment-meta" title="${attCount} attachment${attCount === 1 ? '' : 's'}">📎 ${attCount}</span>` : ''}
        ${(task.unread_comment_count || 0) > 0 ? `<span class="task-comment-unread-badge flex items-center justify-center rounded-full bg-red-500 text-white font-bold px-1" title="Unread comments">${task.unread_comment_count > 99 ? '99+' : task.unread_comment_count}</span>` : ''}
        ${due ? `<span class="text-xs font-medium ${due.class}">${due.label}</span>` : ''}
      </div>
    </div>`;
  return el;
}

function formatDue(dateStr) {
  const due = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((due - today) / 86400000);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, class: 'overdue' };
  if (diff === 0) return { label: 'Due today', class: 'due-soon' };
  if (diff <= 3) return { label: `Due in ${diff}d`, class: 'due-soon' };
  return { label: due.toLocaleDateString('en-US', { month:'short', day:'numeric' }), class: 'text-gray-500' };
}
