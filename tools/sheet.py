# Planche de validation d'une classe : vues + gestes, légendées
# usage : python3 tools/sheet.py out.jpg "TITRE" "sous-titre" img1:label1 img2:label2 ...
import sys
from PIL import Image, ImageDraw, ImageFont
out, title, sub = sys.argv[1], sys.argv[2], sys.argv[3]
items = [a.split(':', 1) for a in sys.argv[4:]]
B = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
R = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
cols = 3 if len(items) > 4 else len(items)
rows = (len(items) + cols - 1) // cols
cw, ch = 480, 480
W, H = cols * cw + (cols + 1) * 12, 92 + rows * (ch + 40) + 12
img = Image.new('RGB', (W, H), (10, 12, 20))
d = ImageDraw.Draw(img)
d.text((16, 14), title, font=ImageFont.truetype(B, 34), fill=(242, 214, 140))
d.text((18, 58), sub, font=ImageFont.truetype(R, 18), fill=(200, 210, 235))
fl = ImageFont.truetype(B, 18)
for k, (path, label) in enumerate(items):
    c, r = k % cols, k // cols
    x, y = 12 + c * (cw + 12), 92 + r * (ch + 40)
    im = Image.open(path).convert('RGB')
    s = max(cw / im.width, ch / im.height); im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    im = im.crop(((im.width - cw) // 2, (im.height - ch) // 2, (im.width - cw) // 2 + cw, (im.height - ch) // 2 + ch))
    img.paste(im, (x, y))
    d.rectangle([x - 1, y - 1, x + cw, y + ch], outline=(107, 84, 38), width=2)
    d.text((x + 2, y + ch + 8), label, font=fl, fill=(233, 238, 255))
img.save(out, quality=90)
print(out, img.size)
