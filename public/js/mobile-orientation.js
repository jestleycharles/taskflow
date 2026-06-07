(function () {
  var mobileMq = window.TF_VIEWPORT
    ? TF_VIEWPORT.MOBILE_MQ
    : '(max-width: 767px), (max-height: 767px)';
  if (!window.matchMedia(mobileMq).matches) return;

  function lockPortrait() {
    var o = screen.orientation;
    if (o && typeof o.lock === 'function') {
      o.lock('portrait-primary').catch(function () {});
    }
  }

  lockPortrait();
  window.addEventListener('orientationchange', lockPortrait);
})();
