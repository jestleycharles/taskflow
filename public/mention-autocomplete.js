/**
 * @mention autocomplete for text inputs (team chat & task comments).
 * Expects MessageFormat.buildMentionSuggestions and escHtml.
 */
(function (global) {
  const instances = new WeakMap();

  function createDropdown() {
    const el = document.createElement('div');
    el.className = 'mention-autocomplete hidden rounded-xl bg-ink-700 border border-white/15 shadow-lg overflow-hidden max-h-48 overflow-y-auto';
    el.setAttribute('role', 'listbox');
    document.body.appendChild(el);
    return el;
  }

  function positionDropdown(dropdown, input) {
    const rect = input.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.left = `${Math.max(8, rect.left)}px`;
    dropdown.style.width = `${Math.min(280, Math.max(rect.width, 220))}px`;
    dropdown.style.zIndex = '210';
    const maxH = 192;
    const below = rect.bottom + 4;
    const above = rect.top - maxH - 4;
    if (below + maxH > window.innerHeight - 8 && above > 8) {
      dropdown.style.top = `${above}px`;
    } else {
      dropdown.style.top = `${below}px`;
    }
  }

  function getMentionQuery(value, caret) {
    const before = value.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at === -1) return null;
    const between = before.slice(at + 1);
    if (/\s/.test(between)) return null;
    return { at, query: between };
  }

  class MentionAutocomplete {
    constructor(input, getTeamData) {
      this.input = input;
      this.getTeamData = getTeamData;
      this.dropdown = createDropdown();
      this.activeIndex = 0;
      this.items = [];
      this.open = false;
      this.onInput = this.onInput.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
      this.onBlur = this.onBlur.bind(this);
      this.onDropdownClick = this.onDropdownClick.bind(this);
      input.addEventListener('input', this.onInput);
      input.addEventListener('keydown', this.onKeyDown, true);
      input.addEventListener('blur', this.onBlur);
      this.dropdown.addEventListener('mousedown', this.onDropdownClick);
    }

    destroy() {
      this.input.removeEventListener('input', this.onInput);
      this.input.removeEventListener('keydown', this.onKeyDown);
      this.input.removeEventListener('blur', this.onBlur);
      this.dropdown.remove();
    }

    hide() {
      this.open = false;
      this.items = [];
      this.dropdown.classList.add('hidden');
      this.dropdown.innerHTML = '';
    }

    renderItems() {
      const esc = global.escHtml || ((s) => String(s));
      if (!this.items.length) {
        this.dropdown.innerHTML = '<p class="text-xs text-gray-500 px-3 py-2">No matches</p>';
        return;
      }
      this.dropdown.innerHTML = this.items.map((item, idx) => {
        const active = idx === this.activeIndex ? ' mention-autocomplete-item-active' : '';
        const badge = item.type === 'user' ? 'User' : item.type === 'role' ? 'Role' : 'Role';
        const colorDot = item.color
          ? `<span class="w-2 h-2 rounded-full shrink-0" style="background:${esc(item.color)}"></span>`
          : '';
        const avatar = item.type === 'user' && item.user && global.userAvatarHtml
          ? global.userAvatarHtml(item.user, 'w-7 h-7')
          : `<span class="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs text-gray-400 shrink-0">${item.type === 'user' ? '@' : '#'}</span>`;
        return `<button type="button" class="mention-autocomplete-item w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/10 transition${active}" data-idx="${idx}" role="option">
          ${avatar}
          <span class="flex-1 min-w-0">
            <span class="block text-sm text-white truncate">${esc(item.label)}</span>
            <span class="block text-xs text-gray-500 truncate">${esc(item.sub || '')}</span>
          </span>
          <span class="flex items-center gap-1 shrink-0 text-[10px] uppercase tracking-wide text-gray-500">${colorDot}${badge}</span>
        </button>`;
      }).join('');
    }

    show(query) {
      const teamData = this.getTeamData?.();
      if (!teamData || !global.MessageFormat) {
        this.hide();
        return;
      }
      this.items = global.MessageFormat.buildMentionSuggestions(teamData, query);
      this.activeIndex = 0;
      if (!this.items.length && query) {
        this.hide();
        return;
      }
      this.open = true;
      this.renderItems();
      positionDropdown(this.dropdown, this.input);
      this.dropdown.classList.remove('hidden');
    }

    onInput() {
      const caret = this.input.selectionStart ?? this.input.value.length;
      const mq = getMentionQuery(this.input.value, caret);
      if (!mq) {
        this.hide();
        return;
      }
      this.show(mq.query);
    }

    insertItem(item) {
      const value = this.input.value;
      const caret = this.input.selectionStart ?? value.length;
      const mq = getMentionQuery(value, caret);
      if (!mq) return;
      const before = value.slice(0, mq.at);
      const after = value.slice(caret);
      const insert = item.insert + ' ';
      this.input.value = before + insert + after;
      const pos = before.length + insert.length;
      this.input.setSelectionRange(pos, pos);
      this.input.focus();
      this.hide();
      this.input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    onDropdownClick(e) {
      e.preventDefault();
      const btn = e.target.closest('[data-idx]');
      if (!btn) return;
      const idx = Number(btn.dataset.idx);
      if (this.items[idx]) this.insertItem(this.items[idx]);
    }

    onKeyDown(e) {
      if (!this.open || !this.items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.activeIndex = (this.activeIndex + 1) % this.items.length;
        this.renderItems();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.activeIndex = (this.activeIndex - 1 + this.items.length) % this.items.length;
        this.renderItems();
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.insertItem(this.items[this.activeIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.hide();
      }
    }

    onBlur() {
      setTimeout(() => this.hide(), 150);
    }
  }

  function attachMentionAutocomplete(input, getTeamData) {
    if (!input) return null;
    if (instances.has(input)) return instances.get(input);
    const inst = new MentionAutocomplete(input, getTeamData);
    instances.set(input, inst);
    return inst;
  }

  global.MentionAutocomplete = { attach: attachMentionAutocomplete };
})(typeof window !== 'undefined' ? window : globalThis);
