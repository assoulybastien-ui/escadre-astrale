# Escadre Astrale

Jeu de raid lead en 3D : dirige dix héros face aux quatre gardiens de la Citadelle de Vael-Kor. Pensé pour iPhone, en paysage.

## Jouer
- Le plus simple : ouvrir `index.html` dans un navigateur (connexion internet nécessaire pour three.js).
- Version installable hors ligne : `python3 build_pwa.py`, puis publier le dossier `docs/` (GitHub Pages : Réglages → Pages → branche `main`, dossier `/docs`). Sur iPhone : Safari → Partager → « Sur l'écran d'accueil ».

## Développer
- `python3 build.py` reconstruit `index.html` à partir de `src/`.
- Tests automatiques : `npm install`, puis `node test/v5.js`.
- Les consignes de travail et l'architecture sont dans `CLAUDE.md`.
