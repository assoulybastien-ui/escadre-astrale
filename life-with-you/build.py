"""Construit Life With You.
- index.html          : page complète (navigateur, GitHub Pages)
- dist/artifact.html  : même page sans <html>/<head> (publication en Artifact claude.ai)
three.js r128 est chargé depuis cdnjs ; tout le reste est inclus dans la page."""
import pathlib, re
root = pathlib.Path(__file__).parent; src = root / 'src'
ORDER = ['noise.js', 'world.js', 'flight.js', 'game.js', 'bot.js', 'render.js', 'audio.js', 'ui.js', 'main.js']
js = '\n'.join(re.sub(r"^if \(typeof module !== 'undefined'\).*$", '', (src / f).read_text(), flags=re.M) for f in ORDER)
css = (src / 'style.css').read_text(); body = (src / 'body.html').read_text()
THREE = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
FONTS = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&family=Big+Shoulders+Display:wght@800;900&display=swap'
DESC = "Speed riding en 3D : saute, frôle la pente à plus de 90 km/h, passe les portes et pose-toi dans la cible."
head = f'''<title>Life With You</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="{DESC}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<style>
{css}
</style>'''
tail = f'''<script src="{THREE}"></script>
<script>
{js}
</script>
'''
frag = head + '\n' + body + '\n' + tail
full = f'''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Life With You">
<meta name="theme-color" content="#0a1520">
{head}
</head>
<body>
{body}
{tail}</body>
</html>
'''
(root / 'index.html').write_text(full)
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist' / 'artifact.html').write_text(frag)
print('ok', len(full) // 1024, 'Ko')
