# Life With You

Jeu 3D de **speed riding** pour iPhone (web app, en paysage). On s'élance à skis, la voile se gonfle, on saute d'une falaise
et on dévale la montagne en se balançant d'un virage à l'autre pour frôler la neige, jusqu'à 90 km/h en spirale. Il faut passer les portes et le télésiège, slalomer entre les sapins,
puis se poser dans la cible.

**Deux poignées de frein, une par pouce**, comme un vrai pilote (téléphone à l'horizontale) :
- pouce droit vers le bas : tu tires la poignée droite, la voile tourne à droite, sans limite (tenue, elle part en spirale jusqu'au sol)
- pouce gauche vers le bas : pareil à gauche
- les deux : tu freines, tu remontes, tu arrondis pour te poser
- mains hautes (pouces relâchés) : pleine vitesse

La physique est celle d'une vraie voile de speed riding de 9,5 m² : 71 km/h mains hautes, 44 km/h freins à fond,
une finesse de 2,7, une spirale à 90 km/h, un décrochage si l'on freine trop longtemps, et l'énergie qui se conserve.

## Version 0.4 : la physique d'abord (portes mises de côté)
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
