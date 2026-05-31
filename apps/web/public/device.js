/* Genesis Reserve · Helix Suite · Device Detection
   Include as first script on every suite page.
   Sets document root classes before paint + exports window.DEVICE */
(function () {
  var ua  = navigator.userAgent;
  var w   = window.innerWidth;
  var h   = window.innerHeight;

  function calc() {
    w = window.innerWidth;
    h = window.innerHeight;
    return {
      isMobile:  /iPhone|Android|Mobile|BlackBerry|IEMobile|Windows Phone/i.test(ua) || w < 768,
      isTablet:  !(/iPhone|Android|Mobile|BlackBerry|IEMobile/i.test(ua)) && w >= 768 && w < 1100,
      isDesktop: !(/iPhone|Android|Mobile|BlackBerry|IEMobile/i.test(ua)) && w >= 1100,
      isTouch:   'ontouchstart' in window || navigator.maxTouchPoints > 0,
      isPWA:     window.matchMedia('(display-mode: standalone)').matches || !!window.navigator.standalone,
      isIframe:  window !== window.top,
      isIOS:     /iPhone|iPad/i.test(ua),
      isAndroid: /Android/i.test(ua),
      width: w, height: h,
    };
  }

  var d    = calc();
  var root = document.documentElement;

  function applyClasses(d) {
    root.classList.toggle('is-mobile',  d.isMobile);
    root.classList.toggle('is-tablet',  d.isTablet);
    root.classList.toggle('is-desktop', d.isDesktop);
    root.classList.toggle('is-touch',   d.isTouch);
    root.classList.toggle('is-pwa',     d.isPWA);
    root.classList.toggle('is-iframe',  d.isIframe);
    root.classList.toggle('is-ios',     d.isIOS);
    root.classList.toggle('is-android', d.isAndroid);
    /* Data attr on html for CSS targeting */
    root.setAttribute('data-device', d.isMobile ? 'mobile' : d.isTablet ? 'tablet' : 'desktop');
  }

  applyClasses(d);

  d.refresh = function () {
    var n = calc();
    Object.assign(d, n);
    applyClasses(d);
    if (window.DEVICE_onChange) window.DEVICE_onChange(d);
  };

  window.DEVICE = d;

  window.addEventListener('resize',            function () { window.DEVICE.refresh(); });
  window.addEventListener('orientationchange', function () { setTimeout(window.DEVICE.refresh, 120); });
})();
