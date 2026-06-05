(function () {
  var MOBILE_MQ = '(max-width: 767px), (max-height: 767px)';
  var DESKTOP_MQ = '(min-width: 768px) and (min-height: 768px)';

  window.TF_VIEWPORT = {
    MOBILE_MQ: MOBILE_MQ,
    DESKTOP_MQ: DESKTOP_MQ,
    TAILWIND_SCREENS: {
      sm: { raw: '((min-width: 640px) and (min-height: 640px))' },
      md: { raw: '((min-width: 768px) and (min-height: 768px))' },
      lg: { raw: '((min-width: 1024px) and (min-height: 768px))' },
      xl: { raw: '((min-width: 1280px) and (min-height: 768px))' },
      '2xl': { raw: '((min-width: 1536px) and (min-height: 768px))' },
    },
    isMobile: function () {
      return window.matchMedia(MOBILE_MQ).matches;
    },
    isDesktop: function () {
      return window.matchMedia(DESKTOP_MQ).matches;
    },
  };
})();
