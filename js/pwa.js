/* ── PWA — Feuille de Temps Accès-Cible ─────────────────────────── */
(function () {
  'use strict';

  var deferredPrompt = null;
  var installBtn;

  // ── 1. Capturer beforeinstallprompt EN PREMIER
  //    (l'inline <head> le capture aussi, on récupère les deux)
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.hidden = false;
  });

  // ── 2. Helpers UI
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
        || window.navigator.standalone === true;
  }

  function refreshBtn() {
    if (installBtn) installBtn.hidden = isStandalone();
  }

  // ── 3. Dialogue d'explication (iOS / FB / autres sans prompt)
  var _lastFocus = null;

  function closeModal() {
    var o = document.getElementById('pwa-overlay');
    if (o) o.remove();
    document.removeEventListener('keydown', _onKey);
    if (_lastFocus && _lastFocus.focus) _lastFocus.focus();
  }

  function _onKey(e) {
    if (e.key === 'Escape') closeModal();
  }

  function openModal(title, blocks) {
    closeModal();
    _lastFocus = document.activeElement;

    var overlay = document.createElement('div');
    overlay.id = 'pwa-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.55);backdrop-filter:blur(3px);display:flex;align-items:flex-end;justify-content:center;padding:16px;box-sizing:border-box';

    var card = document.createElement('div');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.style.cssText = 'background:white;border-radius:16px;padding:24px;width:100%;max-width:400px;box-shadow:0 -4px 32px rgba(0,0,0,.2)';

    var h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = 'font-size:17px;font-weight:600;color:#1e293b;margin-bottom:12px';
    card.appendChild(h);

    blocks.forEach(function (b) {
      if (Array.isArray(b)) {
        var ol = document.createElement('ol');
        ol.style.cssText = 'margin:0 0 14px;padding-left:24px';
        b.forEach(function (line) {
          var li = document.createElement('li');
          li.textContent = line;
          li.style.cssText = 'font-size:15px;color:#334155;line-height:1.6;margin-bottom:4px';
          ol.appendChild(li);
        });
        card.appendChild(ol);
      } else {
        var p = document.createElement('div');
        p.textContent = b;
        p.style.cssText = 'font-size:15px;color:#334155;line-height:1.7;margin-bottom:12px;white-space:pre-line';
        card.appendChild(p);
      }
    });

    var ok = document.createElement('button');
    ok.textContent = 'J\'ai compris';
    ok.style.cssText = 'width:100%;background:#1e3a5f;color:white;border:none;border-radius:10px;padding:14px;font-size:16px;font-weight:600;cursor:pointer;min-height:48px;margin-top:4px';
    ok.addEventListener('click', closeModal);
    card.appendChild(ok);

    overlay.appendChild(card);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', _onKey);
    document.body.appendChild(overlay);
    ok.focus();
  }

  function detectDevice() {
    var ua = navigator.userAgent || '';
    if (/FBAN|FBAV|FB_IAB|Messenger|Instagram/i.test(ua)) return 'inapp';
    var isIos = /iPhone|iPad|iPod/i.test(ua)
             || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return isIos ? 'ios' : 'other';
  }

  // ── 4. Clic bouton install
  function onInstallClick() {
    // Récupérer aussi depuis l'inline <head> si disponible
    if (!deferredPrompt && window.__pwa) deferredPrompt = window.__pwa;

    if (deferredPrompt) {
      var p = deferredPrompt;
      deferredPrompt = null;
      window.__pwa = null;
      p.prompt();
      if (p.userChoice) {
        p.userChoice.then(function () { refreshBtn(); }).catch(function () {});
      }
      return;
    }

    var device = detectDevice();
    if (device === 'inapp') {
      openModal('📲 Installer l\'application', [
        'Ouvre ce lien dans ton navigateur (Chrome ou Safari) :\ntouche les 3 points en haut à droite,\npuis « Ouvrir dans le navigateur ».\nReviens ensuite sur ce bouton.'
      ]);
    } else if (device === 'ios') {
      openModal('📲 Installer l\'application', [
        'Avec Safari :',
        [
          'Touche Partager (le carré avec une flèche vers le haut).',
          'Touche « Sur l\'écran d\'accueil ».',
          'Touche « Ajouter ».'
        ]
      ]);
    } else {
      openModal('📲 Installer l\'application', [
        'Touche les 3 points ⋮\n→ « Installer l\'application » (ou « Ajouter à l\'écran d\'accueil »)\n→ « Installer ».'
      ]);
    }
  }

  // ── 5. appinstalled
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    if (installBtn) installBtn.hidden = true;
    openModal('✅ Installée !', ['L\'application est installée. Tu la trouveras sur ton écran d\'accueil.']);
  });

  // ── 6. Vérification mise à jour
  var _loadedVersion = null;

  function _fetchVer() {
    return fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d ? (d.version || null) : null; })
      .catch(function () { return null; });
  }

  function _checkUpdate() {
    if (!_loadedVersion) return;
    _fetchVer().then(function (v) {
      if (!v || v === _loadedVersion) return;
      var banner = document.getElementById('update-banner');
      var msg    = document.getElementById('update-msg');
      if (banner && msg) {
        msg.textContent = 'Nouvelle version disponible (' + v + ')';
        banner.hidden = false;
      }
    });
  }

  window.doUpdate = function () {
    var p = ('serviceWorker' in navigator)
      ? navigator.serviceWorker.getRegistration()
          .then(function (r) { if (r) return r.update(); })
          .catch(function () {})
      : Promise.resolve();
    p.then(function () { return caches.keys(); })
     .then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })
     .catch(function () {})
     .then(function () { location.reload(); });
  };

  // ── 7. Init
  function init() {
    installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
      installBtn.hidden = isStandalone();
      installBtn.addEventListener('click', onInstallClick);
    }

    // Récupérer l'event capturé par l'inline <head> si pwa.js n'était pas encore parsé
    if (window.__pwa && !deferredPrompt) {
      deferredPrompt = window.__pwa;
      if (installBtn) installBtn.hidden = false;
    }

    if (window.matchMedia) {
      var mq = window.matchMedia('(display-mode: standalone)');
      if (mq.addEventListener) mq.addEventListener('change', refreshBtn);
    }

    _fetchVer().then(function (v) { _loadedVersion = v; });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') _checkUpdate();
    });
    setInterval(_checkUpdate, 10 * 60 * 1000);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(function (r) { console.log('[PWA] SW:', r.scope); })
        .catch(function (err) { console.warn('[PWA] SW:', err.message); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
