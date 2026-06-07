/**
 * taskflow/add-task.js
 * Add-task modal and task creation.
 * Depends on: state.js, helpers.js, kanban.js
 */

// Add Task
let addTaskStatusTarget = 'todo';
function syncAddTaskModalUi() {
  const guest = isGuest();
  const attBlock = document.getElementById('addTaskAttachmentsBlock');
  if (attBlock) attBlock.classList.toggle('hidden', guest);
  const colRow = document.getElementById('addTaskColumnRow');
  if (colRow) colRow.classList.toggle('hidden', !addTaskShowColumnPicker);
  document.getElementById('addTaskModalTitle').textContent = addTaskShowColumnPicker ? 'New task' : 'Add Task';
}
function openAddTask(status) {
  addTaskShowColumnPicker = false;
  addTaskStatusTarget = status || getTeamColumns()[0]?.slug || 'todo';
  syncAddTaskModalUi();
  resetAddTaskOptionalDrawer();
  document.getElementById('addTaskModal').classList.remove('hidden');
  pushTaskflowOverlay('addTask');
  setTimeout(() => document.getElementById('taskTitle').focus(), 50);
}
function openAddTaskWithColumnPicker() {
  addTaskShowColumnPicker = true;
  addTaskStatusTarget = getTeamColumns()[0]?.slug || 'todo';
  populateStatusDropdowns();
  const sel = document.getElementById('addTaskColumnSelect');
  if (sel) sel.value = addTaskStatusTarget;
  syncAddTaskModalUi();
  resetAddTaskOptionalDrawer();
  document.getElementById('addTaskModal').classList.remove('hidden');
  pushTaskflowOverlay('addTask');
  setTimeout(() => document.getElementById('taskTitle').focus(), 50);
}
function closeAddTaskUi() {
  document.getElementById('addTaskModal').classList.add('hidden');
  ['taskTitle','taskDesc'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
  const af = document.getElementById('addTaskAttachmentFiles');
  const cf = document.getElementById('addTaskCoverFile');
  if (af) af.value = '';
  if (cf) cf.value = '';
  const ct = document.getElementById('addTaskCoverToggle');
  if (ct) ct.checked = false;
  addTaskShowColumnPicker = false;
  renderAddTaskFilesList();
  renderAddTaskCoverPreview();
  const submitBtn = document.getElementById('addTaskSubmitBtn');
  if (submitBtn) setButtonLoading(submitBtn, false);
  taskSubmitSaving = false;
}
function closeAddTask() {
  requestCloseTaskflowOverlay();
}
async function uploadTaskAttachment(taskId, file, setAsCover = false) {
  const form = new FormData();
  form.append('file', file);
  if (setAsCover) form.append('set_as_cover', 'true');
  const r = await apiFetch(`/api/tasks/${taskId}/attachments`, { method: 'POST', body: form });
  const data = await parseJsonResponse(r);
  if (!r.ok) throw new Error(data.error || 'Upload failed');
  return data;
}
async function uploadTaskCover(taskId, file) {
  const att = await uploadTaskAttachment(taskId, file, true);
  const r = await apiFetch(`/api/tasks/${taskId}/cover`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cover_image_url: att.file_url }),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok) throw new Error(data.error || 'Failed to set cover');
  return data;
}
async function submitTask() {
  if (taskSubmitSaving) return;
  const title = document.getElementById('taskTitle').value.trim();
  if (!title) return;
  const submitBtn = document.getElementById('addTaskSubmitBtn');
  taskSubmitSaving = true;
  setButtonLoading(submitBtn, true, 'Creating…');
  const status = addTaskShowColumnPicker
    ? (document.getElementById('addTaskColumnSelect')?.value || addTaskStatusTarget)
    : addTaskStatusTarget;
  try {
    const r = await apiFetch(`/api/teams/${teamId}/tasks`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        title,
        description: document.getElementById('taskDesc').value.trim(),
        status,
        priority: document.getElementById('taskPriority').value,
        due_date: document.getElementById('taskDue').value || null,
        assigned_to: document.getElementById('taskAssignee').value || null
      })
    });
    let task = await parseJsonResponse(r);
    if (!r.ok) {
      showAlert(task.error || 'Failed to create task');
      return;
    }
    if (!isGuest()) {
      const files = document.getElementById('addTaskAttachmentFiles')?.files;
      const coverFile = document.getElementById('addTaskCoverFile')?.files?.[0];
      const useFirstAsCover = document.getElementById('addTaskCoverToggle')?.checked;
      setButtonLoading(submitBtn, true, 'Uploading files…');
      try {
        let firstImageUrl = null;
        if (files?.length) {
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const asCover = useFirstAsCover && i === 0 && f.type.startsWith('image/');
            const row = await uploadTaskAttachment(task.id, f, asCover);
            if (asCover) firstImageUrl = row.file_url;
            task.attachment_count = (task.attachment_count || 0) + 1;
          }
        }
        if (coverFile) {
          task = await uploadTaskCover(task.id, coverFile);
        } else if (firstImageUrl) {
          task.cover_image_url = firstImageUrl;
        }
      } catch (err) {
        showAlert(err.message || 'Task created but some uploads failed');
      }
    }
    tasks.push(task);
    renderTaskflow({ animateNew: true });
    closeAddTaskUi();
    if (history.state?.tfTaskflowOverlay) {
      taskflowHistoryPopping = true;
      history.back();
    } else {
      taskflowHistoryPopping = false;
    }
  } finally {
    taskSubmitSaving = false;
    setButtonLoading(submitBtn, false);
  }
}

function resetTaskModalToDetailsTab() {
  taskCommentsTabActive = false;
  commentUnreadBadgeLoading = false;
  document.getElementById('tab-details')?.classList.remove('hidden');
  document.getElementById('tab-comments')?.classList.add('hidden');
  document.querySelectorAll('[onclick^="switchTab"]').forEach((btn) => {
    const t = btn.getAttribute('onclick').match(/'(\w+)'/)[1];
    btn.className = t === 'details'
      ? 'tab-active text-sm py-3 mr-6 transition-colors'
      : 'tab-inactive text-sm py-3 mr-6 transition-colors' + (t === 'comments' ? ' relative' : '');
  });
  const badge = document.getElementById('commentUnreadBadge');
  if (badge) {
    badge.textContent = '';
    badge.innerHTML = '';
    badge.classList.remove('is-loading');
    badge.classList.add('hidden');
  }
}

function showCommentUnreadBadgeLoading() {
  commentUnreadBadgeLoading = true;
  const badge = document.getElementById('commentUnreadBadge');
  if (!badge || taskCommentsTabActive) return;
  badge.textContent = '';
  badge.innerHTML = '<span class="comment-unread-badge-spinner" aria-hidden="true"></span>';
  badge.classList.add('is-loading');
  badge.classList.remove('hidden');
}

function clearCommentUnreadBadgeLoading() {
  if (!commentUnreadBadgeLoading) return;
  commentUnreadBadgeLoading = false;
  const badge = document.getElementById('commentUnreadBadge');
  if (badge) {
    badge.classList.remove('is-loading');
    badge.innerHTML = '';
  }
  updateTaskCommentUnreadBadge();
}

function scrollCommentsToBottom() {
  const list = document.getElementById('commentsList');
  if (list) list.scrollTop = list.scrollHeight;
}

function isCommentsListAtBottom(list, threshold = 4) {
  if (!list) return true;
  return list.scrollHeight - list.scrollTop - list.clientHeight <= threshold;
}

async function ensureCommentsScrolledToBottom() {
  if (!commentBatch?.isAtLatest()) return;
  const list = document.getElementById('commentsList');
  if (!list) return;
  for (let i = 0; i < 24; i++) {
    scrollCommentsToBottom();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (isCommentsListAtBottom(list)) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  scrollCommentsToBottom();
}

async function finishCommentsTabLoading() {
  if (!taskCommentsTabActive) return;
  await ensureCommentsScrolledToBottom();
  clearCommentUnreadBadgeLoading();
}
