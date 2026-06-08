/**
 * TaskSplit expenses — list, add, edit, splits, attachments.
 */

function splitTypeLabelUi(splitType) {
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

function splitValueLabel(splitType) {
  switch (splitType) {
    case 'percentage':
      return '%';
    case 'custom':
      return 'Amount';
    case 'shares':
      return 'Shares';
    default:
      return '';
  }
}

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
      <div>Paid by <span class="text-gray-400">${escHtml(payer)}</span> · ${escHtml(splitTypeLabelUi(expense.split_type))}</div>
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
      ${(e.attachments || []).length ? '<p class="text-[10px] text-gray-600 mt-1.5">📎 Receipt attached</p>' : ''}
    </div>`,
    )
    .join('');
}

function updateSummaryBar() {
  const total = workspaceData?.total_spent ?? expenses.reduce((s, e) => s + Number(e.amount), 0);
  document.getElementById('totalSpent').textContent = formatMoney(total);
  document.getElementById('expenseCount').textContent = `${expenses.length} expense${expenses.length === 1 ? '' : 's'}`;
}

function canModifyExpenseUi(expense) {
  if (!expense || !currentUser) return false;
  if (workspaceData?.role === 'owner') return true;
  return String(expense.created_by) === String(currentUser.id);
}

function getSelectedParticipantIds() {
  return [...document.querySelectorAll('.expense-participant-cb:checked')].map((el) => el.value);
}

function renderExpenseSplitValues() {
  const wrap = document.getElementById('expenseSplitValuesWrap');
  const hint = document.getElementById('expenseSplitHint');
  const splitType = document.getElementById('expenseSplitType')?.value || 'equal';
  const members = workspaceData?.members || [];
  const selectedIds = getSelectedParticipantIds();

  if (!wrap) return;

  if (splitType === 'equal') {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
    if (hint) hint.textContent = 'The total is divided evenly among selected participants.';
    return;
  }

  wrap.classList.remove('hidden');
  const label = splitValueLabel(splitType);
  wrap.innerHTML = selectedIds
    .map((id) => {
      const member = members.find((m) => String(m.id) === String(id));
      const name = member?.username || 'Member';
      const existing = expenseSplitDraft[id];
      return `
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-400 flex-1 truncate">${escHtml(name)}</span>
        <input type="number" min="0" step="${splitType === 'percentage' ? '0.01' : '0.01'}"
          data-split-user="${id}" value="${existing ?? ''}" placeholder="${label}"
          oninput="expenseSplitDraft[this.dataset.splitUser]=this.value; updateExpenseSplitHint()"
          class="w-28 bg-ink-700 border border-white/10 rounded-lg px-3 py-1.5 text-white font-mono text-sm focus:outline-none focus:border-brand-500 transition" />
        ${splitType === 'percentage' ? '<span class="text-xs text-gray-500">%</span>' : ''}
      </div>`;
    })
    .join('');

  updateExpenseSplitHint();
}

function updateExpenseSplitHint() {
  const hint = document.getElementById('expenseSplitHint');
  const splitType = document.getElementById('expenseSplitType')?.value || 'equal';
  const amount = Number(document.getElementById('expenseAmount')?.value || 0);
  const selectedIds = getSelectedParticipantIds();
  if (!hint) return;

  if (splitType === 'percentage') {
    const total = selectedIds.reduce((sum, id) => sum + Number(expenseSplitDraft[id] || 0), 0);
    hint.textContent = `Percentages total: ${total.toFixed(2)}% (must equal 100%)`;
    hint.className = `text-xs ${Math.abs(total - 100) < 0.01 ? 'text-emerald-400' : 'text-amber-400'}`;
    return;
  }
  if (splitType === 'custom') {
    const total = selectedIds.reduce((sum, id) => sum + Number(expenseSplitDraft[id] || 0), 0);
    hint.textContent = amount
      ? `Custom total: ${formatMoney(total)} of ${formatMoney(amount)}`
      : 'Enter amounts that add up to the expense total';
    hint.className = `text-xs ${amount && Math.abs(total - amount) < 0.01 ? 'text-emerald-400' : 'text-amber-400'}`;
    return;
  }
  if (splitType === 'shares') {
    const totalShares = selectedIds.reduce((sum, id) => sum + Number(expenseSplitDraft[id] || 0), 0);
    hint.textContent = `Total shares: ${totalShares || 0}`;
    hint.className = 'text-xs text-gray-500';
  }
}

function onExpenseSplitTypeChange() {
  renderExpenseSplitValues();
}

function onExpenseParticipantsChange() {
  renderExpenseSplitValues();
}

function buildParticipantSplitsPayload() {
  const splitType = document.getElementById('expenseSplitType')?.value || 'equal';
  const selectedIds = getSelectedParticipantIds();
  return selectedIds.map((user_id) => ({
    user_id,
    split_value:
      splitType === 'equal' ? null : expenseSplitDraft[user_id] != null ? Number(expenseSplitDraft[user_id]) : null,
  }));
}

function populateExpenseForm({ expense = null } = {}) {
  const members = workspaceData?.members || [];
  const isSolo = workspaceData?.team?.expense_mode === 'solo';
  const isEdit = !!expense;

  expenseSplitDraft = {};
  document.getElementById('expenseTitle').value = expense?.title || '';
  document.getElementById('expenseAmount').value = expense ? String(expense.amount) : '';
  document.getElementById('expenseDescription').value = expense?.description || '';
  document.getElementById('expenseDate').value = expense?.expense_date || todayLocalDateString();

  const paidBySel = document.getElementById('expensePaidBy');
  const payerId = expense?.paid_by || currentUser?.id;
  paidBySel.innerHTML = members
    .map(
      (m) =>
        `<option value="${m.id}" ${String(m.id) === String(payerId) ? 'selected' : ''}>${escHtml(m.username)}</option>`,
    )
    .join('');

  const participantIds = new Set((expense?.participants || members).map((p) => String(p.user_id || p.id)));
  const partWrap = document.getElementById('expenseParticipantsWrap');
  const splitWrap = document.getElementById('expenseSplitTypeWrap');
  const partList = document.getElementById('expenseParticipantsList');

  if (isSolo) {
    partWrap.classList.add('hidden');
    splitWrap?.classList.add('hidden');
  } else {
    partWrap.classList.remove('hidden');
    splitWrap?.classList.remove('hidden');
    partList.innerHTML = members
      .map(
        (m) => `
      <label class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
        <input type="checkbox" class="expense-participant-cb rounded border-white/20 bg-ink-700 text-brand-500" value="${m.id}" ${participantIds.has(String(m.id)) ? 'checked' : ''} onchange="onExpenseParticipantsChange()" />
        ${userAvatarHtml(m, 'w-6 h-6')}
        <span>${escHtml(m.username)}</span>
      </label>`,
      )
      .join('');

    const splitTypeSel = document.getElementById('expenseSplitType');
    if (splitTypeSel) splitTypeSel.value = expense?.split_type || 'equal';
    for (const p of expense?.participants || []) {
      if (p.split_value != null) expenseSplitDraft[p.user_id] = String(p.split_value);
    }
    renderExpenseSplitValues();
  }

  document.getElementById('addExpenseModalTitle').textContent = isEdit ? 'Edit expense' : 'Add expense';
  document.getElementById('addExpenseModalSubtitle').textContent = isSolo
    ? 'Update your personal expense record.'
    : 'Choose how to split among selected participants.';
  const btn = document.getElementById('addExpenseBtn');
  btn.textContent = isEdit ? 'Save changes' : 'Add expense';
}

function openAddExpenseModal() {
  closeTaskflowOverlayBeforeOpen('addExpense');
  editingExpenseId = null;
  expenseSplitDraft = {};
  document.getElementById('addExpenseError').classList.add('hidden');
  populateExpenseForm();
  document.getElementById('addExpenseModal').classList.remove('hidden');
  pushTaskflowOverlay('addExpense');
  setTimeout(() => document.getElementById('expenseTitle').focus(), 50);
}

function openEditExpenseModal() {
  const expense = expenses.find((e) => e.id === activeExpenseId);
  if (!expense || !canModifyExpenseUi(expense)) return;
  closeTaskflowOverlayBeforeOpen('addExpense');
  editingExpenseId = expense.id;
  document.getElementById('addExpenseError').classList.add('hidden');
  populateExpenseForm({ expense });
  document.getElementById('addExpenseModal').classList.remove('hidden');
  pushTaskflowOverlay('addExpense');
  setTimeout(() => document.getElementById('expenseAmount').focus(), 50);
}

function closeAddExpenseModal() {
  document.getElementById('addExpenseModal').classList.add('hidden');
  editingExpenseId = null;
  expenseSplitDraft = {};
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
  let participantSplits = null;
  let splitType = 'equal';

  if (!isSolo) {
    participantIds = getSelectedParticipantIds();
    if (!participantIds.length) {
      errEl.textContent = 'Select at least one participant';
      errEl.classList.remove('hidden');
      return;
    }
    splitType = document.getElementById('expenseSplitType')?.value || 'equal';
    participantSplits = buildParticipantSplitsPayload();
  }

  const isEdit = !!editingExpenseId;
  setButtonLoading(btn, true, isEdit ? 'Saving…' : 'Adding…');
  const payload = {
    title,
    amount: Number(amount),
    description,
    paid_by: paidBy,
    participant_ids: participantIds,
    participant_splits: participantSplits,
    split_type: splitType,
    expense_date: expenseDate,
  };
  const r = await apiFetch(
    isEdit
      ? `/api/teams/${teamId}/tasksplit/expenses/${editingExpenseId}`
      : `/api/teams/${teamId}/tasksplit/expenses`,
    {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  const data = await parseJsonResponse(r);
  setButtonLoading(btn, false);

  if (!r.ok) {
    errEl.textContent = data.error || (isEdit ? 'Failed to save expense' : 'Failed to add expense');
    errEl.classList.remove('hidden');
    return;
  }

  const reopenId = editingExpenseId;
  closeAddExpenseModal();
  dismissTaskflowOverlayHistory('addExpense');
  await refreshAll();
  if (reopenId && data.id) {
    openExpenseDetail(data.id);
  }
}

function renderExpenseAttachments(expense) {
  const section = document.getElementById('expenseDetailAttachments');
  const list = document.getElementById('expenseAttachmentsList');
  const attachBtn = document.getElementById('expenseAttachBtn');
  if (!section || !list) return;

  const isSolo = workspaceData?.team?.expense_mode === 'solo';
  const canEdit = canModifyExpenseUi(expense);
  section.classList.toggle('hidden', isSolo);
  attachBtn?.classList.toggle('hidden', !canEdit);

  const attachments = expense.attachments || [];
  if (!attachments.length) {
    list.innerHTML = '<p class="text-xs text-gray-600">No receipts attached.</p>';
    return;
  }

  list.innerHTML = attachments
    .map(
      (att) => `
    <div class="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/10">
      <button type="button" class="flex items-center gap-2 min-w-0 flex-1 text-left" data-preview-attachment data-url="${escHtml(att.file_url)}" data-name="${escHtml(att.file_name)}" data-mime="${escHtml(att.mime_type)}">
        <span class="shrink-0">${attachmentFileIconHtml(att.mime_type)}</span>
        <span class="text-xs text-gray-300 truncate">${escHtml(att.file_name)}</span>
      </button>
      ${canEdit ? `<button type="button" onclick="deleteExpenseAttachment('${att.id}')" class="text-gray-500 hover:text-red-400 p-1 rounded-lg hover:bg-red-500/10 shrink-0" title="Remove">✕</button>` : ''}
    </div>`,
    )
    .join('');
}

async function uploadExpenseAttachment(file) {
  if (!activeExpenseId || !file) return;
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  if (!allowed.includes(file.type)) {
    showAlert('File type not allowed. Use JPEG, PNG, WebP, GIF, or PDF.');
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    showAlert('File must be 8 MB or smaller.');
    return;
  }

  const form = new FormData();
  form.append('file', file);
  const r = await apiFetch(`/api/teams/${teamId}/tasksplit/expenses/${activeExpenseId}/attachments`, {
    method: 'POST',
    body: form,
  });
  const data = await parseJsonResponse(r);
  if (!r.ok) {
    showAlert(data.error || 'Upload failed');
    return;
  }

  const idx = expenses.findIndex((e) => e.id === activeExpenseId);
  if (idx !== -1) {
    expenses[idx].attachments = [...(expenses[idx].attachments || []), data];
    renderExpenseAttachments(expenses[idx]);
    renderExpensesList();
  }
}

async function deleteExpenseAttachment(attachmentId) {
  if (!activeExpenseId) return;
  const r = await apiFetch(
    `/api/teams/${teamId}/tasksplit/expenses/${activeExpenseId}/attachments/${attachmentId}`,
    { method: 'DELETE' },
  );
  const data = await parseJsonResponse(r);
  if (!r.ok) {
    showAlert(data.error || 'Failed to remove attachment');
    return;
  }
  const idx = expenses.findIndex((e) => e.id === activeExpenseId);
  if (idx !== -1) {
    expenses[idx].attachments = (expenses[idx].attachments || []).filter((a) => a.id !== attachmentId);
    renderExpenseAttachments(expenses[idx]);
    renderExpensesList();
  }
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
    splitsEl.innerHTML = `
      <p class="text-xs text-gray-500 uppercase tracking-wider mb-2">${escHtml(splitTypeLabelUi(expense.split_type))}</p>
      ${(expense.participants || [])
        .map((p) => {
          let detail = formatMoney(p.share_amount);
          if (expense.split_type === 'percentage' && p.split_value != null) detail += ` (${p.split_value}%)`;
          if (expense.split_type === 'shares' && p.split_value != null) detail += ` (${p.split_value} share${p.split_value === 1 ? '' : 's'})`;
          return `
      <div class="flex items-center justify-between text-sm py-1.5">
        <div class="flex items-center gap-2">
          ${userAvatarHtml(p.user || { username: '?' }, 'w-6 h-6')}
          <span class="text-gray-300">${escHtml(p.user?.username || 'Member')}</span>
        </div>
        <span class="text-gray-400 font-mono">${detail}</span>
      </div>`;
        })
        .join('')}`;
  }

  renderExpenseAttachments(expense);

  const canEdit = canModifyExpenseUi(expense);
  document.getElementById('expenseEditBtn')?.classList.toggle('hidden', !canEdit);
  document.getElementById('expenseDeleteBtn')?.classList.toggle('hidden', !canEdit);
  document.getElementById('expenseEditDescBtn')?.classList.toggle('hidden', !canEdit);
  document.getElementById('expenseEditDetailsWrap')?.classList.toggle('hidden', !canEdit);

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
  if (typeof scheduleTaskflowZoomRemeasure === 'function') scheduleTaskflowZoomRemeasure();
  return true;
}
