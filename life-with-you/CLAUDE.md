# Life With You — consignes pour Claude

Jeu 3D de **speed riding** (voile de vitesse à skis ou à pied) en web app, joué sur **iPhone, en paysage**.
Projet perso de Bastien. Tout en **français** (code commenté, textes du jeu) ; seul le titre est en anglais.
Hébergé provisoirement dans le dépôt `escadre-astrale` (dossier `life-with-you/`) ; à déplacer dans un dépôt **public** dédié avec GitHub Pages.

## Façon de travailler (demandée par Bastien)
- Poser les questions utiles ; répondre de façon sympa, objective et franche, sans détour.
- Faire valider au fur et à mesure avec des exemples visuels (captures, petites vidéos).
- Livrer par étapes ; dire clairement les limites et ce qui est truqué dans une démo.

## Décisions validées (questions/réponses du 31/10/2026)
- Discipline : **speed flying / speed riding**. À skis **et** à pied selon le lieu (v0.1 : skis seulement).
- Web app 3D (three.js r128), installable plus tard (PWA).
- Relief : **lieux réels** (Chamonix/Mont-Blanc, Alpes suisses, Dolomites — données 1–2 m) **et** descentes générées (v0.1 : une descente générée).
- Objectifs : **score de proximité** + **portes**. Médailles par descente, **fantôme** du record, **voiles à débloquer** (à faire).
- Stick **comme un avion** : haut = piquer/accélérer, bas = freiner/cabrer/arrondir ; option d'inversion.
- **Stick flottant** (apparaît sous le pouce, suit le pouce au-delà du cercle). Un seul contrôle.
- Caméra **derrière le pilote**. Physique **réelle avec niveaux** (vent, turbulences, fermetures plus tard).
- Rendu **réaliste**. Sons **réalistes seuls**, pas de musique.
- Crash : **ralenti puis on rejoue** (redémarrage auto ~2,8 s, ou toucher).
- Fin : **atterrissage noté** (précision + douceur) dans une cible.
- Descentes **courtes (30–60 s)**. Décollage **joué au stick**. HUD **minimal**.
- **Météo variable** (à faire) ; difficulté **liée au lieu et à la météo**.
- Parcours : **câbles et pylônes**, **forêts** (slalom), **arches et passages** (à faire), **villages et chalets**.
- **Touch & go** à skis : bonus de combo.
- **Pilote au choix** homme/femme + couleurs (à faire).

## Lancer, construire, tester
- `python3 build.py` → `index.html` (page complète) et `dist/artifact.html` (fragment pour l'Artifact claude.ai). three.js r128 depuis cdnjs, polices Google Fonts.
- `node test/physique.js` — vitesses/finesse de la voile, décollage, hauteur du câble.
- `node test/bot.js <haut_visée> [0=passer au-dessus du câble]` — descente complète par le pilote automatique, sans rendu (réglage des médailles).
- `node test/trace.js <haut_visée>` — trace du bot tous les 20 m.
- `node test/shots.js outDir [dpr]` — captures des moments clés (Chromium + SwiftShader, ~10 s par image : ne rendre que les images capturées).
- Crochet de test : `window.__lwy` (`manual`, `advance(dt, n, render)`, `state`, `start`, `bot(opts)`, `input`). Bloc `@@TEST` dans `main.js`.

## Architecture (`src/`, pas de bundler, ordre de concaténation dans `build.py`)
- `noise.js` — simplexe 2D à graine, fbm, ridged.
- `world.js` — `WORLD` : profil de pente (`SLOPE`), couloir (`CORR`), relief analytique `hRaw`, grille fine 3 m (`heightAt` suit **la même triangulation** que le rendu), sapins (+ grille spatiale), rochers, chalets, télésiège (`CABLE`, câble à ~18 m), portes (`GATES`), cible (`LAND`, `LAND.from` = début de la prairie), collisions `hit`, `nearTree`, vent.
- `flight.js` — `FLIGHT` : modèle à point matériel. Voile 11 m², CL 0,20–1,15, polaire CD = 0,10 + 0,20·CL², charge max 3,2 g. Glisse à skis (frottement, carre), décollage quand la portance dépasse la composante normale du poids, contact (touch & go / atterrissage / crash), repère visuel en balancier, points de collision (buste, centre et bouts de voile).
- `game.js` — `GAME` : pas fixe 1/120 s, score (proximité × vitesse × combo, portes, touch & go, frôlés, câble, atterrissage), médailles (Bronze 6 000, Argent 10 000, Or 14 000), fantôme 10 Hz, sauvegarde `localStorage['life-with-you-v1']`.
- `bot.js` — pilote automatique (tests et vidéos uniquement).
- `render.js` — `R3D` : ciel, relief en tuiles (texture triplanaire), relief lointain aligné sur la grille fine, sapins/rochers instanciés, chalets, télésiège, portes, cible + manche à air, pilote + voile (profil réel, suspentes), fantôme, traînées et gerbes de neige, caméra de poursuite.
- `audio.js` — sons synthétisés (bruit rose filtré) : vent, sifflement, claquement, skis, frôlés, portes, crash.
- `ui.js` — écrans, HUD, stick flottant, clavier (flèches / ZQSD / WASD, Échap = pause, Espace = rejouer).
- `body.html`, `style.css` — écrans et HUD (polices Big Shoulders Display, Barlow, Barlow Condensed).

## Chiffres de vol (mesurés par `test/physique.js`)
Bras hauts 57 km/h, finesse 3,5 · accéléré à fond 96 km/h, finesse 1,85 (~28°) · freins à fond 42 km/h · virage max 72 km/h, 1,6 g.
Un piqué à 83 km/h puis « tirer » ne fait regagner que ~4 m : c'est réaliste pour une voile de vitesse (traînée forte).

## Pièges connus
- `[hidden]` doit rester `display:none !important` (les `.screen` sont en `display:flex`).
- Sans écran, le rendu WebGL logiciel prend ~10 s par image : avancer sans rendre (`advance(dt, n, false)`), ne rendre que les captures.
- Le relief lointain a des cellules de 82,5 m alignées sur les bords de la grille fine (sinon il perce la grille dans les creux).
- La voile au sol est couchée derrière le pilote : la caméra monte tant qu'elle n'est pas gonflée.
