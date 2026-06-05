(function () {
  if (!window.matchMedia('(max-width: 767px)').matches) return;

  function lockPortrait() {
    const o = screen.orientation;
    if (o && typeof o.lock === 'function') {
      o.lock('portrait-primary').catch(function () {});
    }
  }

  lockPortrait();
  window.addEventListener('orientationchange', lockPortrait);
})();
