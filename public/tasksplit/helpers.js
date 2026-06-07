/**
 * TaskSplit helpers — modals, formatting, overlays.
 */

function formatMoney(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function expenseModeLabel(mode) {
  const map = { solo: 'Solo', duo: 'Duo', group: 'Group' };
  return map[mode] || mode;
}

function showAlert(message, title = 'Something went wrong') {
  document.getElementById('alertTitle').textContent = title;
  document.getElementById('alertMessage').textContent = message;
  document.getElementById('alertModal').classList.remove('hidden');
}

function closeAlertModal() {
  document.getElementById('alertModal').classList.add('hidden');
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
}

function closeConfirmModal() {
  document.getElementById('confirmModal').classList.add('hidden');
  confirmCallback = null;
}

function runConfirmAction() {
  const cb = confirmCallback;
  closeConfirmModal();
  if (cb) cb();
}

function setButtonLoading(btn, loading, label) {
  if (!btn) return;
  if (loading) {
    if (!btn.dataset.origText) btn.dataset.origText = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span><span>${escHtml(label || 'Loading…')}</span>`;
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.origText || btn.textContent;
    delete btn.dataset.origText;
  }
}

function closeAllPanels() {
  document.getElementById('activityPanel')?.classList.add('hidden');
  document.getElementById('teamPanel')?.classList.add('hidden');
  document.getElementById('balancePanel')?.classList.add('hidden');
  setSidePanelMobileOpen(false);
  restoreBalanceSidebarIfNeeded();
}
