const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { sendError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const {
  roundMoney,
  computeParticipantShares,
  computeNetBalances,
  simplifyDebts,
  simplifiedDebtsToMap,
  balanceCenterForUser,
  pairwiseOwed,
  SPLIT_TYPES,
} = require('../lib/tasksplit-balances');
const {
  loadExpenseTeam,
  loadTeamMembers,
  loadTeamRoles,
  loadTeamPendingInvites,
  logTaskSplitActivity,
  canModifyExpense,
  ensurePayerInParticipants,
} = require('../lib/tasksplit-team');
const { formatCurrencyAmount } = require('../lib/currencies');
const { isGuestUser } = require('../lib/user');
const multer = require('multer');
const { fetchReactionsForMessages, attachReactionsToItems } = require('../lib/reactions');
const { assertCanSendUserMessage } = require('../lib/message-send-guard');
const { canBypassSpamGuard } = require('../lib/spam-guard-override');
const { assertCanUploadFile } = require('../lib/upload-guard');
const {
  MAX_ATTACHMENT_BYTES: MSG_ATTACHMENT_MAX,
  fetchAttachmentsForMessages,
  attachAttachmentsToItems,
  uploadMessageAttachment,
} = require('../lib/message-attachments');

const commentFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MSG_ATTACHMENT_MAX },
});

const expenseFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MSG_ATTACHMENT_MAX },
});

const EXPENSE_COMMENT_SELECT =
  'id, expense_id, user_id, content, content_before_edit, edited_at, deleted_at, created_at, user:user_id(id, username, avatar_color, avatar_url)';

function optionalExpenseCommentFileUpload(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  commentFileUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File must be 8 MB or smaller' });
      }
      return sendError(res, 400, err, 'save');
    }
    next();
  });
}

function optionalExpenseAttachmentUpload(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  expenseFileUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File must be 8 MB or smaller' });
      }
      return sendError(res, 400, err, 'save');
    }
    next();
  });
}

async function enrichExpenseComments(comments) {
  const list = comments || [];
  const reactionsMap = await fetchReactionsForMessages('expense_comment', list.map((c) => c.id));
  const attachmentsMap = await fetchAttachmentsForMessages('expense_comment', list.map((c) => c.id));
  return attachAttachmentsToItems(attachReactionsToItems(list, reactionsMap), attachmentsMap);
}

async function enrichSingleExpenseComment(data) {
  const [enriched] = await enrichExpenseComments([data]);
  return enriched;
}

const router = express.Router();

function rejectGuestFromTasksplit(req, res, next) {
  if (isGuestUser(req.session.user)) {
    return res.status(403).json({ error: 'TaskSplit is available for registered accounts only' });
  }
  next();
}

// Scope guest rejection to TaskSplit API routes only — an unscoped router.use()
// would block every later page route (e.g. /dashboard) for guest sessions.
router.use('/api/teams/:id/tasksplit', requireAuth, rejectGuestFromTasksplit);

function parseAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return roundMoney(n);
}

function localDateYmd(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDate(value) {
  if (!value) return localDateYmd();
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
    .select('expense_id, user_id, share_amount, split_value')
    .in('expense_id', expenseIds);

  if (partErr) throw partErr;

  const attachmentsMap = await fetchAttachmentsForMessages('expense', expenseIds);

  const partsByExpense = new Map();
  for (const p of participants || []) {
    if (!partsByExpense.has(p.expense_id)) partsByExpense.set(p.expense_id, []);
    partsByExpense.get(p.expense_id).push({
      user_id: p.user_id,
      share_amount: Number(p.share_amount),
      split_value: p.split_value != null ? Number(p.split_value) : null,
    });
  }

  return expenses.map((e) => ({
    ...e,
    amount: Number(e.amount),
    participants: partsByExpense.get(e.id) || [],
    attachments: attachmentsMap.get(e.id) || [],
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

function formatMoney(amount, currencyCode) {
  return formatCurrencyAmount(amount, currencyCode || 'PHP');
}

function buildBalancePayload(expenses, settlements, memberIds, currentUserId) {
  const netBalances = computeNetBalances(expenses, settlements, memberIds);
  const simplified = simplifyDebts(netBalances, memberIds);
  const debts = simplifiedDebtsToMap(simplified);
  const center = balanceCenterForUser(debts, currentUserId, memberIds);

  return {
    simplified_debts: simplified,
    you_owe: center.you_owe,
    you_are_owed: center.you_are_owed,
    net_balances: memberIds.map((mid) => ({
      user_id: mid,
      balance: netBalances.get(mid) || 0,
    })),
    debt_map: debts,
  };
}

function parseSplitType(value) {
  const type = String(value || 'equal').trim().toLowerCase();
  return SPLIT_TYPES.has(type) ? type : 'equal';
}

function parseParticipantSplits(body, memberIdSet, defaultMemberIds) {
  const { participant_ids, participant_splits } = body || {};

  if (Array.isArray(participant_splits) && participant_splits.length) {
    const rows = participant_splits
      .map((row) => ({
        user_id: String(row.user_id || ''),
        split_value: row.split_value != null ? Number(row.split_value) : null,
      }))
      .filter((row) => memberIdSet.has(row.user_id));
    return [...new Map(rows.map((r) => [r.user_id, r])).values()];
  }

  const ids = Array.isArray(participant_ids) ? participant_ids : defaultMemberIds;
  return [...new Set(ids.map(String))].filter((pid) => memberIdSet.has(pid)).map((user_id) => ({
    user_id,
    split_value: null,
  }));
}

// GET /api/teams/:id/tasksplit — workspace summary
router.get('/api/teams/:id/tasksplit', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;

  try {
    const loaded = await loadExpenseTeam(id, userId);
    if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });

    const members = await loadTeamMembers(id);
    const roles = await loadTeamRoles(id);
    let pending_invites = [];
    try {
      pending_invites = await loadTeamPendingInvites(id);
    } catch (invErr) {
      return sendError(res, 500, invErr, 'load');
    }
    const expenses = await loadExpensesWithParticipants(id);
    const settlements = await loadSettlements(id);
    const memberIds = members.map((m) => m.id);

    const balancePayload = buildBalancePayload(expenses, settlements, memberIds, userId);
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
      roles,
      pending_invites,
      separate_role_members: !!loaded.team.separate_role_members,
      expense_count: expenses.length,
      total_spent: totalSpent,
      balances: {
        simplified_debts: balancePayload.simplified_debts.map((row) => ({
          ...row,
          from_user_profile: members.find((m) => m.id === row.from_user) || null,
          to_user_profile: members.find((m) => m.id === row.to_user) || null,
        })),
        you_owe: balancePayload.you_owe.map((row) => ({
          ...row,
          user: members.find((m) => m.id === row.user_id) || null,
        })),
        you_are_owed: balancePayload.you_are_owed.map((row) => ({
          ...row,
          user: members.find((m) => m.id === row.user_id) || null,
        })),
        net_balances: balancePayload.net_balances.map((row) => ({
          ...row,
          user: members.find((m) => m.id === row.user_id) || null,
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
  const { title, description, amount, paid_by, participant_ids, participant_splits, split_type, expense_date } =
    req.body || {};

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
    const memberIdSet = new Set(members.map((m) => m.id));

    const payerId = paid_by || userId;
    if (!memberIdSet.has(payerId)) {
      return res.status(400).json({ error: 'Payer must be a workspace member' });
    }

    const defaultParticipantIds = members.map((m) => m.id);
    let splitEntries = parseParticipantSplits(req.body, memberIdSet, defaultParticipantIds);

    if (!splitEntries.length) {
      return res.status(400).json({ error: 'At least one participant is required' });
    }

    const expenseSplitType = loaded.team.expense_mode === 'solo' ? 'equal' : parseSplitType(split_type);

    if (loaded.team.expense_mode === 'solo') {
      splitEntries = [{ user_id: payerId, split_value: null }];
    } else {
      const participantIds = ensurePayerInParticipants(
        payerId,
        splitEntries.map((e) => e.user_id),
      );
      const entryById = new Map(splitEntries.map((e) => [e.user_id, e]));
      splitEntries = participantIds.map((pid) => entryById.get(pid) || { user_id: pid, split_value: null });
    }

    const shareResult = computeParticipantShares(expenseSplitType, parsedAmount, splitEntries);
    if (!shareResult.ok) return res.status(400).json({ error: shareResult.error });
    const participantRows = shareResult.rows;

    const { data: expense, error } = await supabaseAdmin
      .from('expenses')
      .insert({
        team_id: id,
        title: trimmedTitle,
        description: description?.trim() || null,
        amount: parsedAmount,
        paid_by: payerId,
        split_type: expenseSplitType,
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
      split_value: p.split_value,
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
      `Added ${trimmedTitle} (${formatMoney(parsedAmount, loaded.team.currency_code)}) — paid by ${payerName}`,
    );

    const full = {
      ...expense,
      amount: Number(expense.amount),
      participants: participantRows,
      attachments: [],
    };

    res.json(attachUsers([full], members)[0]);
  } catch (err) {
    return sendError(res, 500, err, 'save');
  }
});

async function replaceExpenseParticipants(expenseId, participantRows) {
  const { error: delErr } = await supabaseAdmin
    .from('expense_participants')
    .delete()
    .eq('expense_id', expenseId);
  if (delErr) throw delErr;

  if (!participantRows.length) return;

  const { error: insErr } = await supabaseAdmin.from('expense_participants').insert(
    participantRows.map((p) => ({
      expense_id: expenseId,
      user_id: p.user_id,
      share_amount: p.share_amount,
      split_value: p.split_value ?? null,
    })),
  );
  if (insErr) throw insErr;
}

// PATCH /api/teams/:id/tasksplit/expenses/:expenseId
router.patch('/api/teams/:id/tasksplit/expenses/:expenseId', requireAuth, async (req, res) => {
  const { id, expenseId } = req.params;
  const userId = req.session.user.id;
  const { title, description, amount, paid_by, participant_ids, participant_splits, split_type, expense_date } =
    req.body || {};

  try {
    const loaded = await loadExpenseTeam(id, userId);
    if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });

    const { data: existing } = await supabaseAdmin
      .from('expenses')
      .select('id, title, description, team_id, amount, paid_by, split_type, expense_date, created_by')
      .eq('id', expenseId)
      .eq('team_id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Expense not found' });

    if (!canModifyExpense(existing, userId, loaded.role)) {
      return res.status(403).json({ error: 'Only the expense creator or workspace owner can edit this expense' });
    }

    const members = await loadTeamMembers(id);
    const memberIdSet = new Set(members.map((m) => m.id));

    const updates = {};
    if (title !== undefined) {
      const trimmedTitle = String(title || '').trim();
      if (!trimmedTitle) return res.status(400).json({ error: 'Expense title is required' });
      updates.title = trimmedTitle;
    }
    if (description !== undefined) {
      updates.description = description?.trim() || null;
    }

    let parsedAmount = null;
    if (amount !== undefined) {
      parsedAmount = parseAmount(amount);
      if (!parsedAmount) return res.status(400).json({ error: 'Amount must be a positive number' });
      updates.amount = parsedAmount;
    }

    let payerId = existing.paid_by;
    if (paid_by !== undefined) {
      payerId = paid_by;
      if (!memberIdSet.has(payerId)) {
        return res.status(400).json({ error: 'Payer must be a workspace member' });
      }
      updates.paid_by = payerId;
    }

    if (expense_date !== undefined) {
      const expenseDate = parseDate(expense_date);
      if (!expenseDate) return res.status(400).json({ error: 'Invalid date (use YYYY-MM-DD)' });
      updates.expense_date = expenseDate;
    }

    const financialFieldsTouched =
      amount !== undefined ||
      paid_by !== undefined ||
      participant_ids !== undefined ||
      participant_splits !== undefined ||
      split_type !== undefined;
    let participantRows = null;
    let effectiveSplitType = existing.split_type || 'equal';

    if (split_type !== undefined) {
      effectiveSplitType = loaded.team.expense_mode === 'solo' ? 'equal' : parseSplitType(split_type);
      updates.split_type = effectiveSplitType;
    }

    if (financialFieldsTouched || participant_ids !== undefined || participant_splits !== undefined) {
      const effectiveAmount = parsedAmount ?? Number(existing.amount);

      let splitEntries;
      if (participant_ids !== undefined || participant_splits !== undefined) {
        const { data: existingParts } = await supabaseAdmin
          .from('expense_participants')
          .select('user_id, split_value')
          .eq('expense_id', expenseId);
        const defaultIds = (existingParts || []).map((p) => ({
          user_id: p.user_id,
          split_value: p.split_value != null ? Number(p.split_value) : null,
        }));
        splitEntries = parseParticipantSplits(req.body, memberIdSet, defaultIds.map((p) => p.user_id));
        if (participant_splits === undefined && participant_ids !== undefined) {
          splitEntries = splitEntries.map((e) => ({ ...e, split_value: null }));
        }
      } else {
        const { data: currentParts } = await supabaseAdmin
          .from('expense_participants')
          .select('user_id, split_value')
          .eq('expense_id', expenseId);
        splitEntries = (currentParts || []).map((p) => ({
          user_id: p.user_id,
          split_value: p.split_value != null ? Number(p.split_value) : null,
        }));
      }

      if (!splitEntries.length) {
        return res.status(400).json({ error: 'At least one participant is required' });
      }

      if (loaded.team.expense_mode === 'solo') {
        splitEntries = [{ user_id: payerId, split_value: null }];
        effectiveSplitType = 'equal';
        updates.split_type = 'equal';
      } else {
        const participantIds = ensurePayerInParticipants(
          payerId,
          splitEntries.map((e) => e.user_id),
        );
        const entryById = new Map(splitEntries.map((e) => [e.user_id, e]));
        splitEntries = participantIds.map((pid) => entryById.get(pid) || { user_id: pid, split_value: null });
      }

      const shareResult = computeParticipantShares(effectiveSplitType, effectiveAmount, splitEntries);
      if (!shareResult.ok) return res.status(400).json({ error: shareResult.error });
      participantRows = shareResult.rows;
    }

    if (!Object.keys(updates).length && !participantRows) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    if (Object.keys(updates).length) {
      const { error } = await supabaseAdmin.from('expenses').update(updates).eq('id', expenseId);
      if (error) return sendError(res, 400, error, 'save');
    }

    if (participantRows) {
      await replaceExpenseParticipants(expenseId, participantRows);
    }

    const full = await loadExpensesWithParticipants(id);
    const enriched = full.find((e) => e.id === expenseId);
    if (!enriched) return res.status(404).json({ error: 'Expense not found' });

    const expenseLabel = updates.title || existing.title;
    if (financialFieldsTouched) {
      const amt = parsedAmount ?? Number(existing.amount);
      await logTaskSplitActivity(
        id,
        userId,
        'expense_updated',
        `Updated expense "${expenseLabel}" (${formatMoney(amt, loaded.team.currency_code)})`,
      );
    } else if (updates.title && updates.title !== existing.title) {
      await logTaskSplitActivity(id, userId, 'expense_updated', `Renamed expense to "${updates.title}"`);
    } else if (description !== undefined) {
      await logTaskSplitActivity(id, userId, 'expense_updated', `Updated description for "${expenseLabel}"`);
    }

    res.json(attachUsers([enriched], members)[0]);
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

    if (!canModifyExpense(expense, userId, loaded.role)) {
      return res.status(403).json({ error: 'Only the expense creator or workspace owner can delete this expense' });
    }

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

    const balancePayload = buildBalancePayload(expenses, settlements, memberIds, userId);

    res.json({
      simplified_debts: balancePayload.simplified_debts.map((row) => ({
        ...row,
        from_user_profile: members.find((m) => m.id === row.from_user) || null,
        to_user_profile: members.find((m) => m.id === row.to_user) || null,
      })),
      you_owe: balancePayload.you_owe.map((row) => ({
        ...row,
        user: members.find((m) => m.id === row.user_id) || null,
      })),
      you_are_owed: balancePayload.you_are_owed.map((row) => ({
        ...row,
        user: members.find((m) => m.id === row.user_id) || null,
      })),
      net_balances: balancePayload.net_balances.map((row) => ({
        ...row,
        user: members.find((m) => m.id === row.user_id) || null,
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

// POST /api/teams/:id/tasksplit/settle — record a payment between members
router.post('/api/teams/:id/tasksplit/settle', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;
  const { to_user, from_user, amount, note } = req.body || {};

  if (!to_user) return res.status(400).json({ error: 'to_user is required' });

  try {
    const loaded = await loadExpenseTeam(id, userId);
    if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });

    if (loaded.team.expense_mode === 'solo') {
      return res.status(400).json({ error: 'Settle up is not available in solo mode' });
    }

    const members = await loadTeamMembers(id);
    const memberIds = members.map((m) => m.id);
    const memberIdSet = new Set(memberIds);

    const payerId = from_user || userId;
    const payeeId = to_user;

    if (!memberIdSet.has(payerId) || !memberIdSet.has(payeeId)) {
      return res.status(400).json({ error: 'Both users must be workspace members' });
    }
    if (payerId === payeeId) {
      return res.status(400).json({ error: 'Payer and payee must be different people' });
    }
    if (payerId !== userId && payeeId !== userId) {
      return res.status(403).json({ error: 'You must be the payer or payee in this settlement' });
    }

    const expenses = await loadExpensesWithParticipants(id);
    const settlements = await loadSettlements(id);
    const balancePayload = buildBalancePayload(expenses, settlements, memberIds, userId);
    const owedAmount = pairwiseOwed(balancePayload.debt_map, payerId, payeeId);

    if (owedAmount <= 0) {
      return res.status(400).json({ error: 'There is no outstanding debt for this settlement' });
    }

    let settleAmount = amount != null ? parseAmount(amount) : owedAmount;
    if (!settleAmount) return res.status(400).json({ error: 'Invalid settlement amount' });
    if (settleAmount > owedAmount) {
      return res.status(400).json({ error: `Outstanding debt is only ${formatMoney(owedAmount, loaded.team.currency_code)}` });
    }

    const { data: settlement, error } = await supabaseAdmin
      .from('expense_settlements')
      .insert({
        team_id: id,
        from_user: payerId,
        to_user: payeeId,
        amount: settleAmount,
        note: note?.trim() || null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) return sendError(res, 400, error, 'save');

    const payer = members.find((m) => m.id === payerId);
    const payee = members.find((m) => m.id === payeeId);
    const payerName = payer?.username || 'Someone';
    const payeeName = payee?.username || 'Someone';
    await logTaskSplitActivity(
      id,
      userId,
      'settlement',
      `${payerName} paid ${payeeName} ${formatMoney(settleAmount, loaded.team.currency_code)}`,
    );

    res.json({
      ...settlement,
      amount: Number(settlement.amount),
      from_user_profile: payer || null,
      to_user_profile: payee || null,
    });
  } catch (err) {
    return sendError(res, 500, err, 'save');
  }
});

// PATCH /api/teams/:id/tasksplit/mode — upgrade solo workspace to duo (owner only)
router.patch('/api/teams/:id/tasksplit/mode', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;
  const { expense_mode } = req.body || {};

  try {
    const loaded = await loadExpenseTeam(id, userId);
    if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });
    if (loaded.role !== 'owner') {
      return res.status(403).json({ error: 'Only the workspace owner can change the expense mode' });
    }

    const nextMode = String(expense_mode || '').trim().toLowerCase();
    const currentMode = loaded.team.expense_mode;

    if (currentMode === 'solo' && nextMode === 'duo') {
      const { data: updated, error } = await supabaseAdmin
        .from('teams')
        .update({ expense_mode: 'duo' })
        .eq('id', id)
        .select()
        .single();

      if (error) return sendError(res, 400, error, 'save');

      await logTaskSplitActivity(
        id,
        userId,
        'workspace_mode_changed',
        'Upgraded workspace from Solo to Duo — invite a partner to start splitting expenses',
      );

      return res.json({ team: updated });
    }

    return res.status(400).json({
      error: 'Only upgrading from Solo to Duo is supported after creation',
    });
  } catch (err) {
    return sendError(res, 500, err, 'save');
  }
});

// POST /api/teams/:id/tasksplit/expenses/:expenseId/attachments
router.post(
  '/api/teams/:id/tasksplit/expenses/:expenseId/attachments',
  requireAuth,
  optionalExpenseAttachmentUpload,
  async (req, res) => {
    const { id, expenseId } = req.params;
    const userId = req.session.user.id;

    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    try {
      const loaded = await loadExpenseTeam(id, userId);
      if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });

      const { data: expense } = await supabaseAdmin
        .from('expenses')
        .select('id, title, created_by')
        .eq('id', expenseId)
        .eq('team_id', id)
        .single();

      if (!expense) return res.status(404).json({ error: 'Expense not found' });
      if (!canModifyExpense(expense, userId, loaded.role)) {
        return res.status(403).json({ error: 'Only the expense creator or workspace owner can add attachments' });
      }

      const uploadGuard = await assertCanUploadFile(supabaseAdmin, userId);
      if (!uploadGuard.ok) {
        return res.status(uploadGuard.status).json({
          error: uploadGuard.error,
          retry_after_ms: uploadGuard.retry_after_ms,
        });
      }

      const uploaded = await uploadMessageAttachment({
        messageType: 'expense',
        messageId: expenseId,
        file: req.file,
        userId,
      });
      if (!uploaded.ok) {
        return res.status(uploaded.status).json({ error: uploaded.error });
      }

      await logTaskSplitActivity(id, userId, 'expense_attachment', `Added a receipt to "${expense.title}"`);
      res.json(uploaded.attachment);
    } catch (err) {
      return sendError(res, 500, err, 'save');
    }
  },
);

// DELETE /api/teams/:id/tasksplit/expenses/:expenseId/attachments/:attachmentId
router.delete(
  '/api/teams/:id/tasksplit/expenses/:expenseId/attachments/:attachmentId',
  requireAuth,
  async (req, res) => {
    const { id, expenseId, attachmentId } = req.params;
    const userId = req.session.user.id;

    try {
      const loaded = await loadExpenseTeam(id, userId);
      if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });

      const { data: expense } = await supabaseAdmin
        .from('expenses')
        .select('id, title, created_by')
        .eq('id', expenseId)
        .eq('team_id', id)
        .single();

      if (!expense) return res.status(404).json({ error: 'Expense not found' });
      if (!canModifyExpense(expense, userId, loaded.role)) {
        return res.status(403).json({ error: 'Only the expense creator or workspace owner can remove attachments' });
      }

      const { data: att } = await supabaseAdmin
        .from('message_attachments')
        .select('id, message_type, message_id')
        .eq('id', attachmentId)
        .single();

      if (!att || att.message_type !== 'expense' || att.message_id !== expenseId) {
        return res.status(404).json({ error: 'Attachment not found' });
      }

      const { error } = await supabaseAdmin.from('message_attachments').delete().eq('id', attachmentId);
      if (error) return sendError(res, 400, error, 'save');

      res.json({ success: true });
    } catch (err) {
      return sendError(res, 500, err, 'save');
    }
  },
);

// GET /api/teams/:id/tasksplit/expenses/:expenseId/comments
router.get('/api/teams/:id/tasksplit/expenses/:expenseId/comments', requireAuth, async (req, res) => {
  const { id, expenseId } = req.params;
  const userId = req.session.user.id;

  try {
    const loaded = await loadExpenseTeam(id, userId);
    if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });

    const { data: expense } = await supabaseAdmin
      .from('expenses')
      .select('id')
      .eq('id', expenseId)
      .eq('team_id', id)
      .single();
    if (!expense) return res.status(404).json({ error: 'Expense not found' });

    const { data, error } = await supabaseAdmin
      .from('expense_comments')
      .select(EXPENSE_COMMENT_SELECT)
      .eq('expense_id', expenseId)
      .order('created_at', { ascending: true });

    if (error) return sendError(res, 500, error, 'load');
    res.json(await enrichExpenseComments(data || []));
  } catch (err) {
    return sendError(res, 500, err, 'load');
  }
});

// POST /api/teams/:id/tasksplit/expenses/:expenseId/comments
router.post(
  '/api/teams/:id/tasksplit/expenses/:expenseId/comments',
  requireAuth,
  optionalExpenseCommentFileUpload,
  async (req, res) => {
    const { id, expenseId } = req.params;
    const userId = req.session.user.id;
    const raw = (req.body?.content || '').trim();
    const hasFile = !!req.file;
    if (!raw && !hasFile) return res.status(400).json({ error: 'Comment cannot be empty' });
    if (raw.length > 4000) return res.status(400).json({ error: 'Comment is too long' });

    try {
      const loaded = await loadExpenseTeam(id, userId);
      if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });

      const { data: expense } = await supabaseAdmin
        .from('expenses')
        .select('id, title')
        .eq('id', expenseId)
        .eq('team_id', id)
        .single();
      if (!expense) return res.status(404).json({ error: 'Expense not found' });

      if (hasFile) {
        const uploadGuard = await assertCanUploadFile(supabaseAdmin, userId);
        if (!uploadGuard.ok) {
          return res.status(uploadGuard.status).json({
            error: uploadGuard.error,
            retry_after_ms: uploadGuard.retry_after_ms,
          });
        }
      }

      let content = raw;
      if (raw) {
        const guard = await assertCanSendUserMessage(supabaseAdmin, {
          table: 'expense_comments',
          scopeColumn: 'expense_id',
          scopeId: expenseId,
          userId,
          content: raw,
          skipSpamGuard: canBypassSpamGuard(req.session.user),
        });
        if (!guard.ok) {
          return res.status(guard.status).json({
            error: guard.error,
            retry_after_ms: guard.retry_after_ms,
          });
        }
        content = guard.content;
      } else {
        content = '';
      }

      const { data: comment, error } = await supabaseAdmin
        .from('expense_comments')
        .insert({ expense_id: expenseId, user_id: userId, content })
        .select(EXPENSE_COMMENT_SELECT)
        .single();

      if (error) return sendError(res, 400, error, 'save');

      if (hasFile) {
        const uploaded = await uploadMessageAttachment({
          messageType: 'expense_comment',
          messageId: comment.id,
          file: req.file,
          userId,
        });
        if (!uploaded.ok) {
          await supabaseAdmin.from('expense_comments').delete().eq('id', comment.id);
          return res.status(uploaded.status).json({ error: uploaded.error });
        }
      }

      await logTaskSplitActivity(id, userId, 'expense_comment', `Commented on expense "${expense.title}"`);
      res.json(await enrichSingleExpenseComment(comment));
    } catch (err) {
      return sendError(res, 500, err, 'save');
    }
  },
);

// PATCH /api/teams/:id/tasksplit/expenses/:expenseId/comments/:commentId
router.patch('/api/teams/:id/tasksplit/expenses/:expenseId/comments/:commentId', requireAuth, async (req, res) => {
  const { id, expenseId, commentId } = req.params;
  const userId = req.session.user.id;
  const raw = (req.body?.content || '').trim();
  if (!raw) return res.status(400).json({ error: 'Comment cannot be empty' });
  if (raw.length > 4000) return res.status(400).json({ error: 'Comment is too long' });

  try {
    const loaded = await loadExpenseTeam(id, userId);
    if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('expense_comments')
      .select('id, user_id, expense_id, deleted_at, content, content_before_edit, edited_at')
      .eq('id', commentId)
      .eq('expense_id', expenseId)
      .single();

    if (fetchErr || !existing) return res.status(404).json({ error: 'Comment not found' });
    if (existing.deleted_at) return res.status(400).json({ error: 'Cannot edit a deleted comment' });
    if (String(existing.user_id) !== String(userId)) {
      return res.status(403).json({ error: 'You can only edit your own comments' });
    }

    const guard = await assertCanSendUserMessage(supabaseAdmin, {
      table: 'expense_comments',
      scopeColumn: 'expense_id',
      scopeId: expenseId,
      userId,
      content: raw,
      skipSpamGuard: canBypassSpamGuard(req.session.user),
    });
    if (!guard.ok) {
      return res.status(guard.status).json({
        error: guard.error,
        retry_after_ms: guard.retry_after_ms,
      });
    }

    const patch = {
      content: guard.content,
      edited_at: new Date().toISOString(),
    };
    if (!existing.edited_at) patch.content_before_edit = existing.content;

    const { data: updated, error } = await supabaseAdmin
      .from('expense_comments')
      .update(patch)
      .eq('id', commentId)
      .select(EXPENSE_COMMENT_SELECT)
      .single();

    if (error) return sendError(res, 400, error, 'save');
    res.json(await enrichSingleExpenseComment(updated));
  } catch (err) {
    return sendError(res, 500, err, 'save');
  }
});

// DELETE /api/teams/:id/tasksplit/expenses/:expenseId/comments/:commentId
router.delete('/api/teams/:id/tasksplit/expenses/:expenseId/comments/:commentId', requireAuth, async (req, res) => {
  const { id, expenseId, commentId } = req.params;
  const userId = req.session.user.id;

  try {
    const loaded = await loadExpenseTeam(id, userId);
    if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('expense_comments')
      .select('id, user_id, deleted_at')
      .eq('id', commentId)
      .eq('expense_id', expenseId)
      .single();

    if (fetchErr || !existing) return res.status(404).json({ error: 'Comment not found' });
    if (existing.deleted_at) return res.status(400).json({ error: 'Comment already deleted' });
    if (String(existing.user_id) !== String(userId)) {
      return res.status(403).json({ error: 'You can only delete your own comments' });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('expense_comments')
      .update({ deleted_at: new Date().toISOString(), content: '' })
      .eq('id', commentId)
      .select(EXPENSE_COMMENT_SELECT)
      .single();

    if (error) return sendError(res, 400, error, 'save');
    res.json(await enrichSingleExpenseComment(updated));
  } catch (err) {
    return sendError(res, 500, err, 'save');
  }
});

module.exports = router;
