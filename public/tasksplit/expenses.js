/**
 * TaskSplit expenses — list, add, delete.
 */

function renderExpenseSplits(expense) {
  const payer = expense.paid_by_user?.username || 'Someone';
  const parts = expense.participants || [];
  const isSolo = workspaceData?.team?.expense_mode === 'solo';

  if (isSolo) {
    return `<span class="text-gray-500 text-xs">Paid by ${escHtml(payer)}</span>`;
  }

  const owedLines = parts
    .filter((p) => p.user_id !== expense.paid_by)
    .map((p) => {
      const name = p.user?.username || 'Member';
      return `${escHtml(name)} owes ${formatMoney(p.share_amount)}`;
    });

  return `
    <div class="text-xs text-gray-500 space-y-0.5">
      <div>Paid by <span class="text-gray-400">${escHtml(payer)}</span> · Split equally</div>
      ${owedLines.length ? `<div class="text-gray-600">${owedLines.join(' · ')}</div>` : ''}
    </div>`;
}

function renderExpensesList() {
  const list = document.getElementById('expensesList');
  const empty = document.getElementById('expensesEmpty');

  if (!expenses.length) {
    list.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }

  empty?.classList.add('hidden');
  list.innerHTML = expenses
    .map(
      (e) => `
    <div class="expense-card bg-ink-800 border border-white/10 rounded-xl p-4 cursor-pointer" onclick="openExpenseDetail('${e.id}')">
      <div class="flex items-start justify-between gap-3 mb-2">
        <div class="min-w-0">
          <h3 class="text-white font-medium text-sm truncate">${escHtml(e.title)}</h3>
          <p class="text-emerald-400 font-mono text-lg font-bold mt-0.5">${formatMoney(e.amount)}</p>
        </div>
        <span class="text-gray-600 text-xs shrink-0">${formatDate(e.expense_date)}</span>
      </div>
      ${renderExpenseSplits(e)}
    </div>`,
    )
    .join('');
}

function updateSummaryBar() {
  const total = workspaceData?.total_spent ?? expenses.reduce((s, e) => s + Number(e.amount), 0);
  document.getElementById('totalSpent').textContent = formatMoney(total);
  document.getElementById('expenseCount').textContent = `${expenses.length} expense${expenses.length === 1 ? '' : 's'}`;
}

function openAddExpenseModal() {
  document.getElementById('addExpenseError').classList.add('hidden');
  document.getElementById('expenseTitle').value = '';
  document.getElementById('expenseAmount').value = '';
  document.getElementById('expenseDescription').value = '';
  document.getElementById('expenseDate').value = new Date().toISOString().slice(0, 10);

  const members = workspaceData?.members || [];
  const isSolo = workspaceData?.team?.expense_mode === 'solo';

  const paidBySel = document.getElementById('expensePaidBy');
  paidBySel.innerHTML = members
    .map(
      (m) =>
        `<option value="${m.id}" ${m.id === currentUser?.id ? 'selected' : ''}>${escHtml(m.username)}</option>`,
    )
    .join('');

  const partWrap = document.getElementById('expenseParticipantsWrap');
  const partList = document.getElementById('expenseParticipantsList');
  if (isSolo) {
    partWrap.classList.add('hidden');
  } else {
    partWrap.classList.remove('hidden');
    partList.innerHTML = members
      .map(
        (m) => `
      <label class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
        <input type="checkbox" class="expense-participant-cb rounded border-white/20 bg-ink-700 text-brand-500" value="${m.id}" checked />
        ${userAvatarHtml(m, 'w-6 h-6')}
        <span>${escHtml(m.username)}</span>
      </label>`,
      )
      .join('');
  }

  document.getElementById('addExpenseModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('expenseTitle').focus(), 50);
}

function closeAddExpenseModal() {
  document.getElementById('addExpenseModal').classList.add('hidden');
}

async function submitExpense() {
  const btn = document.getElementById('addExpenseBtn');
  const title = document.getElementById('expenseTitle').value.trim();
  const amount = document.getElementById('expenseAmount').value.trim();
  const description = document.getElementById('expenseDescription').value.trim();
  const expenseDate = document.getElementById('expenseDate').value;
  const paidBy = document.getElementById('expensePaidBy').value;

  const errEl = document.getElementById('addExpenseError');
  if (!title) {
    errEl.textContent = 'Title is required';
    errEl.classList.remove('hidden');
    return;
  }
  if (!amount || Number(amount) <= 0) {
    errEl.textContent = 'Enter a valid amount';
    errEl.classList.remove('hidden');
    return;
  }

  const isSolo = workspaceData?.team?.expense_mode === 'solo';
  let participantIds = null;
  if (!isSolo) {
    participantIds = [...document.querySelectorAll('.expense-participant-cb:checked')].map((el) => el.value);
    if (!participantIds.length) {
      errEl.textContent = 'Select at least one participant';
      errEl.classList.remove('hidden');
      return;
    }
  }

  setButtonLoading(btn, true, 'Adding…');
  const r = await apiFetch(`/api/teams/${teamId}/tasksplit/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      amount: Number(amount),
      description,
      paid_by: paidBy,
      participant_ids: participantIds,
      expense_date: expenseDate,
    }),
  });
  const data = await parseJsonResponse(r);
  setButtonLoading(btn, false);

  if (!r.ok) {
    errEl.textContent = data.error || 'Failed to add expense';
    errEl.classList.remove('hidden');
    return;
  }

  closeAddExpenseModal();
  await refreshAll();
}

function openExpenseDetail(expenseId) {
  const expense = expenses.find((e) => e.id === expenseId);
  if (!expense) return;

  document.getElementById('expenseDetailTitle').textContent = expense.title;
  document.getElementById('expenseDetailAmount').textContent = formatMoney(expense.amount);
  document.getElementById('expenseDetailDate').textContent = formatDate(expense.expense_date);
  document.getElementById('expenseDetailPaidBy').textContent =
    expense.paid_by_user?.username || 'Unknown';
  document.getElementById('expenseDetailDescription').textContent =
    expense.description || 'No description';
  document.getElementById('expenseDetailDescription').classList.toggle('hidden', !expense.description);

  const splitsEl = document.getElementById('expenseDetailSplits');
  const isSolo = workspaceData?.team?.expense_mode === 'solo';
  if (isSolo) {
    splitsEl.classList.add('hidden');
  } else {
    splitsEl.classList.remove('hidden');
    splitsEl.innerHTML = (expense.participants || [])
      .map(
        (p) => `
      <div class="flex items-center justify-between text-sm py-1.5">
        <div class="flex items-center gap-2">
          ${userAvatarHtml(p.user || { username: '?' }, 'w-6 h-6')}
          <span class="text-gray-300">${escHtml(p.user?.username || 'Member')}</span>
        </div>
        <span class="text-gray-400 font-mono">${formatMoney(p.share_amount)}</span>
      </div>`,
      )
      .join('');
  }

  document.getElementById('expenseDetailDeleteBtn').onclick = () => {
    closeExpenseDetailModal();
    showConfirm({
      title: 'Delete expense?',
      message: `"${expense.title}" will be removed and balances will update.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => deleteExpense(expenseId),
    });
  };

  document.getElementById('expenseDetailModal').classList.remove('hidden');
}

function closeExpenseDetailModal() {
  document.getElementById('expenseDetailModal').classList.add('hidden');
}

async function deleteExpense(expenseId) {
  const r = await apiFetch(`/api/teams/${teamId}/tasksplit/expenses/${expenseId}`, {
    method: 'DELETE',
  });
  const data = await parseJsonResponse(r);
  if (!r.ok) {
    showAlert(data.error || 'Failed to delete expense');
    return;
  }
  await refreshAll();
}

async function loadExpenses() {
  const r = await apiFetch(`/api/teams/${teamId}/tasksplit/expenses`);
  const data = await parseJsonResponse(r);
  if (!r.ok || !Array.isArray(data)) return false;
  expenses = data;
  renderExpensesList();
  updateSummaryBar();
  return true;
}
