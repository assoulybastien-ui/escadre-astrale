import pathlib
root = pathlib.Path(__file__).parent; src = root / 'src'
css = (src/'style.css').read_text(); body = (src/'body.html').read_text()
data = (src/'data.js').read_text().replace("if (typeof module !== 'undefined') module.exports = DATA;", "")
engine = (src/'engine.js').read_text().replace("if (typeof module !== 'undefined') module.exports = GAME;", "")
render = (src/'render.js').read_text().replace('/*@@CHARS@@*/', (src / 'chars.js').read_text()); ui = (src/'ui.js').read_text()
EX = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/'
libs = ['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'] + [EX + f for f in ['shaders/CopyShader.js', 'shaders/LuminosityHighPassShader.js', 'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js', 'postprocessing/ShaderPass.js', 'postprocessing/UnrealBloomPass.js', 'loaders/GLTFLoader.js', 'utils/SkeletonUtils.js']]
html = f'''<title>Escadre Astrale</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Jeu de raid lead en 3D : dirige dix héros face aux quatre gardiens de la Citadelle de Vael-Kor.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Michroma&family=Share+Tech+Mono&display=swap">
<style>
{css}
</style>
{body}
''' + '\n'.join(f'<script src="{u}"></script>' for u in libs) + f'''
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
'''
(root/'index.html').write_text(html)
print('ok', len(html)//1024, 'KB')
