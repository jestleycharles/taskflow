(function () {
  let deferredPrompt = null;

  function isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function isIosSafari() {
    if (!isIos()) return false;
    const ua = navigator.userAgent;
    return !/crios|fxios|edgios/i.test(ua);
  }

  function getInstallButtons() {
    return Array.from(document.querySelectorAll('[data-pwa-install]'));
  }

  function setButtonsVisible(visible) {
    getInstallButtons().forEach((btn) => {
      btn.classList.toggle('hidden', !visible);
    });
  }

  function ensureIosModal() {
    if (document.getElementById('pwaIosModal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'pwaIosModal';
    overlay.className = 'hidden fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/60';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'pwaIosModalTitle');
    overlay.innerHTML = `
      <div class="w-full max-w-sm bg-ink-800 border border-white/10 rounded-2xl p-6 shadow-xl">
        <h2 id="pwaIosModalTitle" class="text-white font-semibold text-lg mb-2">Install TaskFlow</h2>
        <p class="text-gray-400 text-sm mb-4">Add TaskFlow to your home screen for quick access.</p>
        <ol class="text-gray-300 text-sm space-y-2 mb-6 list-decimal list-inside">
          <li>Tap the <strong class="text-white">Share</strong> button <span class="text-gray-500">(square with arrow)</span></li>
          <li>Choose <strong class="text-white">Add to Home Screen</strong></li>
          <li>Tap <strong class="text-white">Add</strong></li>
        </ol>
        <button type="button" id="pwaIosModalClose" class="w-full bg-brand-500 hover:bg-brand-600 text-white font-medium py-2.5 rounded-xl transition text-sm">
          Got it
        </button>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hideIosModal();
    });
    overlay.querySelector('#pwaIosModalClose').addEventListener('click', hideIosModal);
  }

  function showIosModal() {
    ensureIosModal();
    document.getElementById('pwaIosModal').classList.remove('hidden');
  }

  function hideIosModal() {
    const modal = document.getElementById('pwaIosModal');
    if (modal) modal.classList.add('hidden');
  }

  async function onInstallClick() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      setButtonsVisible(false);
      return;
    }
    if (isIosSafari()) {
      showIosModal();
    }
  }

  function updateInstallVisibility() {
    if (isStandalone()) {
      setButtonsVisible(false);
      return;
    }
    if (deferredPrompt) {
      setButtonsVisible(true);
      return;
    }
    if (isIosSafari()) {
      setButtonsVisible(true);
      return;
    }
    setButtonsVisible(false);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  function bindButtons() {
    getInstallButtons().forEach((btn) => {
      btn.addEventListener('click', onInstallClick);
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    updateInstallVisibility();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    setButtonsVisible(false);
  });

  document.addEventListener('DOMContentLoaded', () => {
    registerServiceWorker();
    ensureIosModal();
    bindButtons();
    updateInstallVisibility();
  });
})();
