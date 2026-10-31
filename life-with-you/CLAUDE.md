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
- **Deux poignées de frein, une par pouce** (changement du 31/10, remplace le stick unique) : moitié gauche de l'écran = poignée gauche,
  moitié droite = poignée droite. Pouce vers le bas = on tire la poignée (course ~95 px). Pouce vers le haut ou sur le côté : **rien**
  (le repère suit le pouce). Un frein = virage de ce côté ; un frein tenu à fond = spirale ; les deux = freiner, remonter, arrondir.
  Pas d'accélérateur : mains hautes = pleine vitesse. Repères **flottants**. **Paysage uniquement** (pause auto en portrait).
- Départ : poser **les deux pouces** lance l'élan ; on décolle en tirant les deux poignées.
- Caméra **derrière le pilote**. Physique **réelle avec niveaux** (vent, turbulences, fermetures plus tard).
- Rendu **réaliste**. Sons **réalistes seuls**, pas de musique.
- Crash : **ralenti puis on rejoue** (redémarrage auto ~2,8 s, ou toucher).
- Fin : **atterrissage noté** (précision + douceur) dans une cible.
- Descentes **courtes (30–60 s)**. Décollage **joué au stick**. HUD **minimal**.
- **Météo variable** (à faire) ; difficulté **liée au lieu et à la météo**.
- Parcours : **câbles et pylônes**, **forêts** (slalom), **arches et passages** (à faire), **villages et chalets**.
- **Touch & go** à skis : bonus de combo. Glisser au-dessus d'une rupture de pente fait décoller (le sol se dérobe).
- **Pilote au choix** homme/femme + couleurs (à faire).

## Lancer, construire, tester
- `python3 build.py` → `index.html` (page complète) et `dist/artifact.html` (fragment pour l'Artifact claude.ai). three.js r128 depuis cdnjs, polices Google Fonts.
- `node test/physique.js` — vitesses/finesse de la voile, décollage, hauteur du câble.
- `node test/bot.js <haut_visée> [0=passer au-dessus du câble] [gain]` — descente complète par le pilote automatique, sans rendu (réglage des médailles).
- `node test/pouces.js [outDir]` — les deux poignées au doigt (multi-touch réel via CDP), avec vérifications et capture d'un virage.
- `node test/trace.js <haut_visée>` — trace du bot tous les 20 m.
- `node test/shots.js outDir [dpr]` — captures des moments clés (Chromium + SwiftShader, ~10 s par image : ne rendre que les images capturées).
- Crochet de test : `window.__lwy` (`manual`, `advance(dt, n, render)`, `state`, `start`, `bot(opts)`, `input`). Bloc `@@TEST` dans `main.js`.

## Architecture (`src/`, pas de bundler, ordre de concaténation dans `build.py`)
- `noise.js` — simplexe 2D à graine, fbm, ridged.
- `world.js` — `WORLD` : profil de pente (`SLOPE`), couloir (`CORR`), relief analytique `hRaw`, grille fine 3 m (`heightAt` suit **la même triangulation** que le rendu), sapins (+ grille spatiale), rochers, chalets, télésiège (`CABLE`, câble à ~18 m), portes (`GATES`), cible (`LAND`, `LAND.from` = début de la prairie), collisions `hit`, `nearTree`, vent.
- `flight.js` — `FLIGHT` : modèle à point matériel. Entrées `{ l, r, go }` (freins 0–1). Voile 9,5 m², CL 0,45 (mains hautes) à 1,15 (freins à fond),
  polaire CD = 0,12 + 0,22·CL², charge max 3,2 g. Part commune des freins = min(l, r) + 0,35·|r − l| ; différence = inclinaison (50°, spirale 72° si un frein reste à fond > 1 s).
  Décrochage si freins > 85 % et vitesse < 10,2 m/s pendant 0,5 s ; on en sort en relâchant (< 50 %). Glisse à skis (frottement, carre), décollage quand la portance dépasse la composante normale du poids, contact (touch & go / atterrissage / crash), repère visuel en balancier, points de collision (buste, centre et bouts de voile).
- `game.js` — `GAME` : pas fixe 1/120 s, score (proximité × vitesse × combo, portes, touch & go, frôlés, câble, atterrissage), médailles (Bronze 8 000, Argent 14 000, Or 20 000), fantôme 10 Hz, chrono arrêté au toucher dans la prairie, sauvegarde `localStorage['life-with-you-v2']`.
- `bot.js` — pilote automatique (tests et vidéos uniquement).
- `render.js` — `R3D` : ciel, relief en tuiles (texture triplanaire), relief lointain aligné sur la grille fine, sapins/rochers instanciés, chalets, télésiège, portes, cible + manche à air, pilote + voile (profil réel, suspentes), fantôme, traînées et gerbes de neige, caméra de poursuite.
- `audio.js` — sons synthétisés (bruit rose filtré) : vent, sifflement, claquement, skis, frôlés, portes, crash.
- `ui.js` — écrans, HUD, deux poignées flottantes (`hands`, `TRAVEL`), clavier (← / Q / A = frein gauche, → / D = frein droit, ↓ / S = les deux, Espace = départ/rejouer, Échap = pause).
- `body.html`, `style.css` — écrans et HUD (polices Big Shoulders Display, Barlow, Barlow Condensed).

## Chiffres de vol (mesurés par `test/physique.js`)
Mains hautes 71 km/h, finesse 2,7 (~20°) · freins à moitié 55 km/h, finesse 3,1 · freins à fond 44 km/h · un frein à moitié : 25°, 68 km/h ·
un frein à fond (spirale) : 72°, 90 km/h, 18 m/s de chute, 2,3 g. Une ressource après spirale regagne ~4 m : réaliste (traînée forte).
Le relief suit à peu près la finesse mains hautes : en vol droit on rase, on coupe les passages plus raides en virant.
Descente : ~785 m, ~290 m de dénivelé, ~60 s pour le pilote automatique (8/8 portes, sous le câble).

## Pièges connus
- `[hidden]` doit rester `display:none !important` (les `.screen` sont en `display:flex`).
- Sans écran, le rendu WebGL logiciel prend ~10 s par image : avancer sans rendre (`advance(dt, n, false)`), ne rendre que les captures.
- Le relief lointain a des cellules de 82,5 m alignées sur les bords de la grille fine (sinon il perce la grille dans les creux).
- La voile au sol est couchée derrière le pilote : la caméra monte tant qu'elle n'est pas gonflée.
- Le bord de fuite de la voile est déformé par les freins (`deformWing`) : le fantôme a sa propre copie de la géométrie.
- Parcours : la barre rocheuse (12 m) ne couvre que la gauche et le centre ; à droite, une rampe de neige. Les portes alternées font traverser la pente en diagonale, ce qui la rend moins raide : prévoir de la marge.
