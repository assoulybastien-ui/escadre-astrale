// Escadre Astrale — service worker (version d5b37d0b9f)
const CACHE = 'escadre-d5b37d0b9f';
const FILES = ["./", "index.html", "manifest.webmanifest", "vendor/three/three.min.js", "vendor/three/shaders/CopyShader.js", "vendor/three/shaders/LuminosityHighPassShader.js", "vendor/three/postprocessing/EffectComposer.js", "vendor/three/postprocessing/RenderPass.js", "vendor/three/postprocessing/ShaderPass.js", "vendor/three/postprocessing/UnrealBloomPass.js", "vendor/three/loaders/GLTFLoader.js", "vendor/three/utils/SkeletonUtils.js", "fonts/chakra-petch-latin-400-normal.woff2", "fonts/chakra-petch-latin-500-normal.woff2", "fonts/chakra-petch-latin-600-normal.woff2", "fonts/chakra-petch-latin-700-normal.woff2", "fonts/michroma-latin-400-normal.woff2", "fonts/share-tech-mono-latin-400-normal.woff2", "assets/colossus.json", "assets/floor_albedo.jpg", "assets/floor_emissive.jpg", "assets/floor_normal.jpg", "assets/floor_orm.jpg", "assets/hull_albedo.jpg", "assets/hull_emissive.jpg", "assets/hull_height.jpg", "assets/hull_normal.jpg", "assets/hull_orm.jpg", "assets/rock_albedo.jpg", "assets/rock_emissive.jpg", "assets/rock_height.jpg", "assets/rock_normal.jpg", "assets/rock_orm.jpg", "assets/trooper.json", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"];
const FRESH = new Set(['./', 'index.html', 'manifest.webmanifest']);
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(new Request(f, FRESH.has(f) ? { cache: 'reload' } : {}))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('escadre-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./', { cacheName: CACHE }).then(r => r || fetch(req)).catch(() => fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true, cacheName: CACHE }).then(r => r || fetch(req)));
});
