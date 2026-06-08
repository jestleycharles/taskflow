/**
 * TaskSplit balance calculations — splits, pairwise debts, simplification, settlements.
 */

const SPLIT_TYPES = new Set(['equal', 'percentage', 'custom', 'shares']);

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Split amount equally; remainder pennies go to earliest participants. */
function equalShares(amount, count) {
  if (count <= 0) return [];
  const totalCents = Math.round(Number(amount) * 100);
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  const shares = [];
  for (let i = 0; i < count; i += 1) {
    const cents = base + (i < remainder ? 1 : 0);
    shares.push(cents / 100);
  }
  return shares;
}

/** Proportional split by integer weights; remainder pennies to earliest entries. */
function weightedShares(amount, weights) {
  if (!weights?.length) return [];
  const totalWeight = weights.reduce((sum, w) => sum + Number(w), 0);
  if (totalWeight <= 0) return [];

  const totalCents = Math.round(Number(amount) * 100);
  const raw = weights.map((w) => (totalCents * Number(w)) / totalWeight);
  const floors = raw.map((v) => Math.floor(v));
  let remainder = totalCents - floors.reduce((s, v) => s + v, 0);

  const order = raw
    .map((v, i) => ({ i, frac: v - floors[i] }))
    .sort((a, b) => b.frac - a.frac);

  const cents = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k += 1) {
    cents[order[k].i] += 1;
    remainder -= 1;
  }

  return cents.map((c) => c / 100);
}

/**
 * Compute participant share rows from split type and input values.
 * @param {string} splitType
 * @param {number} amount
 * @param {Array<{ user_id: string, split_value?: number|null }>} entries
 * @returns {{ ok: true, rows: Array<{ user_id: string, share_amount: number, split_value: number|null }> } | { ok: false, error: string }}
 */
function computeParticipantShares(splitType, amount, entries) {
  const type = SPLIT_TYPES.has(splitType) ? splitType : 'equal';
  const list = (entries || []).map((e) => ({
    user_id: String(e.user_id),
    split_value: e.split_value != null ? Number(e.split_value) : null,
  }));

  if (!list.length) return { ok: false, error: 'At least one participant is required' };

  if (type === 'equal') {
    const shares = equalShares(amount, list.length);
    return {
      ok: true,
      rows: list.map((p, i) => ({
        user_id: p.user_id,
        share_amount: shares[i],
        split_value: null,
      })),
    };
  }

  if (type === 'percentage') {
    const pcts = list.map((p) => {
      if (p.split_value == null || !Number.isFinite(p.split_value) || p.split_value < 0) {
        return null;
      }
      return p.split_value;
    });
    if (pcts.some((v) => v == null)) {
      return { ok: false, error: 'Each participant needs a percentage' };
    }
    const totalPct = roundMoney(pcts.reduce((s, v) => s + v, 0));
    if (Math.abs(totalPct - 100) > 0.01) {
      return { ok: false, error: 'Percentages must add up to 100%' };
    }
    const shares = weightedShares(amount, pcts);
    return {
      ok: true,
      rows: list.map((p, i) => ({
        user_id: p.user_id,
        share_amount: shares[i],
        split_value: roundMoney(p.split_value),
      })),
    };
  }

  if (type === 'custom') {
    const amounts = list.map((p) => {
      if (p.split_value == null || !Number.isFinite(p.split_value) || p.split_value < 0) {
        return null;
      }
      return roundMoney(p.split_value);
    });
    if (amounts.some((v) => v == null)) {
      return { ok: false, error: 'Each participant needs a custom amount' };
    }
    const sum = roundMoney(amounts.reduce((s, v) => s + v, 0));
    if (Math.abs(sum - roundMoney(amount)) > 0.01) {
      return { ok: false, error: 'Custom amounts must add up to the expense total' };
    }
    return {
      ok: true,
      rows: list.map((p, i) => ({
        user_id: p.user_id,
        share_amount: amounts[i],
        split_value: amounts[i],
      })),
    };
  }

  // shares
  const counts = list.map((p) => {
    if (p.split_value == null || !Number.isFinite(p.split_value) || p.split_value <= 0) {
      return null;
    }
    return p.split_value;
  });
  if (counts.some((v) => v == null)) {
    return { ok: false, error: 'Each participant needs a positive share count' };
  }
  const shareAmounts = weightedShares(amount, counts);
  return {
    ok: true,
    rows: list.map((p, i) => ({
      user_id: p.user_id,
      share_amount: shareAmounts[i],
      split_value: roundMoney(p.split_value),
    })),
  };
}

function splitTypeLabel(splitType) {
  switch (splitType) {
    case 'percentage':
      return 'Split by percentage';
    case 'custom':
      return 'Split by amount';
    case 'shares':
      return 'Split by shares';
    default:
      return 'Split equally';
  }
}

/**
 * Build pairwise debt map: key `${debtorId}:${creditorId}` → amount debtor owes creditor.
 */
function buildPairwiseDebts(expenses, settlements) {
  const debts = new Map();

  function addDebt(debtor, creditor, amount) {
    if (!debtor || !creditor || debtor === creditor || amount <= 0) return;
    const key = `${debtor}:${creditor}`;
    debts.set(key, roundMoney((debts.get(key) || 0) + amount));
  }

  function reduceDebt(debtor, creditor, amount) {
    if (!debtor || !creditor || debtor === creditor || amount <= 0) return;
    const key = `${debtor}:${creditor}`;
    const next = roundMoney(Math.max(0, (debts.get(key) || 0) - amount));
    if (next <= 0) debts.delete(key);
    else debts.set(key, next);
  }

  for (const expense of expenses || []) {
    const paidBy = expense.paid_by;
    for (const p of expense.participants || []) {
      if (p.user_id !== paidBy) {
        addDebt(p.user_id, paidBy, Number(p.share_amount));
      }
    }
  }

  for (const s of settlements || []) {
    reduceDebt(s.from_user, s.to_user, Number(s.amount));
  }

  return debts;
}

/**
 * Net balance per user: positive = others owe you, negative = you owe others.
 */
function computeNetBalances(expenses, settlements, memberIds) {
  const balances = new Map((memberIds || []).map((id) => [id, 0]));

  for (const expense of expenses || []) {
    const paidBy = expense.paid_by;
    balances.set(paidBy, roundMoney((balances.get(paidBy) || 0) + Number(expense.amount)));
    for (const p of expense.participants || []) {
      balances.set(p.user_id, roundMoney((balances.get(p.user_id) || 0) - Number(p.share_amount)));
    }
  }

  for (const s of settlements || []) {
    balances.set(s.from_user, roundMoney((balances.get(s.from_user) || 0) + Number(s.amount)));
    balances.set(s.to_user, roundMoney((balances.get(s.to_user) || 0) - Number(s.amount)));
  }

  return balances;
}

/**
 * Minimum-cash-flow debt simplification from net balances.
 * @returns {Array<{ from_user: string, to_user: string, amount: number }>}
 */
function simplifyDebts(netBalances, memberIds) {
  const creditors = [];
  const debtors = [];

  for (const id of memberIds || []) {
    const bal = roundMoney(netBalances.get(id) || 0);
    if (bal > 0.001) creditors.push({ id, amount: bal });
    else if (bal < -0.001) debtors.push({ id, amount: -bal });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const simplified = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const pay = roundMoney(Math.min(debtors[i].amount, creditors[j].amount));
    if (pay > 0) {
      simplified.push({ from_user: debtors[i].id, to_user: creditors[j].id, amount: pay });
    }
    debtors[i].amount = roundMoney(debtors[i].amount - pay);
    creditors[j].amount = roundMoney(creditors[j].amount - pay);
    if (debtors[i].amount <= 0.001) i += 1;
    if (creditors[j].amount <= 0.001) j += 1;
  }

  return simplified;
}

function simplifiedDebtsToMap(debts) {
  const map = new Map();
  for (const d of debts || []) {
    const key = `${d.from_user}:${d.to_user}`;
    map.set(key, roundMoney((map.get(key) || 0) + Number(d.amount)));
  }
  return map;
}

/**
 * Balance center view for a specific user using simplified debts.
 */
function balanceCenterForUser(debts, currentUserId, memberIds) {
  const youOwe = [];
  const youAreOwed = [];

  for (const otherId of memberIds || []) {
    if (otherId === currentUserId) continue;
    const oweKey = `${currentUserId}:${otherId}`;
    const owedKey = `${otherId}:${currentUserId}`;
    const oweAmt = debts.get(oweKey) || 0;
    const owedAmt = debts.get(owedKey) || 0;

    if (oweAmt > 0) youOwe.push({ user_id: otherId, amount: oweAmt });
    if (owedAmt > 0) youAreOwed.push({ user_id: otherId, amount: owedAmt });
  }

  youOwe.sort((a, b) => b.amount - a.amount);
  youAreOwed.sort((a, b) => b.amount - a.amount);

  return { you_owe: youOwe, you_are_owed: youAreOwed };
}

/** Pairwise amount `fromUserId` owes `toUserId` (0 if none). */
function pairwiseOwed(debts, fromUserId, toUserId) {
  return debts.get(`${fromUserId}:${toUserId}`) || 0;
}

module.exports = {
  SPLIT_TYPES,
  roundMoney,
  equalShares,
  weightedShares,
  computeParticipantShares,
  splitTypeLabel,
  buildPairwiseDebts,
  computeNetBalances,
  simplifyDebts,
  simplifiedDebtsToMap,
  balanceCenterForUser,
  pairwiseOwed,
};
