/**
 * Attachment preview modal (shared pattern with taskflow/tasks.js).
 */

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
