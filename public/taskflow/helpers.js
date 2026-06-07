/**
 * taskflow/helpers.js
 * Overlay management, modals, attachments, and shared utilities.
 * Depends on: state.js
 */

function setButtonLoading(btn, loading, loadingLabel) {
  if (!btn) return;
  if (loading) {
    if (!btn.dataset.origText) btn.dataset.origText = btn.textContent;
    btn.disabled = true;
    btn.classList.add('btn-loading', 'inline-flex', 'items-center', 'justify-center', 'gap-2');
    btn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span><span>${escHtml(loadingLabel || 'Loading…')}</span>`;
  } else {
    btn.disabled = false;
    btn.classList.remove('btn-loading', 'inline-flex', 'items-center', 'justify-center', 'gap-2');
    btn.textContent = btn.dataset.origText || btn.textContent;
    delete btn.dataset.origText;
  }
}

function setTaskModalBusy(show, text) {
  const el = document.getElementById('taskModalBusy');
  const label = document.getElementById('taskModalBusyText');
  if (!el) return;
  el.classList.toggle('hidden', !show);
  if (label && text) label.textContent = text;
}

function getTopTaskflowOverlay() {
  if (!document.getElementById('zoomLevelModal')?.classList.contains('hidden')) return 'zoomLevel';
  if (!document.getElementById('confirmModal')?.classList.contains('hidden')) return 'confirm';
  if (!document.getElementById('alertModal')?.classList.contains('hidden')) return 'alert';
  if (!document.getElementById('teamDeleteLockModal')?.classList.contains('hidden')) return 'teamDeleteLock';
  if (!document.getElementById('editTeamModal')?.classList.contains('hidden')) return 'editTeam';
  if (!document.getElementById('teamRolesModal')?.classList.contains('hidden')) return 'teamRoles';
  if (!document.getElementById('columnMgmtModal')?.classList.contains('hidden')) return 'columnMgmt';
  if (!document.getElementById('attachmentPreviewModal')?.classList.contains('hidden')) return 'attachmentPreview';
  if (!document.getElementById('taskModal')?.classList.contains('hidden')) return 'task';
  if (!document.getElementById('addTaskModal')?.classList.contains('hidden')) return 'addTask';
  if (chatPanelOpen) return 'chat';
  if (!document.getElementById('activityPanel')?.classList.contains('hidden')) return 'activity';
  if (!document.getElementById('teamPanel')?.classList.contains('hidden')) return 'team';
  if (!document.getElementById('settingsPanel')?.classList.contains('hidden')) return 'settings';
  return null;
}

function pushTaskflowOverlay(name) {
  if (taskflowHistoryPopping) return;
  const current = history.state?.tfTaskflowOverlay;
  if (current && isTaskflowSidepanel(current) && isTaskflowSidepanel(name)) {
    history.replaceState({ tfTaskflowOverlay: name, t: Date.now() }, '');
  } else {
    history.pushState({ tfTaskflowOverlay: name, t: Date.now() }, '');
  }
}

function requestCloseTaskflowOverlay() {
  if (getTopTaskflowOverlay()) history.back();
}

function dismissTaskflowOverlayHistory(expected) {
  const state = history.state?.tfTaskflowOverlay;
  if (state && (!expected || state === expected)) {
    taskflowHistoryPopping = true;
    history.back();
  }
}

function closeTaskflowOverlayBeforeOpen(name) {
  const prev = getTopTaskflowOverlay();
  if (!prev || prev === name) return;
  closeTaskflowOverlayUi(prev);
  if (!isTaskflowSidepanel(prev) && history.state?.tfTaskflowOverlay === prev) {
    dismissTaskflowOverlayHistory(prev);
  }
}

async function closeTaskflowOverlayUi(overlay) {
  switch (overlay) {
    case 'zoomLevel': closeZoomLevelModal(); break;
    case 'confirm': closeConfirmModal(); break;
    case 'alert': closeAlertModal(); break;
    case 'teamDeleteLock': closeTeamDeleteLockModal(); break;
    case 'editTeam': closeEditTeamModal(); break;
    case 'teamRoles': closeTeamRolesModal(); break;
    case 'columnMgmt': closeColumnMgmtModal(); break;
    case 'attachmentPreview': closeAttachmentPreviewUi(); break;
    case 'task': await closeTaskModalUi(); break;
    case 'addTask': closeAddTaskUi(); break;
    case 'chat': closeChatPanelUi(); break;
    case 'activity': closeActivityPanelUi(); break;
    case 'team': closeTeamPanelUi(); break;
    case 'settings': closeSettingsPanelUi(); break;
  }
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentFileIconHtml(mimeType) {
  if ((mimeType || '').startsWith('image/')) return ICON_IMAGE;
  return '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>';
}

function renderAddTaskFilesList() {
  const list = document.getElementById('addTaskFilesList');
  const input = document.getElementById('addTaskAttachmentFiles');
  if (!list || !input) return;
  const files = input.files ? Array.from(input.files) : [];
  if (!files.length) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = files.map((f, i) => {
    const isImg = f.type.startsWith('image/');
    const thumb = isImg
      ? `<img src="${URL.createObjectURL(f)}" alt="" class="attachment-file-thumb" />`
      : `<div class="attachment-file-icon">${attachmentFileIconHtml(f.type)}</div>`;
    return `<div class="attachment-file-row">
      ${thumb}
      <div class="min-w-0 flex-1">
        <p class="text-xs text-gray-200 truncate">${escHtml(f.name)}</p>
        <p class="text-[10px] text-gray-500">${formatFileSize(f.size)}</p>
      </div>
      <button type="button" class="attachment-icon-btn danger" onclick="removeAddTaskFile(${i})" title="Remove" aria-label="Remove ${escHtml(f.name)}">${ICON_TRASH}</button>
    </div>`;
  }).join('');
}

function removeAddTaskFile(index) {
  const input = document.getElementById('addTaskAttachmentFiles');
  if (!input?.files) return;
  const dt = new DataTransfer();
  Array.from(input.files).forEach((f, i) => { if (i !== index) dt.items.add(f); });
  input.files = dt.files;
  renderAddTaskFilesList();
}

function renderAddTaskCoverPreview() {
  const input = document.getElementById('addTaskCoverFile');
  const preview = document.getElementById('addTaskCoverPreview');
  const placeholder = document.getElementById('addTaskCoverPlaceholder');
  const zone = document.getElementById('addTaskCoverDropZone');
  const file = input?.files?.[0];
  if (!preview || !placeholder || !zone) return;
  if (!file) {
    preview.classList.add('hidden');
    preview.innerHTML = '';
    placeholder.classList.remove('hidden');
    zone.classList.remove('has-file');
    return;
  }
  placeholder.classList.add('hidden');
  preview.classList.remove('hidden');
  zone.classList.add('has-file');
  preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="" class="cover-upload-preview" />`;
}

function initAttachmentDropZone(zoneId, inputId, { onFiles, multiple = false } = {}) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) return;
  const openPicker = () => input.click();
  zone.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    openPicker();
  });
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
  });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    if (multiple) {
      const dt = new DataTransfer();
      Array.from(input.files || []).forEach((f) => dt.items.add(f));
      Array.from(files).forEach((f) => dt.items.add(f));
      input.files = dt.files;
    } else {
      input.files = files;
    }
    onFiles?.();
  });
  input.addEventListener('change', () => onFiles?.());
}

function showConfirm({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm }) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  const btn = document.getElementById('confirmActionBtn');
  btn.textContent = confirmLabel;
  btn.className = danger
    ? 'flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-2.5 rounded-xl transition text-sm'
    : 'flex-1 bg-brand-500 hover:bg-brand-600 text-white font-medium py-2.5 rounded-xl transition text-sm';
  confirmCallback = onConfirm;
  document.getElementById('confirmModal').classList.remove('hidden');
  pushTaskflowOverlay('confirm');
}

function closeConfirmModal() {
  document.getElementById('confirmModal').classList.add('hidden');
  confirmCallback = null;
}

function runConfirmAction() {
  const cb = confirmCallback;
  closeConfirmModal();
  dismissTaskflowOverlayHistory('confirm');
  if (cb) cb();
}

function showAlert(message, title = 'Something went wrong') {
  document.getElementById('alertTitle').textContent = title;
  document.getElementById('alertMessage').textContent = message;
  document.getElementById('alertModal').classList.remove('hidden');
  pushTaskflowOverlay('alert');
}

function closeAlertModal() {
  document.getElementById('alertModal').classList.add('hidden');
}

function showTeamDeleteLockModal() {
  document.getElementById('teamDeleteLockModal').classList.remove('hidden');
  pushTaskflowOverlay('teamDeleteLock');
}

function closeTeamDeleteLockModal() {
  document.getElementById('teamDeleteLockModal').classList.add('hidden');
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}