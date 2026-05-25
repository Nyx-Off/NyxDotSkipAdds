/* =========================================================================
 * NyxDotSkipAdds — inject.js  (s'exécute dans le MONDE PRINCIPAL de la page)
 *
 * Le content script classique ne peut pas appeler l'API du lecteur YouTube
 * (movie_player.seekTo / playVideo). Ce script, lui, tourne dans le contexte
 * de la page et peut le faire.
 *
 * Il écoute les messages de content.js et, à la reprise :
 *  - replace la vidéo au bon timestamp ;
 *  - relance la lecture ;
 *  - si l'autoplay est bloqué (cas du domaine "youtube.com." vu comme un
 *    nouvel domaine sans historique), il coupe le son le temps de démarrer
 *    la lecture — l'autoplay muet est toujours autorisé — puis remet le son.
 * ========================================================================= */
(function () {
  "use strict";

  if (!location.hostname.includes("youtube.com")) return;

  let resuming = false;

  function player() {
    return document.getElementById("movie_player");
  }

  function doResume(time) {
    if (resuming) return;
    resuming = true;

    let tries = 0;
    let seeked = false;
    let mutedForce = false;
    const MAX = 220; // 220 * 250 ms ≈ 55 s

    const iv = setInterval(function () {
      tries++;
      const p = player();
      const ready = p
        && typeof p.playVideo === "function"
        && typeof p.getDuration === "function"
        && typeof p.getPlayerState === "function";

      if (!ready) {
        if (tries >= MAX) { clearInterval(iv); resuming = false; }
        return;
      }

      let dur = 0;
      try { dur = p.getDuration() || 0; } catch (e) {}
      const adShowing = p.classList && p.classList.contains("ad-showing");

      // on attend la fin d'une éventuelle pub avant de reprendre
      if (adShowing || dur <= 0) {
        if (tries >= MAX) { clearInterval(iv); resuming = false; }
        return;
      }

      // repositionnement (une seule fois)
      if (!seeked) {
        if (time > 1 && dur > time + 1) {
          try { p.seekTo(time, true); } catch (e) {}
        }
        seeked = true;
      }

      // après ~1,5 s sans lecture : autoplay probablement bloqué
      // -> on coupe le son (l'autoplay muet est toujours permis)
      if (!mutedForce && tries > 6) {
        try { p.mute(); } catch (e) {}
        mutedForce = true;
      }

      try { p.playVideo(); } catch (e) {}

      let state = -99;
      try { state = p.getPlayerState(); } catch (e) {}

      if (state === 1) { // 1 = en lecture
        clearInterval(iv);
        if (mutedForce) {
          setTimeout(function () {
            const pp = player();
            if (pp && pp.unMute) { try { pp.unMute(); } catch (e) {} }
          }, 450);
        }
        // dernière assurance
        setTimeout(function () {
          const pp = player();
          if (pp && pp.playVideo) { try { pp.playVideo(); } catch (e) {} }
        }, 800);
        resuming = false;
        return;
      }

      if (tries >= MAX) {
        clearInterval(iv);
        if (mutedForce) {
          const pp = player();
          if (pp && pp.unMute) { try { pp.unMute(); } catch (e) {} }
        }
        resuming = false;
      }
    }, 250);
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__nyx !== true) return;
    if (d.type === "resume") doResume(Number(d.time) || 0);
  }, false);
})();
