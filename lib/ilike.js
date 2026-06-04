/** Escape user input for PostgREST `ilike` patterns (% and _ are wildcards). */
function escapeIlikePattern(term) {
  return String(term || '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

/** Quote a filter value so commas and reserved chars are safe in `.or()` lists. */
function quotePostgrestValue(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function ilikePattern(term) {
  return `%${escapeIlikePattern(term)}%`;
}

module.exports = { escapeIlikePattern, quotePostgrestValue, ilikePattern };
