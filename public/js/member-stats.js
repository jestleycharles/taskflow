/**
 * Shared member online count display — "1/1" with green presence dot.
 */

function formatMemberCountLabel(online, total) {
  return `${online}/${total}`;
}

function memberStatsWithDotHtml(online, total) {
  return `<span class="inline-flex items-center gap-1 shrink-0" title="Members online">
    <span>${formatMemberCountLabel(online, total)}</span>
    <span class="online-dot w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
  </span>`;
}

function taskSplitModeIconHtml(mode) {
  const labels = { solo: 'Solo', duo: 'Duo', group: 'Group' };
  const title = labels[mode] || 'TaskSplit';
  const paths = {
    solo: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    duo: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    group: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  };
  const path = paths[mode] || paths.solo;
  return `<span class="inline-flex shrink-0" title="${escHtml(title)}">
    <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="${path}" />
    </svg>
  </span>`;
}
