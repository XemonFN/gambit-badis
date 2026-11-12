# Badis Gambit

Mon analyseur de parties chess.com : import automatique par pseudo, analyse Stockfish directement dans le navigateur, revue coup par coup avec les mêmes catégories que chess.com (Brillant, Meilleur, Gaffe…), meilleur coup affiché à chaque position, variantes libres, niveau estimé par partie, et entraînement en révision espacée sur mes propres erreurs.

Fonctionne sur Mac et sur iPhone (Safari → Partager → « Sur l’écran d’accueil » pour l’avoir comme une appli).

## Modifier le site
- **Ne pas modifier `index.html` à la main** : il est construit.
- Modifier `index.src.html` (interface : HTML, CSS, JS) ou `core.js` (logique : lecture PGN, classement des coups, diagnostics).
- Reconstruire : `python3 tools/build.py`
- Tester en local : `python3 -m http.server 8000` puis http://localhost:8000
- Publier : commit + push sur `main` (GitHub Pages met le site à jour en 1 à 2 minutes).

## Fichiers
| Fichier | Rôle |
|---|---|
| `index.src.html` | la page (interface) |
| `core.js` | logique d’analyse, testable sous Node |
| `pieces.css` | images des pièces (cburnett, GPL v2+) |
| `chess.js` | règles des échecs (chess.js 0.10.3, BSD-2) |
| `sf17.js`, `sf17.wasm` | moteur Stockfish 17.1 NNUE lite (GPL v3, voir `STOCKFISH-COPYING.txt`, source : github.com/nmrugg/stockfish.js) |
| `stockfish*.js`, `stockfish.wasm` | ancien moteur Stockfish 10, en secours si le premier ne démarre pas |
| `manifest.webmanifest`, `icon-*.png` | installation comme appli sur téléphone |

## Données
Tout est stocké dans le navigateur de chaque appareil (localStorage) : parties, analyses, progression des exercices. Chaque appareil se synchronise lui-même avec chess.com.

## Limites connues
- Le bouton « Pourquoi ? » du coach IA n’existe que dans la version Claude (il demanderait une clé API payante ici).
- L’estimation de niveau et la précision imitent l’esprit de chess.com, sans être leurs formules exactes (non publiques).
