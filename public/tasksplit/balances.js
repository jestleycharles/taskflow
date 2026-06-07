/**
 * TaskSplit Balance Center — running balances and settle up.
 */

function renderBalances() {
  if (!balances) return;

  const isSolo = workspaceData?.team?.expense_mode === 'solo';
  const balancePanel = document.getElementById('balancePanelContent');
  const balanceBtn = document.getElementById('balanceNavBtn');

  const sidebar = document.getElementById('balanceSidebar');

  if (isSolo) {
    balanceBtn?.classList.add('hidden');
    sidebar?.classList.add('hidden');
    sidebar?.classList.remove('lg:flex');
    if (balancePanel) {
      balancePanel.innerHTML = `
        <p class="text-gray-500 text-sm">Solo mode tracks your spending only. No splits or balances.</p>`;
    }
    return;
  }

  balanceBtn?.classList.remove('hidden');
  if (!document.getElementById('activityPanel')?.classList.contains('hidden')
    || !document.getElementById('teamPanel')?.classList.contains('hidden')) {
    sidebar?.classList.add('hidden');
    sidebar?.classList.remove('lg:flex');
  } else {
    sidebar?.classList.remove('hidden');
    sidebar?.classList.add('lg:flex');
  }

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
          <button type="button" onclick="settleUp('${row.user_id}', ${row.amount})"
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
        <span class="balance-positive font-mono text-sm font-medium">+${formatMoney(row.amount)}</span>
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
      <div class="border-t border-white/10 pt-4">
        <h4 class="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">All balances</h4>
        ${netHtml || '<p class="text-gray-600 text-sm">Everyone is settled up</p>'}
      </div>
    </div>`;

  if (balancePanel) balancePanel.innerHTML = html;
  const mobilePanel = document.getElementById('balancePanelMobileContent');
  if (mobilePanel) mobilePanel.innerHTML = html;

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
  restoreBalanceSidebarIfNeeded();
}

function closeBalancePanel() {
  requestCloseTaskflowOverlay();
}

function settleUp(toUserId, amount) {
  const member = (workspaceData?.members || []).find((m) => m.id === toUserId);
  const name = member?.username || 'this member';
  showConfirm({
    title: 'Settle up',
    message: `Record a payment of ${formatMoney(amount)} to ${name}? This updates running balances.`,
    confirmLabel: 'Settle up',
    onConfirm: () => submitSettlement(toUserId, amount),
  });
}

async function submitSettlement(toUserId, amount) {
  const r = await apiFetch(`/api/teams/${teamId}/tasksplit/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to_user: toUserId, amount }),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok) {
    showAlert(data.error || 'Settlement failed');
    return;
  }
  await refreshAll();
}

async function loadBalances() {
  const r = await apiFetch(`/api/teams/${teamId}/tasksplit/balances`);
  const data = await parseJsonResponse(r);
  if (!r.ok) return false;
  balances = data;
  renderBalances();
  return true;
}
