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

  const zoomRoot = document.getElementById('expensesZoomRoot');
  if (!expenses.length) {
    list.innerHTML = '';
    empty?.classList.remove('hidden');
    zoomRoot?.classList.add('expenses-empty-state');
    return;
  }

  empty?.classList.add('hidden');
  zoomRoot?.classList.remove('expenses-empty-state');
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
  closeTaskflowOverlayBeforeOpen('addExpense');
  document.getElementById('addExpenseError').classList.add('hidden');
  document.getElementById('expenseTitle').value = '';
  document.getElementById('expenseAmount').value = '';
  document.getElementById('expenseDescription').value = '';
  document.getElementById('expenseDate').value = todayLocalDateString();

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
  pushTaskflowOverlay('addExpense');
  setTimeout(() => document.getElementById('expenseTitle').focus(), 50);
}

function closeAddExpenseModal() {
  document.getElementById('addExpenseModal').classList.add('hidden');
}

function closeAddExpensePanel() {
  requestCloseTaskflowOverlay();
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
  dismissTaskflowOverlayHistory('addExpense');
  await refreshAll();
}

function openExpenseDetail(expenseId) {
  const expense = expenses.find((e) => e.id === expenseId);
  if (!expense) return;

  closeTaskflowOverlayBeforeOpen('expenseDetail');
  resetExpenseDetailComments();
  activeExpenseId = expenseId;
  expenseDetailTab = 'details';
  editingExpenseField = null;
  expenseEditDraft = '';

  renderExpenseTitleArea(expense);
  document.getElementById('expenseDetailAmount').textContent = formatMoney(expense.amount);
  document.getElementById('expenseDetailDate').textContent = formatDate(expense.expense_date);
  document.getElementById('expenseDetailPaidBy').textContent =
    expense.paid_by_user?.username || 'Unknown';
  renderExpenseDescArea(expense);

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

  document.getElementById('expenseDetailModal').classList.remove('hidden');
  setExpenseDetailTab('details');
  pushTaskflowOverlay('expenseDetail');
}

function renderExpenseTitleArea(expense) {
  const area = document.getElementById('expenseDetailTitleArea');
  if (!area || !expense) return;
  if (editingExpenseField === 'title') {
    area.innerHTML = `<div class="space-y-2">
      <input id="expenseTitleEditInput" type="text" oninput="expenseEditDraft=this.value"
        class="w-full bg-ink-700 border border-white/10 rounded-lg px-3 py-2 text-white text-lg font-semibold focus:outline-none focus:border-brand-500 transition" />
      <div class="flex gap-2 justify-end">
        <button type="button" onclick="cancelEditExpense()" class="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 transition">Cancel</button>
        <button type="button" onclick="saveEditExpense('title')" class="text-xs bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg transition font-medium">Save</button>
      </div>
    </div>`;
    const input = document.getElementById('expenseTitleEditInput');
    input.value = expenseEditDraft || expense.title;
    input.focus();
    return;
  }
  area.innerHTML = `<h2 class="text-lg font-semibold text-white leading-snug truncate">${escHtml(expense.title)}</h2>`;
}

function renderExpenseDescArea(expense) {
  const area = document.getElementById('expenseDetailDescArea');
  if (!area || !expense) return;
  if (editingExpenseField === 'description') {
    area.innerHTML = `<div class="space-y-2 w-full">
      <textarea id="expenseDescEditInput" rows="3" oninput="expenseEditDraft=this.value"
        class="w-full bg-ink-700 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500 transition resize-none"></textarea>
      <div class="flex gap-2 justify-end">
        <button type="button" onclick="cancelEditExpense()" class="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 transition">Cancel</button>
        <button type="button" onclick="saveEditExpense('description')" class="text-xs bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg transition font-medium">Save</button>
      </div>
    </div>`;
    const ta = document.getElementById('expenseDescEditInput');
    ta.value = expenseEditDraft !== '' ? expenseEditDraft : (expense.description || '');
    ta.focus();
    return;
  }
  const desc = expense.description || '';
  area.innerHTML = desc
    ? `<p class="whitespace-pre-wrap break-words">${escHtml(desc)}</p>`
    : '<span class="text-gray-500">No description provided.</span>';
}

function startEditExpense(field) {
  if (!activeExpenseId) return;
  const expense = expenses.find((e) => e.id === activeExpenseId);
  if (!expense) return;
  editingExpenseField = field;
  expenseEditDraft = field === 'title' ? expense.title : (expense.description || '');
  renderExpenseTitleArea(expense);
  renderExpenseDescArea(expense);
}

function cancelEditExpense() {
  editingExpenseField = null;
  expenseEditDraft = '';
  const expense = expenses.find((e) => e.id === activeExpenseId);
  if (expense) {
    renderExpenseTitleArea(expense);
    renderExpenseDescArea(expense);
  }
}

async function saveEditExpense(field) {
  if (!activeExpenseId) return;
  const input = document.getElementById(field === 'title' ? 'expenseTitleEditInput' : 'expenseDescEditInput');
  const value = (input?.value ?? '').trim();
  if (field === 'title' && !value) {
    showAlert('Title cannot be empty');
    return;
  }
  const body = field === 'title' ? { title: value } : { description: value };
  const r = await apiFetch(`/api/teams/${teamId}/tasksplit/expenses/${activeExpenseId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const updated = await parseJsonResponse(r);
  if (!r.ok) {
    showAlert(updated.error || 'Failed to save');
    return;
  }
  const idx = expenses.findIndex((e) => e.id === activeExpenseId);
  if (idx !== -1) expenses[idx] = updated;
  editingExpenseField = null;
  expenseEditDraft = '';
  renderExpenseTitleArea(updated);
  renderExpenseDescArea(updated);
  renderExpensesList();
  updateSummaryBar();
}

function deleteExpenseFromModal() {
  const expenseId = activeExpenseId;
  if (!expenseId) return;
  const expense = expenses.find((e) => e.id === expenseId);
  if (!expense) return;
  showConfirm({
    title: 'Delete expense?',
    message: `"${expense.title}" will be removed and balances will update.`,
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: async () => {
      closeExpenseDetailPanel();
      await deleteExpense(expenseId);
    },
  });
}

function closeExpenseDetailModal() {
  document.getElementById('expenseDetailModal').classList.add('hidden');
  activeExpenseId = null;
  editingExpenseField = null;
  expenseEditDraft = '';
  resetExpenseDetailComments();
}

function closeExpenseDetailPanel() {
  requestCloseTaskflowOverlay();
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
  if (typeof renderBalances === 'function') renderBalances();
  if (typeof scheduleTaskflowZoomRemeasure === 'function') scheduleTaskflowZoomRemeasure();
  return true;
}
