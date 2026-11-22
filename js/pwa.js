/* ── PWA — Feuille de Temps Accès-Cible ─────────────────────────── */
/* IMPORTANT : ce listener doit être posé AVANT tout le reste       */
(function () {
  'use strict';

  var _installEvent = null;

  // ── 1. Capturer beforeinstallprompt EN PREMIER ──────────────────
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();          // empêche la mini-barre Chrome — on contrôle l'UI
    _installEvent = e;
    _showBtn();
  });

  // ── 2. Service Worker ────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js')
        .then(function (r) { console.log('[PWA] SW:', r.scope); })
        .catch(function (e) { console.warn('[PWA] SW:', e.message); });
    });
  }

  // ── 3. Détection mode installé ───────────────────────────────────
  function _isInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches
        || navigator.standalone === true;
  }

  // ── 4. Bouton install ────────────────────────────────────────────
  function _showBtn() {
    var btn = document.getElementById('pwa-install-btn');
    if (!btn) return;
    btn.style.display = _isInstalled() ? 'none' : '';
  }

  // ── 5. Dialogue d'instructions (iOS / FB / fallback) ────────────
  function _instMsg() {
    var ua = navigator.userAgent || '';
    if (/FBAN|FBAV|FB_IAB|Messenger|Instagram/i.test(ua)) {
      return 'Ouvre ce lien dans ton navigateur (Chrome ou Safari) :\ntouche les 3 points, puis « Ouvrir dans le navigateur ».\nEnsuite, reviens ici et touche à nouveau « Installer l\'application ».';
    }
    var isIOS = /iPhone|iPad/i.test(ua)
             || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {
      return '1) Touche Partager (le carré avec une flèche vers le haut).\n2) Touche « Sur l\'écran d\'accueil ».\n3) Touche « Ajouter ».';
    }
    return 'Touche les 3 points ⋮\n→ « Installer l\'application »\n   (ou « Ajouter à l\'écran d\'accueil »)\n→ « Installer ».';
  }

  function _showDialog(msg) {
    var prev = document.getElementById('pwa-dlg');
    if (prev) prev.remove();
    var prevFocus = document.activeElement;

    var overlay = document.createElement('div');
    overlay.id = 'pwa-dlg';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Installer l\'application');
    overlay.className = 'no-print';
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:10000',
      'background:rgba(0,0,0,.55);backdrop-filter:blur(3px)',
      'display:flex;align-items:flex-end;justify-content:center',
      'padding:16px;box-sizing:border-box'
    ].join(';');

    var box = document.createElement('div');
    box.style.cssText = [
      'background:white;border-radius:16px;padding:24px',
      'width:100%;max-width:400px;box-shadow:0 -4px 32px rgba(0,0,0,.2)'
    ].join(';');

    var title = document.createElement('div');
    title.textContent = '📲 Installer l\'application';
    title.style.cssText = 'font-size:17px;font-weight:600;color:#1e293b;margin-bottom:12px';

    var body = document.createElement('div');
    body.textContent = msg;
    body.style.cssText = 'font-size:15px;color:#334155;line-height:1.7;margin-bottom:20px;white-space:pre-line';

    var btn = document.createElement('button');
    btn.textContent = 'J\'ai compris';
    btn.style.cssText = [
      'width:100%;background:#1e3a5f;color:white',
      'border:none;border-radius:10px;padding:14px',
      'font-size:16px;font-weight:600;cursor:pointer;min-height:48px'
    ].join(';');
    btn.addEventListener('click', close);

    function close() {
      overlay.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    }

    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    box.appendChild(title);
    box.appendChild(body);
    box.appendChild(btn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    btn.focus();
  }

  // ── 6. Clic bouton install ───────────────────────────────────────
  window.pwaInstall = function () {
    if (_installEvent) {
      _installEvent.prompt();
      _installEvent.userChoice.then(function (r) {
        if (r.outcome === 'accepted') _showBtn();
        _installEvent = null;
      });
      return;
    }
    _showDialog(_instMsg());
  };

  // ── 7. appinstalled ──────────────────────────────────────────────
  window.addEventListener('appinstalled', function () {
    _showBtn();
    var banner = document.getElementById('update-banner');
    var msg    = document.getElementById('update-msg');
    if (banner && msg) {
      msg.textContent = '✅ Application installée avec succès !';
      banner.hidden = false;
      setTimeout(function () { banner.hidden = true; }, 5000);
    }
  });

  // ── 8. Vérification mise à jour ──────────────────────────────────
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

  // ── 9. Init au chargement ────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    _showBtn();
    _fetchVer().then(function (v) { _loadedVersion = v; });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') _checkUpdate();
    });
    setInterval(_checkUpdate, 10 * 60 * 1000);
  });

})();
