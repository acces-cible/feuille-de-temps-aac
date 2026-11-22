(function(){
  'use strict';

  // ── 1. Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/sw.js')
        .then(function(reg) { console.log('[PWA] SW enregistré:', reg.scope); })
        .catch(function(err) { console.warn('[PWA] SW non enregistré:', err.message); });
    });
  }

  // ── 2. Version
  var _loadedVersion = null;

  function fetchVersion() {
    return fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(d) { return d ? (d.version || null) : null; })
      .catch(function() { return null; });
  }

  function initVersion() {
    return fetchVersion().then(function(v) {
      _loadedVersion = v;
      var el = document.getElementById('pwa-version');
      if (el) el.textContent = v ? 'Version ' + v : 'Version ?';
    });
  }

  function checkUpdate() {
    if (!_loadedVersion) return;
    fetchVersion().then(function(v) {
      if (!v || v === _loadedVersion) return;
      var banner = document.getElementById('update-banner');
      var msg    = document.getElementById('update-msg');
      if (banner && msg) {
        msg.textContent = 'Nouvelle version disponible (' + v + ')';
        banner.hidden = false;
      }
    });
  }

  window.doUpdate = function() {
    var p = ('serviceWorker' in navigator)
      ? navigator.serviceWorker.getRegistration()
          .then(function(reg) { if (reg) return reg.update(); })
          .catch(function() {})
      : Promise.resolve();

    p.then(function() { return caches.keys(); })
     .then(function(keys) { return Promise.all(keys.map(function(k) { return caches.delete(k); })); })
     .catch(function() {})
     .then(function() { location.reload(); });
  };

  // ── 3. Installation
  var _installEvent = null;

  function isInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function showInstallDialog(msg) {
    var prev = document.getElementById('pwa-install-dialog');
    if (prev) prev.remove();

    var overlay = document.createElement('div');
    overlay.id = 'pwa-install-dialog';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.55);backdrop-filter:blur(3px);display:flex;align-items:flex-end;justify-content:center;padding:16px;box-sizing:border-box;';
    overlay.innerHTML =
      '<div style="background:white;border-radius:16px;padding:24px;width:100%;max-width:400px;box-shadow:0 -4px 32px rgba(0,0,0,.2);">'
      + '<div style="font-size:17px;font-weight:600;color:#1e293b;margin-bottom:12px;">📲 Installer l\'application</div>'
      + '<div style="font-size:15px;color:#334155;line-height:1.7;margin-bottom:20px;white-space:pre-line;">' + esc(msg) + '</div>'
      + '<button onclick="document.getElementById(\'pwa-install-dialog\').remove()" '
      + 'style="width:100%;background:#1e3a5f;color:white;border:none;border-radius:10px;padding:14px;font-size:16px;font-weight:600;cursor:pointer;min-height:48px;">Fermer</button>'
      + '</div>';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  function getInstallMessage() {
    var ua = navigator.userAgent || '';
    // Navigateur intégré Messenger / Facebook / Instagram
    if (/FBAN|FBAV|FB_IAB|Messenger|Instagram/.test(ua)) {
      return 'Ouvre d\'abord le site dans ton navigateur :\ntouche les 3 points ⋯ en haut à droite,\npuis « Ouvrir dans le navigateur » (Chrome ou Safari).\nReviens ensuite sur ce bouton.';
    }
    // iPhone / iPad (iPadOS peut se présenter comme Mac avec écran tactile)
    var isIOS = /iPhone|iPad/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 0);
    if (isIOS) {
      return 'Avec Safari :\n1) Touche Partager (le carré avec une flèche ↑),\n2) « Sur l\'écran d\'accueil »,\n3) « Ajouter ».';
    }
    // Android / autres
    return 'Touche les 3 points ⋮\n→ « Installer l\'application »\n  (ou « Ajouter à l\'écran d\'accueil »)\n→ « Installer ».';
  }

  window.pwaInstall = function() {
    if (_installEvent) {
      _installEvent.prompt();
      _installEvent.userChoice.then(function(result) {
        if (result.outcome === 'accepted') {
          var btn = document.getElementById('pwa-install-btn');
          if (btn) btn.style.display = 'none';
        }
        _installEvent = null;
      });
      return;
    }
    showInstallDialog(getInstallMessage());
  };

  function updateInstallButton() {
    var btn = document.getElementById('pwa-install-btn');
    if (!btn) return;
    btn.style.display = isInstalled() ? 'none' : '';
  }

  window.addEventListener('beforeinstallprompt', function(e) {
    // Ne PAS appeler preventDefault — Chrome affiche sa barre d'installation automatiquement
    _installEvent = e;
    updateInstallButton();
  });

  window.addEventListener('appinstalled', function() {
    var btn = document.getElementById('pwa-install-btn');
    if (btn) btn.style.display = 'none';
    var banner = document.getElementById('update-banner');
    var msg    = document.getElementById('update-msg');
    if (banner && msg) {
      msg.textContent = '✅ Application installée avec succès !';
      banner.hidden = false;
      setTimeout(function() { banner.hidden = true; }, 5000);
    }
  });

  // ── 4. Init
  document.addEventListener('DOMContentLoaded', function() {
    updateInstallButton();
    initVersion();
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') checkUpdate();
    });
    setInterval(checkUpdate, 10 * 60 * 1000);
  });
})();
