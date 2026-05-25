/* =========================================================================
 * NyxDotSkipAdds — content.js  (monde isolé)
 *
 * Rôle :
 *  - surveille le lecteur YouTube et détecte les pubs ;
 *  - sauvegarde le timestamp de la vraie vidéo ;
 *  - applique l'astuce du point (youtube.com -> youtube.com.) ;
 *  - délègue la reprise (seek + lecture) à inject.js ;
 *  - si une pub revient malgré l'astuce, refait la manœuvre jusqu'à 5 fois,
 *    puis prévient l'utilisateur via une bannière s'il faut faire à la main.
 * ========================================================================= */
(function () {
  "use strict";

  if (!location.hostname.includes("youtube.com")) return;

  const POLL_MS          = 200;
  const RESUME_MAX_AGE_MS = 180 * 1000; // un timestamp sauvegardé expire après 3 min
  const TRICK_RESET_MS    = 5 * 60 * 1000; // compteur d'essais remis à zéro après 5 min
  const REWIND_BUFFER_S   = 1.5;        // léger retour en arrière à la reprise
  const MAX_ATTEMPTS      = 5;          // nombre d'essais avant d'avertir l'utilisateur
  const CLEAN_RESET_S     = 90;         // 90 s sans pub -> budget d'essais réinitialisé

  let enabled = true;
  let lastKnownTime = 0;       // dernier timestamp connu de la VRAIE vidéo
  let wasAdShowing = false;
  let triggering = false;
  let givenUp = false;         // budget d'essais épuisé pour cette vidéo
  let cleanPlaySeconds = 0;    // durée de lecture sans pub
  let attemptsResetDone = false;
  let sessionVideoId = "";

  /* ---- Helpers ---------------------------------------------------------- */

  function getVideoId() {
    try { return new URL(location.href).searchParams.get("v") || ""; }
    catch (e) { return ""; }
  }

  function getVideo() {
    return document.querySelector("#movie_player video")
        || document.querySelector("video.html5-main-video")
        || document.querySelector("video");
  }

  function isAdShowing() {
    const p = document.querySelector(".html5-video-player");
    if (p && (p.classList.contains("ad-showing")
           || p.classList.contains("ad-interrupting"))) return true;
    if (document.querySelector(".ytp-ad-player-overlay")) return true;
    if (document.querySelector(".ytp-ad-player-overlay-layout")) return true;
    return false;
  }

  function trySkip() {
    const sels = [".ytp-ad-skip-button", ".ytp-ad-skip-button-modern",
                  ".ytp-skip-ad-button", ".ytp-ad-skip-button-container button"];
    for (const s of sels) {
      const b = document.querySelector(s);
      if (b) { b.click(); return; }
    }
  }

  // Demande à inject.js (monde principal) de reprendre + relancer la lecture.
  function sendResume(time) {
    window.postMessage({ __nyx: true, type: "resume", time: time }, "*");
  }

  /* ---- Astuce du point / rechargement ----------------------------------- */

  function applyDot() {
    const h = location.hostname;
    if (h.endsWith(".")) return false;
    const url = location.protocol + "//" + h + "."
      + (location.port ? ":" + location.port : "")
      + location.pathname + location.search + location.hash;
    location.replace(url);
    return true;
  }

  // Refait la manœuvre : ajoute le point, ou recharge si le point est déjà là.
  function reloadWithTrick() {
    if (location.hostname.endsWith(".")) location.reload();
    else if (!applyDot()) location.reload();
  }

  /* ---- Bannière "à faire soi-même" -------------------------------------- */

  function showManualBanner() {
    if (document.getElementById("nyx-banner")) return;
    const dotted = location.hostname.endsWith(".");

    const bar = document.createElement("div");
    bar.id = "nyx-banner";
    const s = bar.style;
    s.position = "fixed"; s.top = "14px"; s.left = "50%";
    s.transform = "translateX(-50%)";
    s.zIndex = "2147483647";
    s.maxWidth = "560px"; s.width = "calc(100% - 32px)";
    s.boxSizing = "border-box";
    s.padding = "14px 44px 14px 16px";
    s.background = "#111119";
    s.border = "1px solid #2c2c3e";
    s.borderLeft = "4px solid #22d3ee";
    s.borderRadius = "12px";
    s.color = "#f1f0f6";
    s.font = "13px/1.55 'Segoe UI',Roboto,Arial,sans-serif";
    s.boxShadow = "0 12px 40px rgba(0,0,0,.55)";

    const action = dotted
      ? "retire le « . » à la fin de « youtube.com. » dans la barre d'adresse"
      : "ajoute un « . » à la fin de « youtube.com » dans la barre d'adresse";

    const brand = document.createElement("strong");
    brand.textContent = "NyxDotSkipAdds";
    brand.style.color = "#a78bfa";
    const msg = document.createTextNode(
      " — l'astuce n'a pas bloqué la publicité après " + MAX_ATTEMPTS
      + " essais. Pour réessayer manuellement, " + action
      + ", puis appuie sur Entrée.");
    bar.appendChild(brand);
    bar.appendChild(msg);

    const close = document.createElement("div");
    close.textContent = "\u00D7";
    const cs = close.style;
    cs.position = "absolute"; cs.top = "6px"; cs.right = "12px";
    cs.cursor = "pointer"; cs.fontSize = "22px"; cs.lineHeight = "22px";
    cs.color = "#7d7d92";
    close.addEventListener("click", function () { bar.remove(); });
    bar.appendChild(close);

    (document.body || document.documentElement).appendChild(bar);
    setTimeout(function () { if (bar.parentNode) bar.remove(); }, 30000);
  }

  /* ---- Gestion d'une pub qui démarre ------------------------------------ */

  function handleAdStart() {
    if (!enabled || triggering) return;
    if (givenUp) { trySkip(); return; } // budget épuisé : on laisse la main

    triggering = true;
    const videoId = getVideoId();

    chrome.storage.local.get(
      { adsSkipped: 0, nyxTrick: null, pendingResume: null },
      function (res) {
        const now = Date.now();

        // compteur d'essais : réinitialisé si nouvelle vidéo ou trop ancien
        let t = res.nyxTrick;
        if (!t || t.videoId !== videoId || (now - t.lastAt) > TRICK_RESET_MS) {
          t = { videoId: videoId, attempts: 0, lastAt: now };
        }

        // timestamp à conserver : le plus avancé entre ce qu'on connaît
        // maintenant et ce qui était déjà sauvegardé (utile si une pub
        // revient avant que la vraie vidéo n'ait pu jouer)
        let resumeTime = lastKnownTime > 1
          ? Math.max(0, lastKnownTime - REWIND_BUFFER_S) : 0;
        const prev = res.pendingResume;
        if (prev && prev.videoId === videoId
            && (now - prev.savedAt) < RESUME_MAX_AGE_MS
            && prev.time > resumeTime) {
          resumeTime = prev.time;
        }

        // budget d'essais épuisé -> on prévient l'utilisateur
        if (t.attempts >= MAX_ATTEMPTS) {
          givenUp = true;
          triggering = false;
          trySkip();
          showManualBanner();
          return;
        }

        t.attempts += 1;
        t.lastAt = now;
        chrome.storage.local.set({
          pendingResume: { videoId: videoId, time: resumeTime, savedAt: now },
          nyxTrick: t,
          adsSkipped: res.adsSkipped + 1
        }, function () { reloadWithTrick(); });
      }
    );
  }

  /* ---- Reprise après rechargement --------------------------------------- */

  function attemptResume() {
    chrome.storage.local.get(["pendingResume"], function (res) {
      const pr = res.pendingResume;
      if (!pr) return;
      if (Date.now() - pr.savedAt > RESUME_MAX_AGE_MS) {
        chrome.storage.local.remove("pendingResume");
        return;
      }
      const cur = getVideoId();
      if (pr.videoId && cur && pr.videoId !== cur) return;

      // inject.js (monde principal) se charge du seek + de la lecture.
      // On renvoie le message une fois de plus par sécurité (course au
      // chargement).
      sendResume(pr.time || 0);
      setTimeout(function () { sendResume(pr.time || 0); }, 800);
    });
  }

  /* ---- Boucle principale ------------------------------------------------ */

  function tick() {
    // changement de vidéo (navigation interne YouTube) -> on réinitialise
    const vid = getVideoId();
    if (vid !== sessionVideoId) {
      sessionVideoId = vid;
      givenUp = false;
      triggering = false;
      cleanPlaySeconds = 0;
      attemptsResetDone = false;
    }

    const v = getVideo();
    const adShowing = isAdShowing();

    if (v && !adShowing && !isNaN(v.currentTime) && v.currentTime > 0) {
      lastKnownTime = v.currentTime;
      if (!v.paused) {
        cleanPlaySeconds += POLL_MS / 1000;
        // lecture saine prolongée -> on rend son budget d'essais à la vidéo
        if (cleanPlaySeconds > CLEAN_RESET_S && !attemptsResetDone) {
          attemptsResetDone = true;
          chrome.storage.local.remove("nyxTrick");
        }
      }
    }
    if (adShowing) cleanPlaySeconds = 0;

    if (adShowing && !wasAdShowing) {
      setTimeout(function () { if (isAdShowing()) handleAdStart(); }, 250);
    }
    wasAdShowing = adShowing;
  }

  /* ---- Initialisation --------------------------------------------------- */

  chrome.storage.local.get({ enabled: true }, function (res) {
    enabled = res.enabled !== false;
    if (enabled) attemptResume();
  });

  chrome.storage.onChanged.addListener(function (ch, area) {
    if (area === "local" && ch.enabled) {
      enabled = ch.enabled.newValue !== false;
    }
  });

  setInterval(tick, POLL_MS);
})();
