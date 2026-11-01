# Life With You

Jeu 3D de **speed riding** pour iPhone (web app, en paysage). On s'élance à skis, la voile se gonfle, on saute d'une falaise
et on dévale la montagne en se balançant d'un virage à l'autre pour frôler la neige, jusqu'à 90 km/h en spirale. Il faut passer les portes et le télésiège, slalomer entre les sapins,
puis se poser dans la cible.

**Deux poignées de frein, une par pouce**, comme un vrai pilote (téléphone à l'horizontale) :
- pouce droit vers le bas : tu tires la poignée droite, la voile tourne à droite, sans limite (tenue, elle part en spirale jusqu'au sol)
- pouce gauche vers le bas : pareil à gauche
- les deux : tu freines, tu remontes, tu arrondis pour te poser
- mains hautes (pouces relâchés) : pleine vitesse

La physique simule une vraie voile de speed riding de 9,5 m² et son pilote, reliés par les suspentes : portance et traînée selon l'angle d'attaque,
finesse ~3 à 72 km/h, 42 km/h freins à fond, balancement du pilote, abattée et ressource, spirale qui s'engage, décrochage, fermeture, effet de sol.

## Version 0.7 : rendu réaliste
- Lumière d'un vrai beau jour en montagne : soleil haut, ciel et brume lointaine calculés ensemble, ombres portées des parois, des sapins
  et des chalets (elles tombent aussi sur le pilote), ombres bleutées éclairées par le rebond de la neige.
- Neige ridée par le vent qui scintille au soleil, roche alpine (strates, fissures, neige sur les vires), épicéas enneigés, traces de skis.
- Pilote articulé (casque, masque, sellette, skis) : ses mains suivent les poignées, ses jambes amortissent, il se penche dans les virages.
- Voile translucide au soleil, élévateurs, suspentes fines. Image en HDR : halo, flou de vitesse au ras du sol, étalonnage, grain.

## Version 0.6 : physique à deux corps (voile + pilote reliés par les suspentes)
- Une descente générée, le **Couloir des Aiguilles** : départ d'une falaise, ~775 m, ~350 m de dénivelé, un télésiège, une forêt, un village et une cible (portes mises de côté pour l’instant).
- Score : proximité × vitesse × combo, touch & go, sapins frôlés, passage sous le câble, atterrissage noté (précision et douceur).
- Médailles, record et **fantôme** du meilleur passage.
- Sons réalistes synthétisés, sans musique.

## Construire
```
python3 build.py      # → index.html (+ dist/artifact.html)
```
Ouvrir `index.html` dans un navigateur. Sur ordinateur : ← frein gauche, → frein droit, ↓ les deux, Espace pour partir ou rejouer, Échap pour la pause.

Les tests et l'architecture sont décrits dans `CLAUDE.md`.
