# NyxDotSkipAdds — v2.1.0

Extension navigateur (Chrome / Edge / Brave / Firefox) qui détecte les
publicités YouTube, applique l'astuce du point (`youtube.com` →
`youtube.com.`), reprend la vidéo au bon timestamp et relance la lecture.

## Nouveautés v2.1

- **Auto-play fiable** après le rechargement. Sur `youtube.com.` le
  navigateur voit un nouvel domaine et bloque souvent l'autoplay :
  l'extension démarre alors la lecture en sourdine (toujours autorisée)
  puis remet le son. La reprise passe désormais par l'API du lecteur
  YouTube (`inject.js`), bien plus fiable que la manipulation brute.
- **Jusqu'à 5 essais** : si une pub revient malgré l'astuce, la manœuvre
  est refaite automatiquement, jusqu'à 5 fois.
- **Bannière d'aide** : passés les 5 essais, une bannière explique à
  l'utilisateur comment ajouter / retirer le point lui-même.
- Le budget d'essais se réinitialise après 90 s de lecture sans pub.

## Fichiers

| Fichier        | Rôle                                                  |
|----------------|-------------------------------------------------------|
| `manifest.json`| Déclaration de l'extension (Manifest V3)              |
| `content.js`   | Détection, astuce du point, gestion des 5 essais      |
| `inject.js`    | Monde principal : seek + lecture via l'API YouTube    |
| `popup.html/css/js` | Menu d'activation / désactivation                |
| `icons/`       | Icônes 16 / 48 / 128 px                               |

## Installation rapide (test)

- **Chrome / Edge / Brave** : `chrome://extensions` → Mode développeur →
  Charger l'extension non empaquetée → dossier `NyxDotSkipAdds`.
- **Firefox** : `about:debugging#/runtime/this-firefox` → Charger un
  module temporaire → `manifest.json`.

## Installation permanente

- **Chrome** : une extension non empaquetée reste installée entre les
  redémarrages. Pour supprimer le mode développeur, publier en *Non
  répertorié* sur le Chrome Web Store.
- **Firefox** : faire signer le `.xpi` sur addons.mozilla.org en *Non
  répertorié* (gratuit), puis l'installer via `about:addons` → Installer
  un module depuis un fichier. Ou Firefox Developer Edition avec
  `xpinstall.signatures.required` = `false`.

## Notes

- Permission unique : `storage`. Aucune donnée envoyée à l'extérieur
  (`data_collection_permissions: none`).
- `inject.js` tourne dans le monde principal de la page (clé `world`
  du manifest) pour accéder à l'API du lecteur YouTube.
- L'astuce du point est non officielle : si elle échoue 5 fois d'affilée,
  l'extension cesse de recharger et laisse la main à l'utilisateur.
