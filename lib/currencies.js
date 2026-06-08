const CURRENCIES = {
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

const DEFAULT_CURRENCY = 'PHP';

function normalizeCurrencyCode(code) {
  const upper = String(code || '').trim().toUpperCase();
  return CURRENCIES[upper] ? upper : DEFAULT_CURRENCY;
}

function formatCurrencyAmount(amount, code = DEFAULT_CURRENCY) {
  const currency = CURRENCIES[normalizeCurrencyCode(code)];
  const n = Number(amount || 0);
  const decimals = currency.decimals ?? 2;
  const formatted = decimals === 0 ? Math.round(n).toString() : n.toFixed(decimals);
  return currency.position === 'after'
    ? `${formatted}${currency.symbol}`
    : `${currency.symbol}${formatted}`;
}

module.exports = {
  CURRENCIES,
  DEFAULT_CURRENCY,
  normalizeCurrencyCode,
  formatCurrencyAmount,
};
