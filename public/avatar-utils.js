/** Shared avatar rendering for dashboard & board */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function userAvatarHtml(user, sizeClass, extraClass = '') {
  const cls = `${sizeClass} rounded-full shrink-0 ${extraClass}`.trim();
  if (user?.avatar_url) {
    return `<img src="${escHtml(user.avatar_url)}" alt="" class="${cls} object-cover border-2 border-ink-900" />`;
  }
  const initial = (user?.username || '?')[0].toUpperCase();
  const bg = user?.avatar_color || '#4f6ef7';
  return `<div class="${cls} flex items-center justify-center text-white text-xs font-bold border-2 border-ink-900" style="background:${escHtml(bg)}">${escHtml(initial)}</div>`;
}

function applyAvatarToElement(el, user) {
  if (!el) return;
  el.innerHTML = '';
  el.style.background = '';
  if (user?.avatar_url) {
    const img = document.createElement('img');
    img.src = user.avatar_url;
    img.alt = '';
    img.className = 'w-full h-full rounded-full object-cover';
    el.appendChild(img);
    return;
  }
  el.textContent = (user?.username || '?')[0].toUpperCase();
  el.style.background = user?.avatar_color || '#4f6ef7';
}

function teamInitials(name) {
  return String(name || 'T')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'T';
}

function teamAvatarHtml(team, sizeClass, roundedClass = 'rounded-xl', extraClass = '') {
  const cls = `${sizeClass} ${roundedClass} shrink-0 ${extraClass}`.trim();
  if (team?.avatar_url) {
    return `<img src="${escHtml(team.avatar_url)}" alt="" class="${cls} object-cover border border-white/10" />`;
  }
  const bg = team?.avatar_color || '#4f6ef7';
  return `<div class="${cls} flex items-center justify-center text-white text-xs font-bold border border-white/10" style="background:${escHtml(bg)}">${escHtml(teamInitials(team?.name))}</div>`;
}

function applyTeamAvatarToElement(el, team) {
  if (!el) return;
  el.innerHTML = '';
  el.style.background = '';
  if (team?.avatar_url) {
    const img = document.createElement('img');
    img.src = team.avatar_url;
    img.alt = '';
    img.className = 'w-full h-full object-cover';
    el.appendChild(img);
    return;
  }
  el.textContent = teamInitials(team?.name);
  el.style.background = team?.avatar_color || '#4f6ef7';
}
