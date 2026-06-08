/**
 * TaskSplit Balance Center (duo/group) and Spending Insights (solo).
 */

function isSoloExpenseTeam() {
  return workspaceData?.team?.expense_mode === 'solo';
}

function updateBalanceNavUi() {
  const btn = document.getElementById('balanceNavBtn');
  const label = document.getElementById('balanceNavBtnLabel');
  const title = document.getElementById('balancePanelTitle');
  const subtitle = document.getElementById('balancePanelSubtitle');
  const solo = isSoloExpenseTeam();

  btn?.classList.remove('hidden');
  if (label) label.textContent = solo ? 'Insights' : 'Balances';
  if (title) title.textContent = solo ? 'Spending Insights' : 'Balance Center';
  if (subtitle) subtitle.textContent = solo ? 'Your spending over time' : 'Simplified debts — who owes whom';
  const icon = document.getElementById('balanceNavBtnIcon');
  if (icon) {
    icon.innerHTML = solo
      ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />'
      : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />';
  }
}

function getMemberSettleOptions(memberId) {
  if (!balances || !currentUser || isSoloExpenseTeam()) return [];
  const uid = String(currentUser.id);
  const mid = String(memberId);
  const options = [];

  for (const row of balances.you_owe || []) {
    if (String(row.user_id) === mid) {
      options.push({
        key: `pay:${mid}`,
        direction: 'pay',
        from_user: uid,
        to_user: mid,
        amount: Number(row.amount),
        label: `You pay ${row.user?.username || 'member'}`,
      });
    }
  }
  for (const row of balances.you_are_owed || []) {
    if (String(row.user_id) === mid) {
      options.push({
        key: `receive:${mid}`,
        direction: 'receive',
        from_user: mid,
        to_user: uid,
        amount: Number(row.amount),
        label: `${row.user?.username || 'Member'} pays you`,
      });
    }
  }
  return options;
}

function startOfWeekLocalYmd() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return todayLocalDateString(d);
}

function startOfMonthLocalYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function startOfYearLocalYmd() {
  return `${new Date().getFullYear()}-01-01`;
}

function daysInclusive(startYmd, endYmd) {
  const start = new Date(`${startYmd}T12:00:00`);
  const end = new Date(`${endYmd}T12:00:00`);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function expensesSince(startYmd) {
  return (expenses || []).filter((e) => e.expense_date >= startYmd);
}

function spendingStatsFor(list, periodDays) {
  const total = list.reduce((sum, e) => sum + Number(e.amount), 0);
  const count = list.length;
  const average = count ? total / count : 0;
  const dailyAverage = periodDays ? total / periodDays : 0;
  return { total, count, average, dailyAverage };
}

function renderSpendingStatCard(label, stats, periodDays) {
  const dailyLine = periodDays > 1
    ? `<p class="text-xs text-gray-600 mt-1">${formatMoney(stats.dailyAverage)}/day avg</p>`
    : '';
  return `
    <div class="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p class="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">${escHtml(label)}</p>
      <p class="text-lg font-mono font-semibold text-white">${formatMoney(stats.total)}</p>
      <p class="text-xs text-gray-400 mt-1">${stats.count} expense${stats.count === 1 ? '' : 's'}${stats.count ? ` · ${formatMoney(stats.average)} avg` : ''}</p>
      ${dailyLine}
    </div>`;
}

function renderSpendingInsights() {
  const panel = document.getElementById('balancePanelContent');
  if (!panel) return;

  const today = todayLocalDateString();
  const weekStart = startOfWeekLocalYmd();
  const monthStart = startOfMonthLocalYmd();
  const yearStart = startOfYearLocalYmd();

  const todayStats = spendingStatsFor(expensesSince(today), 1);
  const weekStats = spendingStatsFor(expensesSince(weekStart), daysInclusive(weekStart, today));
  const monthStats = spendingStatsFor(expensesSince(monthStart), daysInclusive(monthStart, today));
  const yearStats = spendingStatsFor(expensesSince(yearStart), daysInclusive(yearStart, today));
  const allTimeStats = spendingStatsFor(expenses || [], 0);

  panel.innerHTML = `
    <div class="space-y-3">
      ${renderSpendingStatCard('Today', todayStats, 1)}
      ${renderSpendingStatCard('This week', weekStats, daysInclusive(weekStart, today))}
      ${renderSpendingStatCard('This month', monthStats, daysInclusive(monthStart, today))}
      ${renderSpendingStatCard('This year', yearStats, daysInclusive(yearStart, today))}
      <div class="border-t border-white/10 pt-4">
        <p class="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">All time</p>
        <p class="text-sm text-gray-300">${formatMoney(allTimeStats.total)} across ${allTimeStats.count} expense${allTimeStats.count === 1 ? '' : 's'}</p>
        ${allTimeStats.count ? `<p class="text-xs text-gray-500 mt-1">${formatMoney(allTimeStats.average)} average per expense</p>` : '<p class="text-xs text-gray-600 mt-1">No expenses recorded yet</p>'}
      </div>
    </div>`;

  const inline = document.getElementById('balanceInlineSummary');
  if (inline) {
    if (!todayStats.count) {
      inline.innerHTML = '<span class="text-gray-500 text-xs">No spending today</span>';
    } else {
      inline.innerHTML = `<span class="text-emerald-400 text-xs">Today: ${formatMoney(todayStats.total)}</span>`;
    }
  }
}

function renderSimplifiedDebtsSection() {
  const simplified = balances?.simplified_debts || [];
  if (!simplified.length) {
    return `
      <div class="border-t border-white/10 pt-4">
        <h4 class="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">Suggested settlements</h4>
        <p class="text-gray-600 text-sm">Everyone is settled up</p>
      </div>`;
  }

  const rows = simplified
    .map((row) => {
      const from = row.from_user_profile?.username || 'Someone';
      const to = row.to_user_profile?.username || 'Someone';
      const isYouPayer = String(row.from_user) === String(currentUser?.id);
      const isYouPayee = String(row.to_user) === String(currentUser?.id);
      const settleBtn =
        isYouPayer || isYouPayee
          ? `<button type="button" onclick="openSettleModal('${isYouPayer ? row.to_user : row.from_user}', ${row.amount}, { direction: '${isYouPayer ? 'pay' : 'receive'}' })"
              class="text-xs bg-brand-500/20 hover:bg-brand-500/30 text-brand-500 px-2.5 py-1 rounded-lg transition">Settle</button>`
          : '';
      return `
      <div class="flex items-center justify-between gap-2 py-2 border-b border-white/5 last:border-0 text-sm">
        <p class="text-gray-300 min-w-0 truncate">
          <span class="text-white">${escHtml(from)}</span>
          <span class="text-gray-500"> owes </span>
          <span class="text-white">${escHtml(to)}</span>
        </p>
        <div class="flex items-center gap-2 shrink-0">
          <span class="font-mono text-emerald-400">${formatMoney(row.amount)}</span>
          ${settleBtn}
        </div>
      </div>`;
    })
    .join('');

  return `
    <div class="border-t border-white/10 pt-4">
      <h4 class="text-xs font-medium uppercase tracking-wider text-gray-500 mb-1">Suggested settlements</h4>
      <p class="text-[11px] text-gray-600 mb-2 leading-relaxed">Minimum payments needed to settle everyone up.</p>
      ${rows}
    </div>`;
}

function renderBalances() {
  updateBalanceNavUi();

  if (isSoloExpenseTeam()) {
    renderSpendingInsights();
    return;
  }

  if (!balances) return;

  const balancePanel = document.getElementById('balancePanelContent');
  const youOwe = balances.you_owe || [];
  const youAreOwed = balances.you_are_owed || [];

  const oweHtml = youOwe.length
    ? youOwe
        .map(
          (row) => `
      <div class="flex items-center justify-between gap-2 py-2 border-b border-white/5 last:border-0">
        <div class="flex items-center gap-2 min-w-0">
          ${userAvatarHtml(row.user || { username: '?' }, 'w-7 h-7')}
          <span class="text-gray-300 text-sm truncate">${escHtml(row.user?.username || 'Member')}</span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="balance-negative font-mono text-sm font-medium">${formatMoney(row.amount)}</span>
          <button type="button" onclick="openSettleModal('${row.user_id}', ${row.amount}, { direction: 'pay' })"
            class="text-xs bg-brand-500/20 hover:bg-brand-500/30 text-brand-500 px-2.5 py-1 rounded-lg transition">
            Settle
          </button>
        </div>
      </div>`,
        )
        .join('')
    : '<p class="text-gray-600 text-sm py-2">You don\'t owe anyone</p>';

  const owedHtml = youAreOwed.length
    ? youAreOwed
        .map(
          (row) => `
      <div class="flex items-center justify-between gap-2 py-2 border-b border-white/5 last:border-0">
        <div class="flex items-center gap-2 min-w-0">
          ${userAvatarHtml(row.user || { username: '?' }, 'w-7 h-7')}
          <span class="text-gray-300 text-sm truncate">${escHtml(row.user?.username || 'Member')}</span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="balance-positive font-mono text-sm font-medium">+${formatMoney(row.amount)}</span>
          <button type="button" onclick="openSettleModal('${row.user_id}', ${row.amount}, { direction: 'receive' })"
            class="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 px-2.5 py-1 rounded-lg transition">
            Record
          </button>
        </div>
      </div>`,
        )
        .join('')
    : '<p class="text-gray-600 text-sm py-2">No one owes you</p>';

  const netHtml = (balances.net_balances || [])
    .filter((row) => row.user_id !== currentUser?.id)
    .map((row) => {
      const bal = Number(row.balance);
      const cls = bal > 0 ? 'balance-positive' : bal < 0 ? 'balance-negative' : 'text-gray-500';
      const sign = bal > 0 ? '+' : '';
      return `
      <div class="flex items-center justify-between text-xs py-1">
        <span class="text-gray-500">${escHtml(row.user?.username || 'Member')}</span>
        <span class="${cls} font-mono">${sign}${formatMoney(bal)}</span>
      </div>`;
    })
    .join('');

  const historyHtml = renderSettlementHistory();
  const simplifiedHtml = renderSimplifiedDebtsSection();

  const html = `
    <div class="space-y-5">
      <div>
        <h4 class="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">You owe</h4>
        ${oweHtml}
      </div>
      <div>
        <h4 class="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">You are owed</h4>
        ${owedHtml}
      </div>
      ${simplifiedHtml}
      <div class="border-t border-white/10 pt-4">
        <h4 class="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">All balances</h4>
        ${netHtml || '<p class="text-gray-600 text-sm">Everyone is settled up</p>'}
      </div>
      ${historyHtml}
    </div>`;

  if (balancePanel) balancePanel.innerHTML = html;

  const inline = document.getElementById('balanceInlineSummary');
  if (inline) {
    if (!youOwe.length && !youAreOwed.length) {
      inline.innerHTML = '<span class="text-emerald-400 text-xs">All settled up</span>';
    } else if (youOwe.length) {
      const top = youOwe[0];
      inline.innerHTML = `<span class="text-amber-400 text-xs">You owe ${escHtml(top.user?.username || 'someone')} ${formatMoney(top.amount)}</span>`;
    } else {
      const top = youAreOwed[0];
      inline.innerHTML = `<span class="text-emerald-400 text-xs">${escHtml(top.user?.username || 'Someone')} owes you ${formatMoney(top.amount)}</span>`;
    }
  }
}

function openBalancePanel() {
  closeTaskflowOverlayBeforeOpen('balance');
  if (chatPanelOpen) closeChatPanelUi();
  closeAllPanels();
  document.getElementById('balancePanel').classList.remove('hidden');
  setSidePanelMobileOpen(true);
  renderBalances();
  pushTaskflowOverlay('balance');
}

function closeBalancePanelUi() {
  document.getElementById('balancePanel').classList.add('hidden');
  setSidePanelMobileOpen(false);
}

function closeBalancePanel() {
  requestCloseTaskflowOverlay();
}

function renderSettlementHistory() {
  if (!settlements?.length) {
    return `
      <div class="border-t border-white/10 pt-4">
        <h4 class="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">Payment history</h4>
        <p class="text-gray-600 text-sm">No settlements recorded yet</p>
      </div>`;
  }

  const rows = settlements
    .slice(0, 20)
    .map((s) => {
      const from = s.from_user_profile?.username || 'Someone';
      const to = s.to_user_profile?.username || 'Someone';
      const date = s.paid_at ? new Date(s.paid_at).toLocaleDateString() : '';
      return `
      <div class="py-2 border-b border-white/5 last:border-0 text-xs">
        <p class="text-gray-300">
          <span class="text-white">${escHtml(from)}</span>
          paid
          <span class="text-white">${escHtml(to)}</span>
          <span class="font-mono text-emerald-400">${formatMoney(s.amount)}</span>
        </p>
        <p class="text-gray-600 mt-0.5">${escHtml(date)}${s.note ? ` · ${escHtml(s.note)}` : ''}</p>
      </div>`;
    })
    .join('');

  return `
    <div class="border-t border-white/10 pt-4">
      <h4 class="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">Payment history</h4>
      ${rows}
    </div>`;
}

function applySettleOption(option) {
  settleSelectedOption = option;
  settleMaxAmount = Number(option.amount);
  document.getElementById('settleAmountInput').value = String(settleMaxAmount);
  document.getElementById('settleMaxHint').textContent = `Outstanding: ${formatMoney(settleMaxAmount)}`;
}

function onSettleDirectionChange() {
  const sel = document.getElementById('settleDirectionSelect');
  const key = sel?.value;
  const option = settleOptions.find((o) => o.key === key);
  if (option) applySettleOption(option);
}

function openSettleModal(memberUserId, maxAmount, { direction = 'pay', presetOption = null } = {}) {
  const member = (workspaceData?.members || []).find((m) => String(m.id) === String(memberUserId));
  const name = member?.username || 'this member';

  settleOptions = presetOption ? [presetOption] : getMemberSettleOptions(memberUserId);
  if (!settleOptions.length && direction === 'pay') {
    settleOptions = [{
      key: `pay:${memberUserId}`,
      direction: 'pay',
      from_user: currentUser.id,
      to_user: memberUserId,
      amount: Number(maxAmount),
      label: `You pay ${name}`,
    }];
  } else if (!settleOptions.length && direction === 'receive') {
    settleOptions = [{
      key: `receive:${memberUserId}`,
      direction: 'receive',
      from_user: memberUserId,
      to_user: currentUser.id,
      amount: Number(maxAmount),
      label: `${name} pays you`,
    }];
  }

  if (presetOption) {
    settleOptions = [presetOption];
  }

  settleTargetUserId = memberUserId;
  const directionWrap = document.getElementById('settleDirectionWrap');
  const directionSel = document.getElementById('settleDirectionSelect');

  if (settleOptions.length > 1) {
    directionWrap?.classList.remove('hidden');
    if (directionSel) {
      directionSel.innerHTML = settleOptions
        .map((o) => `<option value="${escHtml(o.key)}">${escHtml(o.label)} (${formatMoney(o.amount)})</option>`)
        .join('');
    }
  } else {
    directionWrap?.classList.add('hidden');
  }

  const initial = settleOptions[0];
  if (!initial) return;

  applySettleOption(initial);

  document.getElementById('settleModalSubtitle').textContent =
    `Record a payment with ${name}. Balances update immediately.`;
  document.getElementById('settleNoteInput').value = '';
  document.getElementById('settleModalError')?.classList.add('hidden');
  document.getElementById('settleModal').classList.remove('hidden');
}

function closeSettleModal() {
  document.getElementById('settleModal').classList.add('hidden');
  settleTargetUserId = null;
  settleMaxAmount = 0;
  settleOptions = [];
  settleSelectedOption = null;
}

async function submitSettleModal() {
  const errEl = document.getElementById('settleModalError');
  const amount = Number(document.getElementById('settleAmountInput')?.value);
  const note = document.getElementById('settleNoteInput')?.value.trim();

  if (settleOptions.length > 1) {
    const sel = document.getElementById('settleDirectionSelect');
    settleSelectedOption = settleOptions.find((o) => o.key === sel?.value) || settleSelectedOption;
  }

  if (!settleSelectedOption || !Number.isFinite(amount) || amount <= 0) {
    errEl.textContent = 'Enter a valid amount';
    errEl.classList.remove('hidden');
    return;
  }
  if (amount > settleMaxAmount + 0.001) {
    errEl.textContent = `Amount cannot exceed ${formatMoney(settleMaxAmount)}`;
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('settleSubmitBtn');
  setButtonLoading(btn, true, 'Saving…');
  const ok = await submitSettlement({
    from_user: settleSelectedOption.from_user,
    to_user: settleSelectedOption.to_user,
    amount,
    note,
  });
  setButtonLoading(btn, false);
  if (ok) closeSettleModal();
}

async function submitSettlement({ from_user, to_user, amount, note }) {
  const r = await apiFetch(`/api/teams/${teamId}/tasksplit/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from_user, to_user, amount, note: note || undefined }),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok) {
    const errEl = document.getElementById('settleModalError');
    if (errEl && !document.getElementById('settleModal').classList.contains('hidden')) {
      errEl.textContent = data.error || 'Settlement failed';
      errEl.classList.remove('hidden');
    } else {
      showAlert(data.error || 'Settlement failed');
    }
    return false;
  }
  await refreshAll();
  return true;
}

async function loadSettlements() {
  if (isSoloExpenseTeam()) {
    settlements = [];
    return true;
  }
  const r = await apiFetch(`/api/teams/${teamId}/tasksplit/settlements`);
  const data = await parseJsonResponse(r);
  if (!r.ok) return false;
  settlements = Array.isArray(data) ? data : [];
  return true;
}

async function loadBalances() {
  if (isSoloExpenseTeam()) {
    renderBalances();
    return true;
  }
  const [balOk, settleOk] = await Promise.all([
    apiFetch(`/api/teams/${teamId}/tasksplit/balances`).then(async (r) => {
      const data = await parseJsonResponse(r);
      if (!r.ok) return false;
      balances = data;
      return true;
    }),
    loadSettlements(),
  ]);
  if (balOk) {
    renderBalances();
    if (!document.getElementById('teamPanel')?.classList.contains('hidden')) {
      renderMemberList?.(teamData?.members || workspaceData?.members || []);
    }
  }
  return balOk && settleOk;
}
