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
- Objectifs : **score de proximité** + portes. **Portes mises de côté** (31/10 : « on définit d'abord la physique ») : `GATES_ON = false` dans `world.js`. Médailles par descente, **fantôme** du record, **voiles à débloquer** (à faire).
- **Deux poignées de frein, une par pouce** (changement du 31/10, remplace le stick unique) : moitié gauche de l'écran = poignée gauche,
  moitié droite = poignée droite. Pouce vers le bas = on tire la poignée (course ~95 px). Pouce vers le haut ou sur le côté : **rien**.
  **Le repère reste là où le pouce s'est posé** (demande du 31/10) : au-delà de la course, la poignée reste à fond. Un frein = virage de ce côté, **sans limite** : tenu, la voile penche de plus en plus jusqu'à la spirale engagée (~88°, > 100 km/h, jusqu'au crash si on ne relâche pas) ; les deux = freiner, remonter, arrondir.
  Pas d'accélérateur : mains hautes = pleine vitesse. Repères **flottants**. **Paysage uniquement** (pause auto en portrait).
- Départ : poser **les deux pouces** lance l'élan ; on **saute d'une falaise** (~28 m) au bout d'un replat de 25 m.
- **Dynamique (retour du 31/10 : « on ne vole pas assez, on ne sent pas le balancement »)** : la pente est plus raide que le plané de la voile
  (en vol droit on s'écarte de la neige, on descend en enchaînant les virages) ; double pendule : la voile s'incline vite sous le frein,
  le pilote se balance dessous avec retard (dépasse, revient) et entraîne la voile → wingovers en alternant au bon rythme ;
  tangage en pendule (abattée quand on relâche, ressource quand on tire). Caméra décalée vers la voile et penchée avec le pilote.
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
- `node test/balance.js outDir` — captures du saut de falaise et du balancement (frein tenu, relâché).
- `node test/voile.js outDir` — gros plans de la voile souple (vol droit, de face, frein droit, spirale), en dpr 2.
- `node test/trace.js <haut_visée>` — trace du bot tous les 20 m.
- `node test/shots.js outDir [dpr]` — captures des moments clés (Chromium + SwiftShader, ~10 s par image : ne rendre que les images capturées).
- Crochet de test : `window.__lwy` (`manual`, `advance(dt, n, render)`, `state`, `start`, `bot(opts)`, `input`). Bloc `@@TEST` dans `main.js`.

## Architecture (`src/`, pas de bundler, ordre de concaténation dans `build.py`)
- `noise.js` — simplexe 2D à graine, fbm, ridged.
- `world.js` — `WORLD` : profil de pente (`SLOPE`), couloir (`CORR`), relief analytique `hRaw`, grille fine 3 m (`heightAt` suit **la même triangulation** que le rendu), sapins (+ grille spatiale), rochers, chalets, télésiège (`CABLE`, câble à ~18 m), portes (`GATES`), cible (`LAND`, `LAND.from` = début de la prairie), collisions `hit`, `nearTree`, vent.
- `flight.js` — `FLIGHT` : modèle à point matériel. Entrées `{ l, r, go }` (freins 0–1). Voile 9,5 m², CL 0,45 (mains hautes) à 1,15 (freins à fond),
  polaire CD = 0,12 + 0,22·CL², charge max 3,2 g. Part commune des freins = min(l, r) + 0,35·|r − l| ; différence = inclinaison (50°, spirale 72° si un frein reste à fond > 1 s).
  Voile : `bank` (1er ordre, 0,4 s) tirée par `swing` (pilote, pendule rollK 8,2 / rollC 1,0, couplage 0,55). CL en pendule (pitchK 26 / pitchC 4,6).
  Garde des freins : effet = ((b − 0,08)/0,92)^1,25. Virage sans limite : `spiralT` monte tant que |différence| > 0,3, inclinaison jusqu'à 88°, charge max 4,5 g.
  Envol au bord d'une rupture de pente : si le relief 3 m devant tombe plus vite qu'une chute libre (portance comprise).
  Décrochage si freins > 85 % et vitesse < 10,2 m/s pendant 0,5 s ; on en sort en relâchant (< 50 %). Glisse à skis (frottement, carre), décollage quand la portance dépasse la composante normale du poids, contact (touch & go / atterrissage / crash), repère visuel en balancier, points de collision (buste, centre et bouts de voile).
- `game.js` — `GAME` : pas fixe 1/120 s, score (proximité × vitesse × combo, portes, touch & go, frôlés, câble, atterrissage), médailles (Bronze 4 000, Argent 8 000, Or 13 000), fantôme 10 Hz, chrono arrêté au toucher dans la prairie, sauvegarde `localStorage['life-with-you-v2']`.
- `bot.js` — pilote automatique (tests et vidéos uniquement) : essaie plusieurs caps et garde le plus proche de l'objectif qui reste sûr,
  suit l'axe des portes, « carve » (reste incliné d'un côté puis de l'autre) ou spirale quand il est trop haut. Réglage par défaut issu d'un balayage.
- `render.js` — `R3D` : ciel, relief en tuiles (texture triplanaire), relief lointain aligné sur la grille fine, sapins/rochers instanciés, chalets, télésiège, portes, cible + manche à air, pilote + voile, fantôme, traînées et gerbes de neige, caméra de poursuite, `closeup()` (gros plans de test).
  Voile souple (`wingGeometry` + `deformWing` à chaque image) : 48 stations, caissons gonflés entre nervures, ouvertures au bord d'attaque, bord de fuite festonné ;
  la charge ouvre l'arc, la décharge referme les bouts, les caissons respirent, le bord de fuite frémit avec la vitesse, les freins l'abaissent, le bout extérieur traîne en virage,
  la voile se froisse au décrochage ; suspentage en cascade (A, B, C groupées par 3) et freins (main → cascade → 4 points du bord de fuite) qui suivent la déformation.
- `audio.js` — sons synthétisés (bruit rose filtré) : vent, sifflement, claquement, skis, frôlés, portes, crash.
- `ui.js` — écrans, HUD, deux poignées flottantes (`hands`, `TRAVEL`), clavier (← / Q / A = frein gauche, → / D = frein droit, ↓ / S = les deux, Espace = départ/rejouer, Échap = pause).
- `body.html`, `style.css` — écrans et HUD (polices Big Shoulders Display, Barlow, Barlow Condensed).

## Chiffres de vol (mesurés par `test/physique.js`)
Mains hautes 71 km/h, finesse 2,7 (~20°) · freins à moitié 55 km/h, finesse 3,1 · freins à fond 44 km/h · un frein à moitié : 25°, 68 km/h ·
un frein à fond (spirale) : 72°, 90 km/h, 18 m/s de chute, 2,3 g. Une ressource après spirale regagne ~4 m : réaliste (traînée forte).
Coup de frein droit 1 s : voile 27°, pilote 35° puis −9° (balancement). Freins alternés toutes les 1,4 s : pilote jusqu'à ~80° (wingover).
Vol droit mains hautes depuis la falaise : jusqu'à ~60 m au-dessus de la pente ; il faut virer pour la frôler.
Descente : ~775 m, ~350 m de dénivelé, ~52 s pour le pilote automatique (8/8 portes). Portes : 20 m de large, 30 m de haut. Câble à 22 m.

## Pièges connus
- `[hidden]` doit rester `display:none !important` (les `.screen` sont en `display:flex`).
- Sans écran, le rendu WebGL logiciel prend ~10 s par image : avancer sans rendre (`advance(dt, n, false)`), ne rendre que les captures.
- Le relief lointain a des cellules de 82,5 m alignées sur les bords de la grille fine (sinon il perce la grille dans les creux).
- La voile au sol est couchée derrière le pilote : la caméra monte tant qu'elle n'est pas gonflée.
- Le bord de fuite de la voile est déformé par les freins (`deformWing`) : le fantôme a sa propre copie de la géométrie.
- Parcours : la barre rocheuse (10 m) ne couvre que la gauche et le centre ; à droite, une rampe de neige.
- `ui.js` ne réécrit les poignées que si un pouce ou une touche bouge (sinon le crochet de test `input()` est écrasé à chaque image).
- Ne jamais tuer un processus par motif (`pkill -f`, `pgrep -f … | kill`) : le motif attrape aussi le shell courant. Tuer par PID exact. Les portes alternées font traverser la pente en diagonale, ce qui la rend moins raide : prévoir de la marge.
