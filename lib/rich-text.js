/**
 * Allowlisted HTML sanitization for roadmap post captions.
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike',
  'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a',
]);

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeHref(href) {
  const value = String(href || '').trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:')) return null;
  if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value) || value.startsWith('/')) {
    return value.replace(/"/g, '%22');
  }
  if (!value.includes(':')) return `https://${value.replace(/"/g, '%22')}`;
  return null;
}

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Strip disallowed tags/attrs; keep allowlisted structure. */
function sanitizeRichTextHtml(html) {
  const input = String(html || '').trim();
  if (!input) return '';

  let out = input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  out = out.replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (match, tag, attrs) => {
    const t = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(t)) return '';
    const closing = match.startsWith('</');
    if (closing) return `</${t}>`;
    if (t === 'br') return '<br>';
    if (t === 'a') {
      const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = sanitizeHref(hrefMatch ? (hrefMatch[1] || hrefMatch[2] || hrefMatch[3]) : '');
      if (!href) return '';
      return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">`;
    }
    return `<${t}>`;
  });

  out = out.trim();
  if (!out && input) return `<p>${escapeAttr(stripHtml(input))}</p>`;
  return out;
}

module.exports = {
  ALLOWED_TAGS,
  stripHtml,
  sanitizeRichTextHtml,
};
