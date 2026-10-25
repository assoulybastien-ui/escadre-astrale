# Escadre Astrale

Jeu de raid lead en 3D : tu diriges dix héros face aux quatre gardiens de la Citadelle de Vael-Kor. Tu n'incarnes personne ; tu places, tu donnes les ordres, tu lances les sorts de l'escadre. Pensé pour iPhone, en paysage, à deux mains.

Version **1.0** — voir [NOTES-DE-VERSION.md](NOTES-DE-VERSION.md).

## Le jeu
- **Quatre boss, quatre arènes** : Vorr dans la Forge effondrée, Séla et Néria dans l'Observatoire céleste, l'Archonte Nyxar dans la Salle du Noyau, Azhal au bord de l'Horizon.
- **Trois difficultés** : Normal (~3 min), Héroïque (~4 min), Mythique (~5 min). Le Mythique s'ouvre quand les quatre boss sont vaincus en Héroïque.
- **9 classes**, une race chacune, 18 raideurs dans le vivier : compose ton raid de 10 (au moins 2 tanks et 2 soigneurs).
- **Talents** : 3 paliers par classe (à 1, 4 et 8 victoires), 2 choix par palier.
- **Butin** réparti équitablement après chaque victoire.

## Commandes
- Toucher un perso (ou son cadre à gauche) : le sélectionner. Toucher le sol : l'y envoyer. Toucher un ennemi : l'attaquer.
- Barre de sorts en bas à droite : un toucher lance le sort ; **appui long** pour savoir ce qu'il fait (le combat continue).
- Groupes en bas à gauche : un toucher rappelle le groupe, appui long pour y ranger la sélection.
- Le Journal décrit chaque boss, ses phases et ses capacités.

## Jouer sur un ordinateur
Les navigateurs bloquent les modèles 3D quand on ouvre `index.html` directement : il faut un petit serveur local.

```bash
cd ~/Documents/GitHub/escadre-astrale && python3 -m http.server 8001
```

Puis ouvrir http://localhost:8001 dans Safari ou Chrome. Depuis un iPhone sur le même Wi-Fi : `http://<adresse du Mac>:8001`.

## Version installable (iPhone, hors ligne)
`python3 build_pwa.py` construit le dossier `docs/` : la même version, avec three.js et les polices embarqués, et un mode hors ligne.
Une fois `docs/` publié sur un site en https (par exemple GitHub Pages : Réglages → Pages → branche `main`, dossier `/docs`, ce qui demande un dépôt public ou un compte payant), sur iPhone : Safari → Partager → « Sur l'écran d'accueil ».

## Développer
- `python3 build.py` reconstruit `index.html` à partir de `src/`.
- Tests automatiques (Node.js et Playwright) : `npm install`, puis par exemple `node test/parcours.js`, `node test/v5.js`, `node test/tips.js`, `node test/talents.js`.
- Équilibrage au bot : `node test/bot5.js mythique 60 good`.
- Les consignes de travail et l'architecture sont dans `CLAUDE.md`.

## Crédits
- Moteur 3D : [three.js](https://threejs.org) r128 (licence MIT, `vendor/three/LICENSE`).
- Polices : Chakra Petch, Michroma, Share Tech Mono (licence SIL OFL, `vendor/fonts/`).
- Personnages animés : base issue de Mixamo (Adobe).
- Projet personnel, univers original.
