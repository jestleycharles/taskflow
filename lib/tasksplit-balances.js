/**
 * TaskSplit balance calculations (v1: equal split + settlements).
 */

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

/**
 * Build pairwise debt map: key `${debtorId}:${creditorId}` → amount debtor owes creditor.
 * @param {Array<{ paid_by: string, amount: number, participants: Array<{ user_id: string, share_amount: number }> }>} expenses
 * @param {Array<{ from_user: string, to_user: string, amount: number }>} settlements
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
 * Balance center view for a specific user.
 * @returns {{ you_owe: Array<{ user_id: string, amount: number }>, you_are_owed: Array<{ user_id: string, amount: number }>, net_balances: Array<{ user_id: string, balance: number }> }}
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

/** Pairwise amount current user owes `otherUserId` (0 if none). */
function pairwiseOwed(debts, currentUserId, otherUserId) {
  return debts.get(`${currentUserId}:${otherUserId}`) || 0;
}

module.exports = {
  roundMoney,
  equalShares,
  buildPairwiseDebts,
  computeNetBalances,
  balanceCenterForUser,
  pairwiseOwed,
};
