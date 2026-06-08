/**
 * TaskSplit helpers — expense formatting and panel utilities.
 */

const TASKSPLIT_CURRENCIES = {
  PHP: { symbol: '₱', name: 'Philippine Peso', position: 'before' },
  USD: { symbol: '$', name: 'US Dollar', position: 'before' },
  EUR: { symbol: '€', name: 'Euro', position: 'before' },
  GBP: { symbol: '£', name: 'British Pound', position: 'before' },
  JPY: { symbol: '¥', name: 'Japanese Yen', position: 'before', decimals: 0 },
  AUD: { symbol: 'A$', name: 'Australian Dollar', position: 'before' },
  CAD: { symbol: 'C$', name: 'Canadian Dollar', position: 'before' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar', position: 'before' },
  INR: { symbol: '₹', name: 'Indian Rupee', position: 'before' },
  MYR: { symbol: 'RM', name: 'Malaysian Ringgit', position: 'before' },
};

function getTeamCurrencyCode() {
  const code = workspaceData?.team?.currency_code || 'PHP';
  return TASKSPLIT_CURRENCIES[code] ? code : 'PHP';
}

function formatMoney(amount) {
  const code = getTeamCurrencyCode();
  const currency = TASKSPLIT_CURRENCIES[code];
  const n = Number(amount || 0);
  const decimals = currency.decimals ?? 2;
  const formatted = decimals === 0 ? Math.round(n).toString() : n.toFixed(decimals);
  return currency.position === 'after'
    ? `${formatted}${currency.symbol}`
    : `${currency.symbol}${formatted}`;
}

function todayLocalDateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
}
