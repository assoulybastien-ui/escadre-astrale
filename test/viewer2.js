const { open } = require('./serve.js');
const fs = require('fs');
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#000}canvas{display:block}</style></head><body>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/SkeletonUtils.js"></script>
<script>window.MODEL=${JSON.stringify(process.env.MODEL||'')};</script><script>${fs.readFileSync(__dirname + '/proto.js', 'utf8')}</script></body></html>`;
(async () => {
  const { browser, page, errs } = await open({ html, width: 800, height: 600 });
  await page.waitForFunction(() => window.done, null, { timeout: 90000 }).catch(() => {});
  await page.screenshot({ path: __dirname + '/v2.png' });
  console.log(errs.join('\n'));
  await browser.close();
})();
