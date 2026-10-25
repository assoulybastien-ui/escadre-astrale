# Construit la version « web app » installable (PWA) d'Escadre Astrale dans ../pwa
import pathlib, shutil, hashlib, json, re

root = pathlib.Path(__file__).parent; src = root / 'src'
OUT = root / 'docs'          # GitHub Pages : branche main, dossier /docs
VENDOR = root / 'vendor/three'
FONTS = root / 'vendor/fonts'

# --- nettoyage (on garde .git et les icônes déjà générées) ---
OUT.mkdir(exist_ok=True)
for p in OUT.iterdir():
    if p.name in ('.git', 'icons'): continue
    shutil.rmtree(p) if p.is_dir() else p.unlink()
if not (OUT / 'icons').exists(): shutil.copytree(root / 'pwa_icons', OUT / 'icons')

# --- three.js embarqué (plus de dépendance au CDN, fonctionne hors ligne) ---
EX = ['shaders/CopyShader.js', 'shaders/LuminosityHighPassShader.js', 'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js',
      'postprocessing/ShaderPass.js', 'postprocessing/UnrealBloomPass.js', 'loaders/GLTFLoader.js', 'utils/SkeletonUtils.js']
(OUT / 'vendor/three').mkdir(parents=True)
shutil.copy(VENDOR / 'three.min.js', OUT / 'vendor/three/three.min.js')
libs = ['vendor/three/three.min.js']
for f in EX:
    d = OUT / 'vendor/three' / f; d.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(VENDOR / f, d); libs.append('vendor/three/' + f)
shutil.copy(VENDOR / 'LICENSE', OUT / 'vendor/three/LICENSE')

# --- polices embarquées ---
(OUT / 'fonts').mkdir()
fontfaces = []
for fam, pkg, slug, weights in [('Chakra Petch', 'fontsource-chakra-petch-5.3.0', 'chakra-petch', [400, 500, 600, 700]),
                                ('Michroma', 'fontsource-michroma-5.3.0', 'michroma', [400]),
                                ('Share Tech Mono', 'fontsource-share-tech-mono-5.3.0', 'share-tech-mono', [400])]:
    for w in weights:
        fn = f'{slug}-latin-{w}-normal.woff2'
        shutil.copy(FONTS / fn, OUT / 'fonts' / fn)
        fontfaces.append(f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{w};font-display:swap;src:url(fonts/{fn}) format('woff2')}}")
    shutil.copy(FONTS / f'{slug}-OFL.txt', OUT / 'fonts' / f'{slug}-OFL.txt')

# --- ressources du jeu ---
(OUT / 'assets').mkdir()
for f in sorted((root / 'assets').iterdir()):
    if f.suffix in ('.json', '.jpg'): shutil.copy(f, OUT / 'assets' / f.name)

# --- code du jeu ---
css = (src / 'style.css').read_text(); body = (src / 'body.html').read_text()
data = (src / 'data.js').read_text().replace("if (typeof module !== 'undefined') module.exports = DATA;", "")
engine = (src / 'engine.js').read_text().replace("if (typeof module !== 'undefined') module.exports = GAME;", "")
render = (src / 'render.js').read_text().replace('/*@@CHARS@@*/', (src / 'chars.js').read_text())
ui = '\n'.join(l for l in (src / 'ui.js').read_text().split('\n') if 'window.__escadre' not in l)

PWA_JS = r'''
(function () {
  // Écran toujours allumé pendant qu'on joue (iOS 16.4+ ; ignoré sinon)
  let wl = null;
  async function lock() { try { if ('wakeLock' in navigator && !wl && document.visibilityState === 'visible') { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); } } catch (e) {} }
  document.addEventListener('pointerdown', lock, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') lock(); });
  // Contexte 3D perdu (rare, pression mémoire iOS) : on recharge proprement
  document.addEventListener('webglcontextlost', e => e.preventDefault(), true);
  document.addEventListener('webglcontextrestored', () => location.reload(), true);
  // Mode hors ligne : service worker enregistré une fois le jeu chargé (évite de tout télécharger deux fois)
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const had = !!navigator.serviceWorker.controller;
  let done = false;
  function reg() { if (done) return; done = true; navigator.serviceWorker.register('./sw.js').catch(() => {}); }
  const t0 = Date.now();
  (function wait() { if ((typeof R3 !== 'undefined' && R3.isReady && R3.isReady()) || Date.now() - t0 > 30000) reg(); else setTimeout(wait, 500); })();
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!had) return;
    const d = document.createElement('div');
    d.className = 'upd-toast';
    d.innerHTML = '<span>Nouvelle version installée.</span><button type="button">Relancer</button>';
    d.querySelector('button').onclick = () => location.reload();
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 12000);
  });
})();
'''
PWA_CSS = '''
.upd-toast { position: fixed; z-index: 99; left: 50%; transform: translateX(-50%); bottom: calc(env(safe-area-inset-bottom, 0px) + 14px); display: flex; gap: 12px; align-items: center; padding: 10px 12px 10px 16px; background: rgba(12,18,38,0.94); border: 1px solid rgba(150,205,255,0.5); color: #e9eeff; font: 500 14px 'Chakra Petch', system-ui, sans-serif; white-space: nowrap; }
.upd-toast button { font: 600 13px 'Chakra Petch', system-ui, sans-serif; color: #04050b; background: #ffbf5a; border: 0; padding: 7px 12px; }
html { -webkit-text-size-adjust: 100%; }
body { -webkit-touch-callout: none; touch-action: manipulation; }
'''

head = f'''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>Escadre Astrale</title>
<meta name="description" content="Jeu de raid lead en 3D : dirige dix héros face aux quatre gardiens de la Citadelle de Vael-Kor.">
<meta name="theme-color" content="#04050b">
<meta name="color-scheme" content="dark">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Escadre">
<meta name="format-detection" content="telephone=no">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="apple-touch-startup-image" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="icons/splash-1179x2556.png">
<link rel="apple-touch-startup-image" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="icons/splash-1290x2796.png">
<link rel="preload" href="fonts/chakra-petch-latin-500-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/michroma-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<style>
{chr(10).join(fontfaces)}
{css}
{PWA_CSS}
</style>
</head>
<body>
'''
html = head + body + '\n' + '\n'.join(f'<script src="{u}"></script>' for u in libs) + f'''
<script>
{data}
{engine}
</script>
<script>
{render}
</script>
<script>
{ui}
</script>
<script>
{PWA_JS}
</script>
</body>
</html>
'''
(OUT / 'index.html').write_text(html)

manifest = {
    'id': './', 'name': 'Escadre Astrale', 'short_name': 'Escadre', 'lang': 'fr',
    'description': 'Jeu de raid lead en 3D : dirige dix héros face aux quatre gardiens de la Citadelle de Vael-Kor.',
    'start_url': './', 'scope': './', 'display': 'standalone', 'orientation': 'any',
    'background_color': '#04050b', 'theme_color': '#04050b', 'categories': ['games'],
    'icons': [{'src': 'icons/icon-192.png', 'sizes': '192x192', 'type': 'image/png'},
              {'src': 'icons/icon-512.png', 'sizes': '512x512', 'type': 'image/png'},
              {'src': 'icons/icon-maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'}],
}
(OUT / 'manifest.webmanifest').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))

# --- service worker : tout est mis en cache, le jeu marche ensuite sans réseau ---
files = ['index.html', 'manifest.webmanifest'] + libs + \
        [f'fonts/{p.name}' for p in sorted((OUT / 'fonts').glob('*.woff2'))] + \
        [f'assets/{p.name}' for p in sorted((OUT / 'assets').iterdir())] + \
        ['icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png']
h = hashlib.sha256()
for f in files: h.update(f.encode()); h.update((OUT / f).read_bytes())
VERSION = h.hexdigest()[:10]
sw = f'''// Escadre Astrale — service worker (version {VERSION})
const CACHE = 'escadre-{VERSION}';
const FILES = {json.dumps(['./'] + files)};
const FRESH = new Set(['./', 'index.html', 'manifest.webmanifest']);
self.addEventListener('install', e => {{
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(new Request(f, FRESH.has(f) ? {{ cache: 'reload' }} : {{}}))))).then(() => self.skipWaiting()));
}});
self.addEventListener('activate', e => {{
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('escadre-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
}});
self.addEventListener('fetch', e => {{
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {{
    e.respondWith(caches.match('./', {{ cacheName: CACHE }}).then(r => r || fetch(req)).catch(() => fetch(req)));
    return;
  }}
  e.respondWith(caches.match(req, {{ ignoreSearch: true, cacheName: CACHE }}).then(r => r || fetch(req)));
}});
'''
(OUT / 'sw.js').write_text(sw)
(OUT / '.nojekyll').write_text('')

readme = '''# Escadre Astrale

Jeu de raid lead en 3D (univers galactique) : tu diriges dix héros, sans en incarner aucun, contre les quatre gardiens de la Citadelle de Vael-Kor. Version 1.0.

**Jouer :** https://assoulybastien-ui.github.io/escadre-astrale/

## Installer sur iPhone
1. Ouvre le lien ci-dessus dans **Safari**.
2. Attends la fin du chargement (barre de progression), puis touche **Partager** → **Sur l'écran d'accueil** → **Ajouter**.
3. Lance le jeu depuis l'icône : plein écran, et il fonctionne ensuite hors ligne.

## Crédits
- Moteur 3D : [three.js](https://threejs.org) r128 (licence MIT, voir `vendor/three/LICENSE`).
- Personnages et colosses : modèles et animations [Mixamo](https://www.mixamo.com) (Adobe), retravaillés. Usage personnel ; ces modèles ne sont pas redistribuables seuls.
- Polices : Chakra Petch, Michroma, Share Tech Mono (SIL Open Font License, voir `fonts/`).
- Textures, effets, icône, code et contenu du jeu : créés pour ce projet.
'''
(OUT / 'README.md').write_text(readme)

tot = sum(p.stat().st_size for p in OUT.rglob('*') if p.is_file() and '.git' not in p.parts)
print('ok', VERSION, len(files), 'fichiers en cache', f'{tot/1e6:.1f} Mo au total', f'index {len(html)//1024} Ko')
