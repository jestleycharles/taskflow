/**
 * TaskSplit helpers — expense formatting and panel utilities.
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

function closeAllPanels() {
  closeActivityPanelUi?.();
  closeTeamPanelUi?.();
  closeBalancePanelUi?.();
  closeSettingsPanelUi?.();
  closeChatPanelUi?.();
  setSidePanelMobileOpen(false);
  restoreBalanceSidebarIfNeeded();
}
