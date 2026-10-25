# Escadre Astrale — consignes pour Claude

Jeu 3D de **raid lead** (univers galactique, IP originale) joué en web app sur **iPhone 15, en paysage, à deux mains**.
Projet perso de Bastien. Tout se fait **en français** (code commenté en français, textes du jeu en français).

## Façon de travailler (demandée par Bastien)
- Poser les questions nécessaires pour avoir le bon contexte ; répondre de façon sympa, objective et franche, sans détour.
- **Faire valider au fur et à mesure avec des exemples visuels** : captures, planches, petites vidéos (voir « Outils de rendu »).
- Livraison par étapes (voir « Feuille de route ») ; ne pas enchaîner une étape sans validation.
- Dire clairement les limites et ce qui est truqué dans une démo (ex. PV maintenus pour filmer).

## Lancer, construire, tester
- `python3 build.py` → `index.html` (fichier unique : HTML + CSS + JS inline, three.js chargé depuis le CDN). Ouvrir dans un navigateur.
- `python3 build_pwa.py` → `docs/` : version installable hors ligne (PWA, three.js et polices embarqués, service worker). `docs/` est prévu pour GitHub Pages (branche `main`, dossier `/docs`).
- Tests sans écran (Node + Playwright, rendu WebGL logiciel SwiftShader) : `npm install` puis par ex. `node test/v5.js` (parcours complet hub → combat, captures dans `test/shots/`).
- Équilibrage : `node test/bot5.js <diff> <n> good|ok|passive [boss]` (bot à vitesse humaine).
- Hook de test exposé par `ui.js` : `window.__escadre` (`manual(true)`, `advance(dt,n)`, `state()`, `cast`, `pull`, `ff`). Il est retiré de la PWA.

## Architecture (`src/`, pas de bundler)
- `data.js` — `DATA` : 9 classes, sorts de la barre, vivier de 18 raideurs, 4 boss, difficultés, butin, `VSPECS` (specs visuelles pour le banc d'essai).
- `engine.js` — `GAME` : simulation déterministe (`createFight`, `pull`, `step`, `order`, `cast`, `spellBar`, `analyze`…). Communique avec le rendu par `S.events`.
- `render.js` — `R3` : three.js r128, composer HDR + UnrealBloom + passe ACES, arène, boss, effets. Insère `chars.js` à la place de `/*@@CHARS@@*/`.
- `chars.js` — personnages : `STYLE` (couleurs, taille, os mis à l'échelle), `RACE` (tête + équipement par classe), armes `W_*`, `SPEC` (arme, posture, attaques), postures `ST`, actions `A2` (images clés), effets `onEvent`, gestes de sort `SPELL_ACT`.
- `ui.js` — écrans (hub, roster, journal, combat, rapport, butin), HUD MMO, sélection au doigt, ordres en file, groupes. Sauvegarde : `localStorage['escadre-astrale-v5']`.
- `body.html`, `style.css` — écrans et HUD.
- `assets/` — modèle de base `trooper.json` (glTF Mixamo, quantifié KHR), boss `colossus.json`, textures.
- `vendor/` — three.js r128 (+ exemples) et polices, utilisés par la PWA et les tests.

## Gameplay validé (ne pas changer sans demander)
- Le raid lead est invisible ; temps réel, pas de pause tactique. **Raids de 10 joueurs.**
- Toucher persos/cadres = sélection, toucher le sol = déplacement, toucher un ennemi = ordre d'attaque. Ordres en file (« File »), groupes mémorisés (appui long). Après un ordre les persos recollent au combat ; sans ordre ils subissent.
- Barre de sorts alimentée par les classes présentes. Recharges seulement ; **charges = porteurs vivants**. Le sort part du porteur le plus proche vers la cible choisie.
- Un mode de soin par soigneur. Rez en combat seulement si la compo a la classe.
- Durée selon la difficulté ; 4 familles de mécaniques gérées au placement.
- Progression : apprentissage, compo/placement, butin/talents.

## Direction artistique validée
- Paysage, UI MMO classique, densité moyenne ; lisibilité « qui est qui » ; DA lumineuse et épique.
- **Une race par classe**, style et animations propres :
  - Gardien (humain, tank, or/blanc, lame d'énergie + bouclier de lumière)
  - Titan (géant, tank, rouille/rouge, marteau + pavois)
  - Médic (droïde, soin, vert/blanc)
  - Séraphe (alien mystique, soin, violet/ambre)
  - Marée (amphibien, soin, turquoise)
  - Lame-ombre (reptilien, DPS mêlée, 2 sabres à une main, noir/vert acide)
  - Fracasseur (félin, DPS mêlée, grosse arme à deux mains, indigo/argent)
  - Spectre (cyborg sniper, DPS distance, bleu acier/rouge)
  - Bricoleur (petit ingénieur, canon, DPS distance, orange/laiton)
- Limite connue : toutes les races partagent le corps du `trooper` ; la race se lit par la tête (l'originale est repliée), l'équipement, la taille, la posture.

## Feuille de route
1. Moteur et contrôles — **fait, validé**.
2. Les 9 classes — **faites, validées**.
3. Étape en cours, une sous-étape validée en images à la fois :
   1. Explications des sorts — bulle (`spellTip` dans `ui.js`, champ `how` des sorts dans `data.js`) : toucher dans l'équipe et au placement, appui long en combat (le combat continue, le sort n'est pas lancé). Test : `node test/tips.js`.
   2. Réglage Mythique — **cible : ~3/6 victoires au bot `good`** pour chaque boss. Fait (en attente de validation) : surcharges `m` dans `data.js` (Vorr : Onde 15 000 ; Jumelles : Éruption à 3 s ; Nyxar : Chant à 2,2 s ; Azhal : Singularité 12 s, 4 météores, Convergence 100 000, montée de la Faim 3/s). Les phases acceptent aussi des surcharges `h` / `m` (`resolveBoss`). Le bot `good` joue maintenant le Séisme du Titan sur les Gardiens du Vide et les emmène loin du centre.
   3. **Une arène par boss.**
   4. **Boss réécrits = modèles 3D, animations et mécaniques**, beaucoup plus poussés et visuels.
   5. Talents (rien n'existe encore) : proposer le système sur papier avant de coder.
4. Finitions + PWA (`build_pwa.py`) et mise en ligne (dépôt privé : pas de GitHub Pages gratuit, à décider).

Équilibrage mesuré au bot `good` (60 essais, `node test/bot5.js <diff> 60 good`) : Normal 100 % partout (~2:40–3:10) ; Héroïque 100 % partout (~4:00–4:50) ; Mythique : Vorr 29/60, Jumelles 29/60, Nyxar 31/60, Azhal 31/60 (~3/6). Bot `ok` en Mythique : 0 à 5 %. Raid lead passif = défaite partout (voulu).
Attention : Vorr Mythique est un seuil de soins très net (Onde à 14 750 → 87 % de victoires, à 15 000 → 48 %, à 15 500 → 23 %). À revoir avec la réécriture des boss.

## Pièges techniques connus
- Accessoires « skinnés » sur le squelette (`skinAccessories`) : en mode attaché, three recalcule `bindMatrixInverse` à chaque image ; la matrice de cuisson est `M = B⁻¹ · Bi⁻¹ · Bw⁻¹ · Ow`. (Bug v4 corrigé : équipements invisibles.)
- Tête retirée (`headlessGeo`) : décoder positions Int16 normalisées (/32767) et poids Uint8 (/255) avant de replier les sommets de la tête.
- Les pistes d'échelle des animations du trooper sont supprimées au chargement (sinon impossible de mettre des os à l'échelle par race).
- `buildAccessories` : la branche `RACE[c]` doit passer **avant** les anciennes branches (nom `medic` en commun).
- Soleil vers +x / −z : filmer dos au soleil (sinon reflets et halo sur le sol).
- Dans les scripts de test, ne pas tuer de processus par motif (`pkill -f`) : tuer par PID.

## Outils de rendu (validation visuelle)
- `test/portrait.js outDir classes [w h vues]` — vues face/trois-quarts/dos/tête au banc d'essai.
- `test/actions.js outDir '{"titan":[["tSmash",0.42]]}'` — gestes figés.
- `test/recall.js outDir fps [segments]` — vidéo vitrine des 9 classes en combat (images → `ffmpeg -framerate 15 -i %04d.jpg -c:v libx264 -preset veryfast -crf 25 -pix_fmt yuv420p out.mp4`).
- `tools/sheet.py out.jpg "TITRE" "sous-titre" img:légende …` — planche légendée (demande Pillow et des polices DejaVu : absent sur le Mac de Bastien).
- `test/tips.js [outDir]` — bulles d'explication des sorts (équipe, placement, appui long en combat), avec vérifications.
