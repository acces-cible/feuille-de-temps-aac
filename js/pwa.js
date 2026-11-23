/* ── PWA — Feuille de Temps Accès-Cible ─────────────────────────── */
(function () {
  "use strict";

  var deferredPrompt = null;
  var installBtn;
  var _log = [];
  var _pressTimer = null;
  var _longPressed = false;

  function log(msg) {
    var t = new Date().toLocaleTimeString('fr-CA');
    _log.push('[' + t + '] ' + msg);
    console.log('[PWA] ' + msg);
  }

  /* ── 1. Capturer beforeinstallprompt ────────────────────────────── */
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    log('beforeinstallprompt RECU ✅');
    if (installBtn) installBtn.hidden = false;
  });

  log('Listener beforeinstallprompt enregistre');

  /* ── 2. Styles ──────────────────────────────────────────────────── */
  var CSS =
    "#pwa-bar{position:fixed;bottom:0;left:0;right:0;z-index:31;" +
    "background:white;border-top:1px solid #e2e8f0;" +
    "display:flex;align-items:center;justify-content:center;" +
    "gap:10px;padding:5px 12px;min-height:60px;flex-wrap:wrap}" +
    "#pwa-bar[hidden]{display:none !important}" +
    "@supports(padding-bottom:env(safe-area-inset-bottom)){" +
    "#pwa-bar{padding-bottom:calc(5px + env(safe-area-inset-bottom));min-height:calc(60px + env(safe-area-inset-bottom))}}" +
    "@media(prefers-color-scheme:dark){#pwa-bar{background:#1e293b;border-top-color:#334155}}" +
    "#pwa-install-btn{min-height:48px;padding:8px 20px;border:0;border-radius:8px;" +
    "background:#1e3a5f;color:#ffffff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}" +
    "#pwa-install-btn[hidden]{display:none !important}" +
    "#pwa-install-btn:hover{opacity:.85}" +
    ".pwa-overlay{position:fixed;inset:0;z-index:10000;" +
    "background:rgba(0,0,0,.55);backdrop-filter:blur(3px);" +
    "display:flex;align-items:flex-end;justify-content:center;" +
    "padding:16px;box-sizing:border-box}" +
    ".pwa-card{width:100%;max-width:400px;" +
    "background:white;border-radius:16px;padding:24px;" +
    "box-shadow:0 -4px 32px rgba(0,0,0,.2);max-height:80vh;overflow-y:auto}" +
    ".pwa-card-title{font-size:17px;font-weight:600;color:#1e293b;margin-bottom:12px}" +
    ".pwa-card-body{font-size:15px;color:#334155;line-height:1.7;margin-bottom:12px;white-space:pre-line}" +
    ".pwa-card ol{margin:4px 0 16px;padding-left:24px}" +
    ".pwa-card li{font-size:15px;color:#334155;line-height:1.6;margin-bottom:4px}" +
    ".pwa-card-ok{width:100%;background:#1e3a5f;color:white;border:none;" +
    "border-radius:10px;padding:14px;font-size:16px;font-weight:600;" +
    "cursor:pointer;min-height:48px;font-family:inherit}" +
    ".pwa-dbg{font-family:monospace;font-size:12px;background:#f1f5f9;border-radius:8px;" +
    "padding:10px;margin-bottom:12px;color:#334155;white-space:pre-wrap;max-height:200px;overflow-y:auto}";

  /* ── 3. DOM helpers ─────────────────────────────────────────────── */
  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (text != null) node.textContent = text;
    return node;
  }

  /* ── 4. Build UI ────────────────────────────────────────────────── */
  function buildUi() {
    var style = el("style", { id: "pwa-css" });
    style.textContent = CSS;
    document.head.appendChild(style);

    var bar = document.getElementById("pwa-bar");
    if (!bar) return;

    installBtn = el("button", { id: "pwa-install-btn", type: "button", hidden: "" }, "📲 Installer l'application");
    bar.appendChild(installBtn);
    installBtn.addEventListener("click", onInstallClick);
    // Appui long (2s) → diagnostic
    installBtn.addEventListener("touchstart", function () {
      _longPressed = false;
      _pressTimer = setTimeout(function () {
        _pressTimer = null;
        _longPressed = true;
        showDebug();
      }, 2000);
    }, { passive: true });
    installBtn.addEventListener("touchend", function () {
      if (_pressTimer) { clearTimeout(_pressTimer); _pressTimer = null; }
    });
    installBtn.addEventListener("touchmove", function () {
      if (_pressTimer) { clearTimeout(_pressTimer); _pressTimer = null; }
    });
  }

  /* ── 5. Visibilité ──────────────────────────────────────────────── */
  function isStandalone() {
    return (
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true
    );
  }

  function refreshBtn() {
    var bar = document.getElementById("pwa-bar");
    var installed = isStandalone();
    if (installBtn) installBtn.hidden = installed;
    if (bar) bar.hidden = installed;
    document.body.classList.toggle("pwa-bar-visible", !installed);
  }

  /* ── 6. Panneau debug ───────────────────────────────────────────── */
  async function showDebug() {
    var reg = null;
    try { reg = await navigator.serviceWorker.getRegistration(); } catch(e) {}

    var info = [
      'UA: ' + navigator.userAgent,
      '',
      'deferredPrompt (pwa.js): ' + (deferredPrompt ? 'OUI ✅' : 'NON ❌'),
      'window.__pwa (head): ' + (window.__pwa ? 'OUI ✅' : 'NON ❌'),
      'isStandalone: ' + isStandalone(),
      'display-mode: ' + (window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser'),
      '',
      'SW: ' + (reg ? (reg.active ? 'actif (' + (reg.active.scriptURL || '') + ')' : 'pas actif') : 'non enregistré'),
      '',
      'Log:',
    ].concat(_log).join('\n');

    openModal('🔍 Diagnostic PWA', [info], true);
  }

  /* ── 7. Modal ───────────────────────────────────────────────────── */
  var lastFocus = null;
  function closeModal() {
    var o = document.getElementById("pwa-overlay");
    if (o) o.remove();
    document.removeEventListener("keydown", onKey);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e) { if (e.key === "Escape") closeModal(); }

  function openModal(title, blocks, isDebug) {
    closeModal();
    lastFocus = document.activeElement;
    var overlay = el("div", { id: "pwa-overlay", class: "pwa-overlay" });
    var card    = el("div", { class: "pwa-card", role: "dialog", "aria-modal": "true" });
    card.appendChild(el("div", { class: "pwa-card-title" }, title));
    blocks.forEach(function (b) {
      if (Array.isArray(b)) {
        var ol = el("ol");
        b.forEach(function (line) { ol.appendChild(el("li", null, line)); });
        card.appendChild(ol);
      } else if (isDebug) {
        var pre = el("div", { class: "pwa-dbg" }, b);
        card.appendChild(pre);
      } else {
        card.appendChild(el("div", { class: "pwa-card-body" }, b));
      }
    });
    var ok = el("button", { class: "pwa-card-ok", type: "button" }, "Fermer");
    ok.addEventListener("click", closeModal);
    card.appendChild(ok);
    overlay.appendChild(card);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    ok.focus();
  }

  /* ── 8. Clic install ────────────────────────────────────────────── */
  function detectDevice() {
    var ua = navigator.userAgent || "";
    if (/FBAN|FBAV|FB_IAB|Messenger|Instagram/i.test(ua)) return "inapp";
    var isIos = /iPhone|iPad|iPod/i.test(ua) ||
                (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return isIos ? "ios" : "other";
  }

  async function onInstallClick() {
    // Si l'appui long a déclenché le debug, ne pas ouvrir le dialogue install
    if (_longPressed) { _longPressed = false; return; }

    log('Clic bouton install. deferredPrompt=' + (deferredPrompt ? 'OUI' : 'NON'));

    // Récupérer aussi depuis l'inline <head> si deferredPrompt est vide
    if (!deferredPrompt && window.__pwa) {
      deferredPrompt = window.__pwa;
      log('Récupéré depuis window.__pwa');
    }

    if (deferredPrompt) {
      var p = deferredPrompt;
      deferredPrompt = null;
      window.__pwa = null;
      try {
        await p.prompt();
        log('prompt() appele');
        if (p.userChoice) {
          var choice = await p.userChoice;
          log('userChoice: ' + choice.outcome);
        }
      } catch (err) {
        log('Erreur prompt: ' + err.message);
      }
      return;
    }

    var device = detectDevice();
    log('Pas de prompt. device=' + device);

    if (device === "inapp") {
      openModal("📲 Installer l'application", [
        "Ouvre d'abord le site dans Chrome ou Safari :\ntouche les 3 points en haut à droite,\npuis « Ouvrir dans le navigateur ».\nReviens ensuite sur ce bouton."
      ]);
    } else if (device === "ios") {
      openModal("📲 Installer l'application", [
        "Avec Safari :",
        ["Touche Partager (le carré avec une flèche ↑).", "Touche « Sur l'écran d'accueil ».", "Touche « Ajouter »."]
      ]);
    } else {
      openModal("📲 Installer l'application", [
        "Touche les 3 points ⋮\n→ « Installer l'application »\n   (ou « Ajouter à l'écran d'accueil »)\n→ « Installer »."
      ]);
    }
  }

  /* ── 9. appinstalled ────────────────────────────────────────────── */
  window.addEventListener("appinstalled", function () {
    log('appinstalled recu');
    deferredPrompt = null;
    refreshBtn();
    openModal("✅ Installée !", ["L'application est installée. Tu la trouveras sur ton écran d'accueil."]);
  });

  /* ── 10. Mise à jour ────────────────────────────────────────────── */
  var loadedVersion = null;

  async function fetchVersion() {
    try {
      var res = await fetch("/version.json?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) return null;
      var d = await res.json();
      return d && d.version ? d.version : null;
    } catch (e) { return null; }
  }

  async function checkUpdate() {
    if (!loadedVersion) return;
    var v = await fetchVersion();
    if (!v || v === loadedVersion) return;
    var banner = document.getElementById("update-banner");
    var msg    = document.getElementById("update-msg");
    if (banner && msg) { msg.textContent = "Nouvelle version disponible (" + v + ")"; banner.hidden = false; }
  }

  window.doUpdate = function () {
    var p = ("serviceWorker" in navigator)
      ? navigator.serviceWorker.getRegistration()
          .then(function (r) { if (r) return r.update(); }).catch(function () {})
      : Promise.resolve();
    p.then(function () { return caches.keys(); })
     .then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })
     .catch(function () {})
     .then(function () { location.reload(); });
  };

  /* ── 11. Init ───────────────────────────────────────────────────── */
  function init() {
    buildUi();
    refreshBtn();
    log('Init. isStandalone=' + isStandalone());

    if (window.matchMedia) {
      var mq = window.matchMedia("(display-mode: standalone)");
      if (mq.addEventListener) mq.addEventListener("change", refreshBtn);
    }

    fetchVersion().then(function (v) { loadedVersion = v; });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") checkUpdate();
    });
    setInterval(checkUpdate, 10 * 60 * 1000);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js")
        .then(function (r) { log('SW enregistre: ' + r.scope + ' state=' + (r.active ? r.active.state : 'installing')); })
        .catch(function (e) { log('SW erreur: ' + e.message); });
    } else {
      log('SW non supporte');
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

})();
