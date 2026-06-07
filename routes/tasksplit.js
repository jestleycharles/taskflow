const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { sendError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const {
  roundMoney,
  equalShares,
  buildPairwiseDebts,
  computeNetBalances,
  balanceCenterForUser,
  pairwiseOwed,
} = require('../lib/tasksplit-balances');
const {
  loadExpenseTeam,
  loadTeamMembers,
  logTaskSplitActivity,
} = require('../lib/tasksplit-team');
const { isGuestUser } = require('../lib/user');

const router = express.Router();

function parseAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return roundMoney(n);
}

function parseDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const d = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return d;
}

async function loadExpensesWithParticipants(teamId) {
  const { data: expenses, error } = await supabaseAdmin
    .from('expenses')
    .select('id, team_id, title, description, amount, paid_by, split_type, expense_date, created_by, created_at')
    .eq('team_id', teamId)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!expenses?.length) return [];

  const expenseIds = expenses.map((e) => e.id);
  const { data: participants, error: partErr } = await supabaseAdmin
    .from('expense_participants')
    .select('expense_id, user_id, share_amount')
    .in('expense_id', expenseIds);

  if (partErr) throw partErr;

  const partsByExpense = new Map();
  for (const p of participants || []) {
    if (!partsByExpense.has(p.expense_id)) partsByExpense.set(p.expense_id, []);
    partsByExpense.get(p.expense_id).push({
      user_id: p.user_id,
      share_amount: Number(p.share_amount),
    });
  }

  return expenses.map((e) => ({
    ...e,
    amount: Number(e.amount),
    participants: partsByExpense.get(e.id) || [],
  }));
}

async function loadSettlements(teamId) {
  const { data, error } = await supabaseAdmin
    .from('expense_settlements')
    .select('id, team_id, from_user, to_user, amount, note, created_by, paid_at')
    .eq('team_id', teamId)
    .order('paid_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((s) => ({ ...s, amount: Number(s.amount) }));
}

function attachUsers(records, members) {
  const byId = new Map(members.map((m) => [m.id, m]));
  return records.map((r) => ({
    ...r,
    paid_by_user: byId.get(r.paid_by) || null,
    created_by_user: byId.get(r.created_by) || null,
    participants: (r.participants || []).map((p) => ({
      ...p,
      user: byId.get(p.user_id) || null,
    })),
  }));
}

function formatMoney(amount) {
  return `$${Number(amount).toFixed(2)}`;
}

// GET /api/teams/:id/tasksplit — workspace summary
router.get('/api/teams/:id/tasksplit', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;

  try {
    const loaded = await loadExpenseTeam(id, userId);
    if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });

    const members = await loadTeamMembers(id);
    const expenses = await loadExpensesWithParticipants(id);
    const settlements = await loadSettlements(id);
    const memberIds = members.map((m) => m.id);

    const debts = buildPairwiseDebts(expenses, settlements);
    const netBalances = computeNetBalances(expenses, settlements, memberIds);
    const center = balanceCenterForUser(debts, userId, memberIds);

    const totalSpent = roundMoney(expenses.reduce((sum, e) => sum + Number(e.amount), 0));

    const { data: ownerUser } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('id', loaded.team.created_by)
      .single();
    const ownerIsGuest = isGuestUser(ownerUser);

    res.json({
      team: loaded.team,
      role: loaded.role,
      owner_is_guest: ownerIsGuest,
      members,
      expense_count: expenses.length,
      total_spent: totalSpent,
      balances: {
        you_owe: center.you_owe.map((row) => ({
          ...row,
          user: members.find((m) => m.id === row.user_id) || null,
        })),
        you_are_owed: center.you_are_owed.map((row) => ({
          ...row,
          user: members.find((m) => m.id === row.user_id) || null,
        })),
        net_balances: memberIds.map((mid) => ({
          user_id: mid,
          balance: netBalances.get(mid) || 0,
          user: members.find((m) => m.id === mid) || null,
        })),
      },
    });
  } catch (err) {
    return sendError(res, 500, err, 'load');
  }
});

// GET /api/teams/:id/tasksplit/expenses
router.get('/api/teams/:id/tasksplit/expenses', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;

  try {
    const loaded = await loadExpenseTeam(id, userId);
    if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });

    const members = await loadTeamMembers(id);
    const expenses = await loadExpensesWithParticipants(id);
    res.json(attachUsers(expenses, members));
  } catch (err) {
    return sendError(res, 500, err, 'load');
  }
});

// POST /api/teams/:id/tasksplit/expenses
router.post('/api/teams/:id/tasksplit/expenses', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;
  const { title, description, amount, paid_by, participant_ids, expense_date } = req.body || {};

  const trimmedTitle = String(title || '').trim();
  if (!trimmedTitle) return res.status(400).json({ error: 'Expense title is required' });

  const parsedAmount = parseAmount(amount);
  if (!parsedAmount) return res.status(400).json({ error: 'Amount must be a positive number' });

  const expenseDate = parseDate(expense_date);
  if (!expenseDate) return res.status(400).json({ error: 'Invalid date (use YYYY-MM-DD)' });

  try {
    const loaded = await loadExpenseTeam(id, userId);
    if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });

    const members = await loadTeamMembers(id);
    const memberIds = new Set(members.map((m) => m.id));

    const payerId = paid_by || userId;
    if (!memberIds.has(payerId)) {
      return res.status(400).json({ error: 'Payer must be a workspace member' });
    }

    let participantIds = Array.isArray(participant_ids) ? participant_ids : memberIds;
    participantIds = [...new Set(participantIds.map(String))].filter((pid) => memberIds.has(pid));

    if (!participantIds.length) {
      return res.status(400).json({ error: 'At least one participant is required' });
    }

    if (loaded.team.expense_mode === 'solo' && participantIds.length > 1) {
      participantIds = [payerId];
    }

    const shares = equalShares(parsedAmount, participantIds.length);
    const participantRows = participantIds.map((pid, i) => ({
      user_id: pid,
      share_amount: shares[i],
    }));

    const { data: expense, error } = await supabaseAdmin
      .from('expenses')
      .insert({
        team_id: id,
        title: trimmedTitle,
        description: description?.trim() || null,
        amount: parsedAmount,
        paid_by: payerId,
        split_type: 'equal',
        expense_date: expenseDate,
        created_by: userId,
      })
      .select()
      .single();

    if (error) return sendError(res, 400, error, 'save');

    const partRows = participantRows.map((p) => ({
      expense_id: expense.id,
      user_id: p.user_id,
      share_amount: p.share_amount,
    }));

    const { error: partErr } = await supabaseAdmin.from('expense_participants').insert(partRows);
    if (partErr) {
      await supabaseAdmin.from('expenses').delete().eq('id', expense.id);
      return sendError(res, 400, partErr, 'save');
    }

    const payer = members.find((m) => m.id === payerId);
    const payerName = payer?.username || 'Someone';
    await logTaskSplitActivity(
      id,
      userId,
      'expense_added',
      `Added ${trimmedTitle} (${formatMoney(parsedAmount)}) — paid by ${payerName}`,
    );

    const full = {
      ...expense,
      amount: Number(expense.amount),
      participants: participantRows,
    };

    res.json(attachUsers([full], members)[0]);
  } catch (err) {
    return sendError(res, 500, err, 'save');
  }
});

// DELETE /api/teams/:id/tasksplit/expenses/:expenseId
router.delete('/api/teams/:id/tasksplit/expenses/:expenseId', requireAuth, async (req, res) => {
  const { id, expenseId } = req.params;
  const userId = req.session.user.id;

  try {
    const loaded = await loadExpenseTeam(id, userId);
    if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });

    const { data: expense } = await supabaseAdmin
      .from('expenses')
      .select('id, title, team_id, created_by')
      .eq('id', expenseId)
      .eq('team_id', id)
      .single();

    if (!expense) return res.status(404).json({ error: 'Expense not found' });

    const { error } = await supabaseAdmin.from('expenses').delete().eq('id', expenseId);
    if (error) return sendError(res, 400, error, 'save');

    await logTaskSplitActivity(id, userId, 'expense_deleted', `Deleted expense "${expense.title}"`);
    res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, err, 'save');
  }
});

// GET /api/teams/:id/tasksplit/balances
router.get('/api/teams/:id/tasksplit/balances', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;

  try {
    const loaded = await loadExpenseTeam(id, userId);
    if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });

    const members = await loadTeamMembers(id);
    const memberIds = members.map((m) => m.id);
    const expenses = await loadExpensesWithParticipants(id);
    const settlements = await loadSettlements(id);

    const debts = buildPairwiseDebts(expenses, settlements);
    const netBalances = computeNetBalances(expenses, settlements, memberIds);
    const center = balanceCenterForUser(debts, userId, memberIds);

    res.json({
      you_owe: center.you_owe.map((row) => ({
        ...row,
        user: members.find((m) => m.id === row.user_id) || null,
      })),
      you_are_owed: center.you_are_owed.map((row) => ({
        ...row,
        user: members.find((m) => m.id === row.user_id) || null,
      })),
      net_balances: memberIds.map((mid) => ({
        user_id: mid,
        balance: netBalances.get(mid) || 0,
        user: members.find((m) => m.id === mid) || null,
      })),
    });
  } catch (err) {
    return sendError(res, 500, err, 'load');
  }
});

// GET /api/teams/:id/tasksplit/settlements
router.get('/api/teams/:id/tasksplit/settlements', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;

  try {
    const loaded = await loadExpenseTeam(id, userId);
    if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });

    const members = await loadTeamMembers(id);
    const settlements = await loadSettlements(id);
    const byId = new Map(members.map((m) => [m.id, m]));

    res.json(
      settlements.map((s) => ({
        ...s,
        from_user_profile: byId.get(s.from_user) || null,
        to_user_profile: byId.get(s.to_user) || null,
        created_by_user: byId.get(s.created_by) || null,
      })),
    );
  } catch (err) {
    return sendError(res, 500, err, 'load');
  }
});

// POST /api/teams/:id/tasksplit/settle — settle up with another member
router.post('/api/teams/:id/tasksplit/settle', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;
  const { to_user, amount, note } = req.body || {};

  if (!to_user) return res.status(400).json({ error: 'to_user is required' });
  if (to_user === userId) return res.status(400).json({ error: 'Cannot settle with yourself' });

  try {
    const loaded = await loadExpenseTeam(id, userId);
    if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });

    if (loaded.team.expense_mode === 'solo') {
      return res.status(400).json({ error: 'Settle up is not available in solo mode' });
    }

    const members = await loadTeamMembers(id);
    const memberIds = new Set(members.map((m) => m.id));
    if (!memberIds.has(to_user)) {
      return res.status(400).json({ error: 'That user is not a workspace member' });
    }

    const expenses = await loadExpensesWithParticipants(id);
    const settlements = await loadSettlements(id);
    const debts = buildPairwiseDebts(expenses, settlements);

    const owedAmount = pairwiseOwed(debts, userId, to_user);
    if (owedAmount <= 0) {
      return res.status(400).json({ error: 'You do not owe this member anything' });
    }

    let settleAmount = amount != null ? parseAmount(amount) : owedAmount;
    if (!settleAmount) return res.status(400).json({ error: 'Invalid settlement amount' });
    if (settleAmount > owedAmount) {
      return res.status(400).json({ error: `You only owe ${formatMoney(owedAmount)}` });
    }

    const { data: settlement, error } = await supabaseAdmin
      .from('expense_settlements')
      .insert({
        team_id: id,
        from_user: userId,
        to_user,
        amount: settleAmount,
        note: note?.trim() || null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) return sendError(res, 400, error, 'save');

    const toUser = members.find((m) => m.id === to_user);
    const toName = toUser?.username || 'member';
    await logTaskSplitActivity(
      id,
      userId,
      'settlement',
      `Paid ${toName} ${formatMoney(settleAmount)}`,
    );

    res.json({
      ...settlement,
      amount: Number(settlement.amount),
      from_user_profile: members.find((m) => m.id === userId) || null,
      to_user_profile: toUser || null,
    });
  } catch (err) {
    return sendError(res, 500, err, 'save');
  }
});

module.exports = router;
