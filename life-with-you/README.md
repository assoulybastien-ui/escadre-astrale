# Life With You

Jeu 3D de **speed riding** pour iPhone (web app, en paysage). On s'élance à skis, la voile se gonfle, on décolle
et on dévale la montagne en frôlant la neige à plus de 90 km/h. Il faut passer les portes et le télésiège, slalomer entre les sapins,
puis se poser dans la cible.

**Un seul contrôle** : un stick qui apparaît sous le pouce.
- haut : piquer et accélérer
- bas : freiner, remonter, arrondir
- côtés : tourner

La physique est celle d'une vraie voile de vitesse de 11 m² : 57 km/h bras hauts, 96 km/h accélérateur à fond,
une finesse de 3,5, et l'énergie qui se conserve.

## Version 0.1 : prototype « sensations »
- Une descente générée, le **Couloir des Aiguilles** : 1 km, ~390 m de dénivelé, 8 portes, un télésiège, une forêt, un village et une cible.
- Score : proximité × vitesse × combo, portes, touch & go, sapins frôlés, passage sous le câble, atterrissage noté (précision et douceur).
- Médailles, record et **fantôme** du meilleur passage.
- Sons réalistes synthétisés, sans musique.

## Construire
```
python3 build.py      # → index.html (+ dist/artifact.html)
```
Ouvrir `index.html` dans un navigateur. Sur ordinateur : flèches ou ZQSD, Échap pour la pause, Espace pour rejouer.

Les tests et l'architecture sont décrits dans `CLAUDE.md`.
