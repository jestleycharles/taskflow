/**
 * Lightweight rich text editor (contenteditable + toolbar) for roadmap post captions.
 */
(function (global) {
  const ALLOWED_TAGS = new Set([
    'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike',
    'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a',
  ]);

  const ALLOWED_ATTRS = {
    a: new Set(['href', 'target', 'rel']),
  };

  const TOOLBAR_ACTIONS = [
    { cmd: 'bold', label: 'B', title: 'Bold' },
    { cmd: 'italic', label: 'I', title: 'Italic' },
    { cmd: 'underline', label: 'U', title: 'Underline' },
    { cmd: 'strikeThrough', label: 'S', title: 'Strikethrough' },
    { type: 'sep' },
    { cmd: 'formatBlock', arg: 'h2', label: 'H2', title: 'Heading 2' },
    { cmd: 'formatBlock', arg: 'h3', label: 'H3', title: 'Heading 3' },
    { type: 'sep' },
    { cmd: 'insertUnorderedList', label: '•', title: 'Bullet list' },
    { cmd: 'insertOrderedList', label: '1.', title: 'Numbered list' },
    { cmd: 'formatBlock', arg: 'blockquote', label: '❝', title: 'Quote' },
    { type: 'sep' },
    { cmd: 'createLink', label: '🔗', title: 'Link' },
    { cmd: 'unlink', label: '✕', title: 'Remove link' },
    { cmd: 'removeFormat', label: '⌫', title: 'Clear formatting' },
  ];

  const instances = new Map();

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function stripHtml(html) {
    const el = document.createElement('div');
    el.innerHTML = html;
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function sanitizeHref(href) {
    const value = String(href || '').trim();
    if (!value) return null;
    const lower = value.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('data:')) return null;
    if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value) || value.startsWith('/')) {
      return value;
    }
    if (!value.includes(':')) return `https://${value}`;
    return null;
  }

  function sanitizeHtml(html) {
    const input = String(html || '').trim();
    if (!input) return '';

    const doc = new DOMParser().parseFromString(input, 'text/html');
    const out = document.createElement('div');

    function walk(src, dest) {
      for (const node of Array.from(src.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
          dest.appendChild(document.createTextNode(node.textContent || ''));
          continue;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        const tag = node.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
          walk(node, dest);
          continue;
        }

        const el = document.createElement(tag);
        const allowed = ALLOWED_ATTRS[tag];
        if (allowed) {
          for (const attr of allowed) {
            if (!node.hasAttribute(attr)) continue;
            if (attr === 'href') {
              const safe = sanitizeHref(node.getAttribute('href'));
              if (safe) el.setAttribute('href', safe);
            } else if (attr === 'target') {
              el.setAttribute('target', '_blank');
            } else if (attr === 'rel') {
              el.setAttribute('rel', 'noopener noreferrer');
            }
          }
          if (tag === 'a' && el.hasAttribute('href')) {
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
          }
        }
        walk(node, el);
        dest.appendChild(el);
      }
    }

    walk(doc.body, out);
    let result = out.innerHTML.trim();
    if (!result && input) result = `<p>${esc(stripHtml(input))}</p>`;
    return result;
  }

  function isHtmlContent(text) {
    return /<[a-z][\s\S]*>/i.test(String(text || ''));
  }

  function renderCaptionHtml(caption) {
    const raw = String(caption || '').trim();
    if (!raw) return '';
    if (isHtmlContent(raw)) {
      return `<div class="post-caption rich-text-content text-sm text-gray-300 mt-2 leading-relaxed">${sanitizeHtml(raw)}</div>`;
    }
    return `<p class="text-sm text-gray-300 mt-2 whitespace-pre-wrap leading-relaxed">${esc(raw)}</p>`;
  }

  function runCommand(editor, cmd, arg) {
    editor.focus();
    if (cmd === 'createLink') {
      const url = global.prompt('Enter URL:');
      if (!url) return;
      const safe = sanitizeHref(url);
      if (!safe) return;
      document.execCommand('createLink', false, safe);
      return;
    }
    if (cmd === 'formatBlock' && arg) {
      document.execCommand('formatBlock', false, `<${arg}>`);
      return;
    }
    document.execCommand(cmd, false, arg || null);
  }

  function buildToolbar(toolbarEl, editor) {
    toolbarEl.className = 'rich-text-toolbar flex flex-wrap items-center gap-0.5 p-1.5 border border-white/10 border-b-0 rounded-t-xl bg-ink-800/80';
    toolbarEl.innerHTML = TOOLBAR_ACTIONS.map((action) => {
      if (action.type === 'sep') {
        return '<span class="rich-text-sep w-px h-5 bg-white/10 mx-0.5 shrink-0" aria-hidden="true"></span>';
      }
      return `<button type="button" class="rich-text-btn w-8 h-8 rounded-lg text-xs text-gray-300 hover:text-white hover:bg-white/10 transition" data-cmd="${esc(action.cmd)}"${action.arg ? ` data-arg="${esc(action.arg)}"` : ''} title="${esc(action.title)}" aria-label="${esc(action.title)}">${esc(action.label)}</button>`;
    }).join('');

    toolbarEl.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('[data-cmd]');
      if (!btn) return;
      e.preventDefault();
      runCommand(editor, btn.dataset.cmd, btn.dataset.arg || null);
    });
  }

  function syncHidden(rootId) {
    const inst = instances.get(rootId);
    if (!inst) return '';
    const html = sanitizeHtml(inst.editor.innerHTML);
    if (inst.hiddenInput) inst.hiddenInput.value = html;
    return html;
  }

  function setContent(rootId, html) {
    const inst = instances.get(rootId);
    if (!inst) return;
    const raw = String(html || '').trim();
    if (!raw) {
      inst.editor.innerHTML = '';
      if (inst.hiddenInput) inst.hiddenInput.value = '';
      return;
    }
    if (isHtmlContent(raw)) {
      inst.editor.innerHTML = sanitizeHtml(raw);
    } else {
      inst.editor.innerHTML = `<p>${esc(raw)}</p>`;
    }
    if (inst.hiddenInput) inst.hiddenInput.value = sanitizeHtml(inst.editor.innerHTML);
  }

  function getPlainTextLength(rootId) {
    const inst = instances.get(rootId);
    if (!inst) return 0;
    return stripHtml(inst.editor.innerHTML).length;
  }

  function clear(rootId) {
    setContent(rootId, '');
  }

  function mount(rootId, options = {}) {
    const root = document.getElementById(rootId);
    if (!root) return null;

    const hiddenInput = options.hiddenInputId
      ? document.getElementById(options.hiddenInputId)
      : null;
    const placeholder = options.placeholder || '';

    root.className = 'rich-text-root';
    root.innerHTML = `
      <div class="rich-text-toolbar-host"></div>
      <div class="rich-text-editor w-full bg-ink-900 border border-white/10 rounded-b-xl rounded-t-none px-4 py-2.5 text-sm text-white min-h-[120px] max-h-[280px] overflow-y-auto focus:outline-none focus:border-brand-500 transition" contenteditable="true" role="textbox" aria-multiline="true"${placeholder ? ` data-placeholder="${esc(placeholder)}"` : ''}></div>`;

    const toolbarHost = root.querySelector('.rich-text-toolbar-host');
    const editor = root.querySelector('.rich-text-editor');
    buildToolbar(toolbarHost, editor);

    editor.addEventListener('input', () => syncHidden(rootId));
    editor.addEventListener('blur', () => syncHidden(rootId));
    editor.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') || '';
      document.execCommand('insertText', false, text);
      syncHidden(rootId);
    });

    const inst = { root, editor, hiddenInput, toolbarHost };
    instances.set(rootId, inst);
    return inst;
  }

  global.RichTextEditor = {
    mount,
    setContent,
    syncHidden,
    getPlainTextLength,
    clear,
    sanitizeHtml,
    stripHtml,
    renderCaptionHtml,
    isHtmlContent,
  };
})(typeof window !== 'undefined' ? window : globalThis);
