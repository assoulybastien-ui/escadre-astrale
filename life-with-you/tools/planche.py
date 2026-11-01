# Planche légendée de captures en paysage. usage : python3 tools/planche.py out.jpg "TITRE" "sous-titre" img:légende ...
import sys
from PIL import Image, ImageDraw, ImageFont
out, title, sub = sys.argv[1], sys.argv[2], sys.argv[3]
items = [a.split(':', 1) for a in sys.argv[4:]]
B = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
R = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
import os
cols = int(os.environ.get('COLS', 3 if len(items) > 4 else 2))
rows = (len(items) + cols - 1) // cols
cw, ch, gap = 568, 262, 14
W, H = cols * cw + (cols + 1) * gap, 96 + rows * (ch + 40) + gap
img = Image.new('RGB', (W, H), (10, 21, 32))
d = ImageDraw.Draw(img)
d.text((gap + 2, 16), title, font=ImageFont.truetype(B, 34), fill=(255, 91, 31))
d.text((gap + 4, 60), sub, font=ImageFont.truetype(R, 18), fill=(190, 205, 220))
fl = ImageFont.truetype(B, 18)
for k, (path, label) in enumerate(items):
    c, r = k % cols, k // cols
    x, y = gap + c * (cw + gap), 96 + r * (ch + 40)
    im = Image.open(path).convert('RGB').resize((cw, ch), Image.LANCZOS)
    img.paste(im, (x, y))
    d.text((x + 2, y + ch + 8), label, font=fl, fill=(242, 246, 250))
img.save(out, quality=88)
print(out, img.size)
