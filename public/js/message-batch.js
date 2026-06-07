/**
 * Client-side batch display and search pagination for message lists.
 * Server spam guards are unaffected — full message arrays remain in memory.
 */
(function () {
  const BATCH_SIZE = 20;

  function createMessageBatchController(options = {}) {
    const batchSize = options.batchSize ?? BATCH_SIZE;
    const anchor = options.anchor === 'start' ? 'start' : 'end';
    let batchOffset = 0;
    let searchQuery = '';
    let searchPage = 0;
    let listEventsBound = false;

    const getSearchText = options.getSearchText || ((m) => String(m.content || ''));

    function reset() {
      batchOffset = 0;
      searchQuery = '';
      searchPage = 0;
    }

    function setSearchQuery(q) {
      searchQuery = String(q || '').trim();
      searchPage = 0;
      batchOffset = 0;
    }

    function showLatestBatch() {
      batchOffset = 0;
      searchPage = 0;
    }

    function loadOlderBatch() {
      if (searchQuery) return;
      batchOffset += 1;
    }

    function showNewerBatch() {
      if (batchOffset > 0) batchOffset -= 1;
    }

    function searchPrevPage() {
      if (searchPage > 0) searchPage -= 1;
    }

    function searchNextPage(totalPages) {
      if (searchPage < totalPages - 1) searchPage += 1;
    }

    function getSlice(messages) {
      const all = messages || [];

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matches = all.filter((m) => getSearchText(m).toLowerCase().includes(q));
        const totalPages = Math.max(1, Math.ceil(matches.length / batchSize));
        if (searchPage >= totalPages) searchPage = totalPages - 1;
        if (searchPage < 0) searchPage = 0;
        const start = searchPage * batchSize;
        return {
          messages: matches.slice(start, start + batchSize),
          mode: 'search',
          totalMatches: matches.length,
          searchPage,
          totalPages,
          hasSearchPrev: searchPage > 0,
          hasSearchNext: start + batchSize < matches.length,
          isSearching: true,
        };
      }

      const total = all.length;
      if (total === 0) {
        return {
          messages: [],
          mode: 'browse',
          hasOlder: false,
          hasNewer: false,
          isSearching: false,
        };
      }

      if (anchor === 'start') {
        const endExclusive = Math.min(total, (batchOffset + 1) * batchSize);
        const visible = all.slice(0, endExclusive);
        return {
          messages: visible,
          mode: 'browse',
          hasOlder: endExclusive < total,
          hasNewer: batchOffset > 0,
          olderCount: total - endExclusive,
          isSearching: false,
        };
      }

      const endExclusive = Math.max(0, total - batchOffset * batchSize);
      const start = Math.max(0, endExclusive - batchSize);
      const visible = all.slice(start, endExclusive);

      return {
        messages: visible,
        mode: 'browse',
        hasOlder: start > 0,
        hasNewer: batchOffset > 0,
        olderCount: start,
        isSearching: false,
      };
    }

    function olderButtonHtml(olderCount) {
      const count = Math.min(batchSize, olderCount);
      const label = count === 1 ? 'Show 1 older message' : `Show ${count} older messages`;
      return `<div class="msg-batch-nav flex justify-center py-2">
        <button type="button" data-msg-batch-older class="text-xs text-brand-500 hover:text-brand-400 font-medium px-3 py-1.5 rounded-lg hover:bg-white/5 transition">${label}</button>
      </div>`;
    }

    function olderActivityButtonHtml(olderCount) {
      const count = Math.min(batchSize, olderCount);
      const label = count === 1 ? 'Show 1 older activity' : `Show ${count} older activity`;
      return `<div class="msg-batch-nav flex justify-center py-2">
        <button type="button" data-msg-batch-older class="text-xs text-brand-500 hover:text-brand-400 font-medium px-3 py-1.5 rounded-lg hover:bg-white/5 transition">${label}</button>
      </div>`;
    }

    function newerButtonHtml() {
      return `<div class="msg-batch-nav flex justify-center py-2">
        <button type="button" data-msg-batch-newer class="text-xs text-brand-500 hover:text-brand-400 font-medium px-3 py-1.5 rounded-lg hover:bg-white/5 transition">Show newer messages</button>
      </div>`;
    }

    function newerActivityButtonHtml() {
      return `<div class="msg-batch-nav flex justify-center py-2">
        <button type="button" data-msg-batch-newer class="text-xs text-brand-500 hover:text-brand-400 font-medium px-3 py-1.5 rounded-lg hover:bg-white/5 transition">Show newer activity</button>
      </div>`;
    }

    function searchNavHtml(slice) {
      if (!slice.isSearching) return '';
      if (slice.totalMatches === 0) return '';
      const pageLabel = slice.totalPages > 1
        ? `Page ${slice.searchPage + 1} of ${slice.totalPages} · ${slice.totalMatches} match${slice.totalMatches === 1 ? '' : 'es'}`
        : `${slice.totalMatches} match${slice.totalMatches === 1 ? '' : 'es'}`;
      return `<div class="msg-batch-nav flex items-center justify-center gap-3 py-2 text-xs text-gray-500">
        <button type="button" data-msg-search-prev class="text-brand-500 hover:text-brand-400 font-medium disabled:opacity-40 disabled:pointer-events-none" ${slice.hasSearchPrev ? '' : 'disabled'}>← Prev</button>
        <span>${pageLabel}</span>
        <button type="button" data-msg-search-next class="text-brand-500 hover:text-brand-400 font-medium disabled:opacity-40 disabled:pointer-events-none" ${slice.hasSearchNext ? '' : 'disabled'}>Next →</button>
      </div>`;
    }

    function renderList(listEl, messages, renderItem, emptyHtml) {
      const slice = getSlice(messages);
      const olderBtn = anchor === 'start' ? olderActivityButtonHtml : olderButtonHtml;
      const newerBtn = anchor === 'start' ? newerActivityButtonHtml : newerButtonHtml;

      if (!messages.length && !slice.isSearching) {
        listEl.innerHTML = emptyHtml;
        return { slice, atBottom: true, scrollToTop: false, scrollToBottom: false };
      }

      if (slice.isSearching && slice.totalMatches === 0) {
        const emptySearch = options.emptySearchHtml
          || '<p class="text-sm text-gray-600 text-center py-8">No messages match your search.</p>';
        listEl.innerHTML = emptySearch;
        return { slice, atBottom: true, scrollToTop: false, scrollToBottom: false };
      }

      const parts = [];
      if (slice.mode === 'browse' && slice.hasNewer) parts.push(newerBtn());
      if (slice.mode === 'browse' && slice.hasOlder && anchor === 'end') parts.push(olderBtn(slice.olderCount));
      if (slice.mode === 'search') parts.push(searchNavHtml(slice));
      parts.push(slice.messages.map(renderItem).join(''));
      if (slice.mode === 'browse' && slice.hasOlder && anchor === 'start') parts.push(olderBtn(slice.olderCount));
      if (slice.mode === 'browse' && slice.hasNewer && anchor === 'end') parts.push(newerBtn());
      if (slice.mode === 'search' && slice.totalPages > 1) parts.push(searchNavHtml(slice));

      listEl.innerHTML = parts.join('');

      return {
        slice,
        scrollToTop: slice.mode === 'browse' && anchor === 'end' && batchOffset > 0 && !slice.isSearching,
        scrollToBottom: slice.mode === 'browse' && anchor === 'start' && batchOffset > 0 && !slice.isSearching,
      };
    }

    function bindListEvents(listEl) {
      if (!listEl || listEventsBound) return;
      listEventsBound = true;
      listEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-msg-batch-older]')) {
          e.preventDefault();
          loadOlderBatch();
          options.onBatchChange?.('older');
          return;
        }
        if (e.target.closest('[data-msg-batch-newer]')) {
          e.preventDefault();
          showNewerBatch();
          options.onBatchChange?.('newer');
          return;
        }
        if (e.target.closest('[data-msg-search-prev]')) {
          e.preventDefault();
          searchPrevPage();
          options.onBatchChange?.('search-prev');
          return;
        }
        if (e.target.closest('[data-msg-search-next]')) {
          e.preventDefault();
          const slice = getSlice(options.getMessages?.() || []);
          searchNextPage(slice.totalPages);
          options.onBatchChange?.('search-next');
        }
      });
    }

    return {
      BATCH_SIZE: batchSize,
      reset,
      setSearchQuery,
      getSearchQuery: () => searchQuery,
      showLatestBatch,
      loadOlderBatch,
      showNewerBatch,
      getSlice,
      renderList,
      bindListEvents,
      get batchOffset() { return batchOffset; },
      isAtLatest() { return batchOffset === 0 && !searchQuery; },
    };
  }

  window.MessageBatch = {
    BATCH_SIZE,
    create: createMessageBatchController,
  };
})();
