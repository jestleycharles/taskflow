/**
 * Text emoticons → emoji, and @mention parsing/rendering for team chat & comments.
 * Depends on escHtml from avatar-utils.js (or page-local escHtml).
 */
(function (global) {
  const TEXT_EMOJI_ENTRIES = [
    [';*', '😘'],
    [';)', '😉'],
    [';-)', '😉'],
    [':*)', '😊'],
    [':-)', '🙂'],
    [':)', '🙂'],
    [':D', '😃'],
    [':-D', '😃'],
    ['xD', '😆'],
    ['XD', '😆'],
    [':P', '😛'],
    [':-P', '😛'],
    [':p', '😛'],
    [":'(", '😢'],
    [':-(', '😢'],
    [':(', '😞'],
    [':-*', '😘'],
    ['<3', '❤️'],
    ['</3', '💔'],
    [':o', '😮'],
    [':O', '😮'],
    [':|', '😐'],
    [':/', '😕'],
    [':\\', '😕'],
    ['B)', '😎'],
    ['>:)', '😈'],
    [';(', '😢'],
    ['T_T', '😭'],
    ['^_^', '😊'],
    ['o.O', '😵'],
    ['O.o', '😵'],
    [':*', '😘'],
    ['=)', '🙂'],
    ['=(', '😞'],
  ].sort((a, b) => b[0].length - a[0].length);

  function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function applyTextEmojis(text) {
    let out = String(text ?? '');
    for (const [code, emoji] of TEXT_EMOJI_ENTRIES) {
      out = out.split(code).join(emoji);
    }
    return out;
  }

  function buildMentionContext(teamData) {
    if (!teamData) return { users: [], roles: [], permRoles: [] };
    const members = teamData.members || [];
    const users = members.map((m) => ({
      id: String(m.id),
      username: m.username || '',
      email: (m.email || '').toLowerCase(),
      member: m,
    }));
    const roles = (teamData.roles || []).map((r) => ({
      id: String(r.id),
      name: r.name || '',
      color_hex: r.color_hex || '#4f6ef7',
      members: members.filter((m) => String(m.custom_role_id) === String(r.id)),
    }));
    const permRoles = [
      { key: 'owner', label: 'owner', members: members.filter((m) => m.role === 'owner') },
      { key: 'admin', label: 'admin', members: members.filter((m) => m.role === 'admin') },
      { key: 'member', label: 'member', members: members.filter((m) => m.role === 'member') },
    ];
    return { users, roles, permRoles };
  }

  function mentionBoundaryOk(content, endIndex) {
    if (endIndex >= content.length) return true;
    const ch = content[endIndex];
    return /[\s.,!?;:)\]}]/.test(ch);
  }

  function findMentionAt(content, atIndex, ctx) {
    const rest = content.slice(atIndex + 1);
    if (!rest.length) return null;
    const candidates = [];

    for (const u of ctx.users) {
      if (u.email && rest.toLowerCase().startsWith(u.email)) {
        candidates.push({
          type: 'user',
          userId: u.id,
          token: content.slice(atIndex + 1, atIndex + 1 + u.email.length),
          display: u.email,
          end: atIndex + 1 + u.email.length,
        });
      }
      const un = u.username;
      if (un && rest.toLowerCase().startsWith(un.toLowerCase())) {
        candidates.push({
          type: 'user',
          userId: u.id,
          token: content.slice(atIndex + 1, atIndex + 1 + un.length),
          display: un,
          end: atIndex + 1 + un.length,
        });
      }
    }
    for (const r of ctx.roles) {
      if (r.name && rest.toLowerCase().startsWith(r.name.toLowerCase())) {
        candidates.push({
          type: 'role',
          roleId: r.id,
          roleName: r.name,
          color: r.color_hex,
          members: r.members,
          token: content.slice(atIndex + 1, atIndex + 1 + r.name.length),
          display: r.name,
          end: atIndex + 1 + r.name.length,
        });
      }
    }
    for (const pr of ctx.permRoles) {
      if (rest.toLowerCase().startsWith(pr.label.toLowerCase())) {
        candidates.push({
          type: 'perm-role',
          permKey: pr.key,
          roleName: pr.label,
          color: pr.key === 'owner' ? '#f59e0b' : pr.key === 'admin' ? '#4f6ef7' : '#9ca3af',
          members: pr.members,
          token: content.slice(atIndex + 1, atIndex + 1 + pr.label.length),
          display: pr.label,
          end: atIndex + 1 + pr.label.length,
        });
      }
    }

    candidates.sort((a, b) => b.token.length - a.token.length);
    const match = candidates[0];
    if (!match || !mentionBoundaryOk(content, match.end)) return null;
    return { start: atIndex, ...match };
  }

  function parseMentions(content, teamData) {
    const ctx = buildMentionContext(teamData);
    const text = String(content ?? '');
    const mentions = [];
    let i = 0;
    while (i < text.length) {
      if (text[i] !== '@') {
        i += 1;
        continue;
      }
      const m = findMentionAt(text, i, ctx);
      if (m) {
        mentions.push(m);
        i = m.end;
      } else {
        i += 1;
      }
    }
    return mentions;
  }

  function messageMentionsUserId(content, userId, teamData) {
    if (!userId || !content) return false;
    const id = String(userId);
    return parseMentions(content, teamData).some((m) => m.type === 'user' && String(m.userId) === id);
  }

  function formatMessageContentHtml(content, teamData, esc) {
    const escFn = esc || global.escHtml || ((s) => String(s));
    const text = applyTextEmojis(String(content ?? ''));
    if (!teamData) {
      return escFn(text).replace(/\n/g, '<br>');
    }

    const ctx = buildMentionContext(teamData);
    const parts = [];
    let cursor = 0;
    let i = 0;
    while (i < text.length) {
      if (text[i] !== '@') {
        i += 1;
        continue;
      }
      const m = findMentionAt(text, i, ctx);
      if (!m) {
        i += 1;
        continue;
      }
      if (m.start > cursor) {
        parts.push(escFn(text.slice(cursor, m.start)));
      }
      const tokenEsc = escFn(m.token);
      if (m.type === 'user') {
        parts.push(`<span class="mention-user" data-mention-user-id="${escFn(m.userId)}">@${tokenEsc}</span>`);
      } else {
        const roleType = m.type === 'role' ? 'role' : 'perm-role';
        const roleId = m.roleId || m.permKey || '';
        const color = escFn(m.color || '#4f6ef7');
        const memberIds = (m.members || []).map((mb) => mb.id).join(',');
        parts.push(
          `<span class="mention-role" data-mention-type="${roleType}" data-mention-role-id="${escFn(roleId)}" data-mention-members="${escFn(memberIds)}" style="color:${color}" tabindex="0">@${tokenEsc}</span>`
        );
      }
      cursor = m.end;
      i = m.end;
    }
    if (cursor < text.length) {
      parts.push(escFn(text.slice(cursor)));
    }
    const html = parts.length ? parts.join('') : escFn(text);
    return html.replace(/\n/g, '<br>');
  }

  function buildMentionSuggestions(teamData, query) {
    const q = String(query || '').trim().toLowerCase();
    const items = [];
    const members = teamData?.members || [];

    for (const m of members) {
      const username = m.username || '';
      const email = m.email || '';
      const hay = `${username} ${email}`.toLowerCase();
      if (!q || hay.includes(q)) {
        items.push({
          type: 'user',
          key: `user:${m.id}:name`,
          label: username,
          sub: email,
          insert: `@${username}`,
          user: m,
        });
        if (email) {
          items.push({
            type: 'user',
            key: `user:${m.id}:email`,
            label: email,
            sub: username,
            insert: `@${email}`,
            user: m,
          });
        }
      }
    }

    for (const r of teamData?.roles || []) {
      const name = r.name || '';
      if (!q || name.toLowerCase().includes(q)) {
        const count = members.filter((mb) => String(mb.custom_role_id) === String(r.id)).length;
        items.push({
          type: 'role',
          key: `role:${r.id}`,
          label: name,
          sub: `${count} member${count === 1 ? '' : 's'}`,
          insert: `@${name}`,
          color: r.color_hex,
          role: r,
        });
      }
    }

    const permLabels = [
      { key: 'owner', label: 'owner', color: '#f59e0b' },
      { key: 'admin', label: 'admin', color: '#4f6ef7' },
      { key: 'member', label: 'member', color: '#9ca3af' },
    ];
    for (const pr of permLabels) {
      const count = members.filter((mb) => mb.role === pr.key).length;
      if (!count) continue;
      if (!q || pr.label.includes(q)) {
        items.push({
          type: 'perm-role',
          key: `perm:${pr.key}`,
          label: pr.label,
          sub: `${count} member${count === 1 ? '' : 's'}`,
          insert: `@${pr.label}`,
          color: pr.color,
        });
      }
    }

    return items.slice(0, 12);
  }

  global.MessageFormat = {
    applyTextEmojis,
    buildMentionContext,
    parseMentions,
    messageMentionsUserId,
    formatMessageContentHtml,
    buildMentionSuggestions,
  };
})(typeof window !== 'undefined' ? window : globalThis);
