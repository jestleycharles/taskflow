/**
 * board/invites.js
 * Team invite links and email invites.
 * Depends on: state.js, helpers.js, team-board.js
 */

// Invite link
async function copyInviteLink() {
  if (teamData?.owner_is_guest) {
    const msg = document.getElementById('inviteLinkMsg');
    msg.classList.remove('hidden');
    msg.className = 'text-xs mt-2 text-amber-400';
    msg.textContent = 'Invite links require a registered team owner.';
    return;
  }
  const btn = document.getElementById('copyInviteLinkBtn');
  const msg = document.getElementById('inviteLinkMsg');
  const prevLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Generating…';
  msg.classList.add('hidden');

  const r = await apiFetch(`/api/teams/${teamId}/invite-links`, { method: 'POST' });
  const d = await parseJsonResponse(r);
  btn.disabled = false;
  btn.textContent = prevLabel;

  if (!r.ok || !d.link?.url) {
    msg.classList.remove('hidden');
    msg.className = 'text-xs mt-2 text-red-400';
    msg.textContent = d.error || 'Could not create invite link';
    return;
  }

  try {
    await navigator.clipboard.writeText(d.link.url);
    msg.classList.remove('hidden');
    msg.className = 'text-xs mt-2 text-emerald-400';
    const expiry = d.link.expires_at
      ? ` Expires ${new Date(d.link.expires_at).toLocaleDateString()}.`
      : '';
    msg.textContent = `✓ Link copied to clipboard.${expiry}`;
  } catch {
    msg.classList.remove('hidden');
    msg.className = 'text-xs mt-2 text-amber-400 break-all';
    msg.textContent = d.link.url;
  }
}

// Invite
async function inviteMember() {
  if (teamData?.owner_is_guest) {
    const msg = document.getElementById('inviteMsg');
    msg.classList.remove('hidden');
    msg.className = 'text-xs mt-2 text-amber-400';
    msg.textContent = 'Inviting members requires a registered team owner.';
    return;
  }
  const email = document.getElementById('inviteEmail').value.trim();
  if (!email) return;
  if (email.toLowerCase() === GUEST_EMAIL) {
    const msg = document.getElementById('inviteMsg');
    msg.classList.remove('hidden');
    msg.className = 'text-xs mt-2 text-amber-400';
    msg.textContent = 'Guest accounts cannot be invited to teams.';
    return;
  }
  const r = await apiFetch(`/api/teams/${teamId}/invite`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ email })
  });
  const d = await r.json();
  const msg = document.getElementById('inviteMsg');
  msg.classList.remove('hidden');
  if (d.success) {
    msg.className = 'text-xs mt-2 text-emerald-400';
    msg.textContent = d.pending
      ? `✓ Invitation sent to ${d.user.username}`
      : `✓ ${d.user.username} added to team!`;
    document.getElementById('inviteEmail').value = '';
    await loadTeam();
  } else {
    msg.className = 'text-xs mt-2 text-red-400';
    msg.textContent = d.error;
  }
}
