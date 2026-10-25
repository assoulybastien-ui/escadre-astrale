# Icône et écrans de démarrage d'Escadre Astrale (rendu numpy, sans dépendance externe)
import numpy as np, sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = sys.argv[1]
FONTS = sys.argv[2]
os.makedirs(OUT, exist_ok=True)

def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def noise(h, w, seed, octaves=5):
    rng = np.random.default_rng(seed); acc = np.zeros((h, w)); amp = 1; tot = 0
    for o in range(octaves):
        s = 2 ** (o + 2)
        g = rng.random((s + 1, s + 1))
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        acc += amp * np.asarray(im, dtype=np.float32) / 255; tot += amp; amp *= 0.55
    return acc / tot

def emblem(S, cx, cy, R, H, W, seed=3):
    """Renvoie une image HDR (H,W,3) : nébuleuse + anneau d'accrétion + étoile + chevrons."""
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    img = np.zeros((H, W, 3), np.float32)
    # fond : vide profond avec nébuleuse violette/cyan, vignette marquée pour faire ressortir l'emblème
    d = np.hypot((x - cx) / R, (y - cy) / R)
    n = noise(H, W, seed); n2 = noise(H, W, seed + 7)
    neb = smooth(0.42, 0.9, n) * np.exp(-d * 0.95)
    img += np.dstack([0.012, 0.014, 0.032])
    img += neb[..., None] * np.array([0.26, 0.08, 0.50]) * 0.75
    img += (smooth(0.55, 0.92, n2) * np.exp(-d * 1.1))[..., None] * np.array([0.04, 0.24, 0.40]) * 0.5
    # étoiles
    rng = np.random.default_rng(seed + 11)
    stars = np.zeros((H, W), np.float32)
    k = int(W * H / 2600)
    sx, sy = rng.integers(0, W, k), rng.integers(0, H, k)
    stars[sy, sx] = rng.random(k) ** 3 * 2.2
    st = Image.fromarray(np.clip(stars * 120, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(max(0.6, R / 700)))
    img += (np.asarray(st, np.float32) / 120)[..., None] * np.array([0.8, 0.9, 1.0]) * 0.8
    # anneau d'accrétion incliné : moitié arrière d'abord, étoile, puis moitié avant qui passe devant
    a = np.deg2rad(-16)
    u = ((x - cx) * np.cos(a) + (y - cy) * np.sin(a)) / R
    v = (-(x - cx) * np.sin(a) + (y - cy) * np.cos(a)) / R
    re = np.hypot(u, v / 0.30)
    ring = np.exp(-((re - 0.80) / 0.028) ** 2)
    halo = np.exp(-((re - 0.80) / 0.13) ** 2) * 0.28
    ang = np.arctan2(v, u)
    hot = 0.5 + 0.5 * np.cos(ang - 2.8)   # côté brillant (Doppler)
    ringc = hot[..., None] * np.array([1.0, 0.78, 0.45]) + (1 - hot[..., None]) * np.array([0.30, 0.62, 1.0])
    rl = (ring * 1.9 + halo)[..., None] * ringc * (0.45 + 0.75 * hot[..., None])
    front = smooth(-0.02, 0.02, v)
    img += rl * (1 - front[..., None])
    # étoile à quatre branches (astral) ambre
    dx, dy = (x - cx) / R, (y - cy) / R
    r = np.hypot(dx, dy) + 1e-6
    spikeV = np.exp(-np.abs(dx) / (0.016 + 0.085 * np.maximum(0, 0.62 - np.abs(dy)))) * smooth(0.70, 0.0, np.abs(dy))
    spikeH = np.exp(-np.abs(dy) / (0.014 + 0.065 * np.maximum(0, 0.48 - np.abs(dx)))) * smooth(0.52, 0.0, np.abs(dx))
    diag = np.exp(-np.abs(np.abs(dx) - np.abs(dy)) / 0.012) * smooth(0.26, 0.0, r) * 0.5
    core = np.exp(-(r / 0.07) ** 2) * 3.5 + np.exp(-(r / 0.24) ** 2) * 0.7
    star = np.clip(spikeV + spikeH, 0, 1.6) * 1.5 + diag + core
    amber = np.array([1.0, 0.70, 0.28])
    img += star[..., None] * amber * 1.25
    img += (np.exp(-(r / 0.05) ** 2) * 3)[..., None]  # coeur blanc
    # moitié avant : masque légèrement l'étoile puis s'ajoute
    cover = np.clip(ring * 1.2, 0, 1) * front * 0.55
    img *= (1 - cover[..., None])
    img += rl * front[..., None]
    # vignette
    ey = (y - H / 2) / (H / 2); ex = (x - W / 2) / (W / 2)
    img *= (1 - 0.55 * smooth(0.55, 1.45, np.hypot(ex, ey)))[..., None]
    # chevrons d'escadre sous l'emblème
    for i in range(3):
        yy = cy + R * (0.86 + i * 0.12)
        w_ = R * (0.26 - i * 0.045)
        t_ = R * 0.028
        dist = np.abs((y - yy) + np.abs(x - cx) * 0.55) - t_
        m = smooth(R * 0.012, -R * 0.012, dist) * smooth(w_ + R * 0.01, w_ - R * 0.01, np.abs(x - cx))
        img += m[..., None] * amber * (1.4 - i * 0.3)
        glow = np.exp(-np.maximum(dist, 0) / (R * 0.05)) * smooth(w_ * 1.3, w_ * 0.6, np.abs(x - cx)) * 0.25
        img += glow[..., None] * amber * 0.6
    return img

def tonemap(img, exposure=1.0):
    c = img * exposure
    a, b, cc, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
    c = np.clip((c * (a * c + b)) / (c * (cc * c + d) + e), 0, 1)
    c = np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)
    return Image.fromarray((np.clip(c, 0, 1) * 255 + 0.5).astype(np.uint8))

def bloom(img, R):
    lum = np.clip(img - 0.9, 0, None)
    out = img.copy()
    for rad, wgt in [(R * 0.02, 0.5), (R * 0.06, 0.35), (R * 0.15, 0.25)]:
        ch = []
        for k in range(3):
            m = lum[..., k].max() + 1e-6
            im = Image.fromarray((lum[..., k] / m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(rad))
            ch.append(np.asarray(im, np.float32) / 255 * m)
        out += np.dstack(ch) * wgt
    return out

# --- icône 1024 (pleine, iOS arrondit lui-même) ---
S = 1024
ico = bloom(emblem(S, S * 0.5, S * 0.40, S * 0.40, S, S), S * 0.40)
icon = tonemap(ico, 1.0)
icon.save(f'{OUT}/icon-1024.png')
for s in (180, 192, 512):
    icon.resize((s, s), Image.LANCZOS).save(f'{OUT}/icon-{s}.png', optimize=True)
# version « maskable » : emblème réduit dans la zone sûre (80 %)
mk = bloom(emblem(S, S * 0.5, S * 0.42, S * 0.30, S, S, seed=3), S * 0.30)
tonemap(mk, 1.0).resize((512, 512), Image.LANCZOS).save(f'{OUT}/icon-maskable-512.png', optimize=True)

# --- écrans de démarrage iPhone (portrait) ---
title_font = os.path.join(FONTS, 'michroma.ttf')
sub_font = os.path.join(FONTS, 'chakra600.ttf')
for (W, H) in [(1179, 2556), (1290, 2796)]:
    sc = 0.5  # rendu à mi-résolution puis agrandi : le fond est flou de toute façon
    w, h = int(W * sc), int(H * sc)
    R = w * 0.30
    im = tonemap(bloom(emblem(w, w * 0.5, h * 0.40, R, h, w, seed=5), R), 1.0).resize((W, H), Image.LANCZOS)
    dr = ImageDraw.Draw(im)
    f1 = ImageFont.truetype(title_font, int(W * 0.062))
    f2 = ImageFont.truetype(sub_font, int(W * 0.034))
    yT = int(H * 0.40 + W * 0.30 * 1.55)
    for txt, f, col, yy, sp in [('ESCADRE', f1, (233, 238, 255), yT, 0.18), ('ASTRALE', f1, (255, 191, 90), yT + int(W * 0.085), 0.18), ('CITADELLE DE VAEL-KOR', f2, (102, 216, 255), yT + int(W * 0.19), 0.28)]:
        # espacement des lettres
        chars = list(txt); ws = [dr.textlength(c, font=f) for c in chars]
        extra = f.size * sp; tot = sum(ws) + extra * (len(chars) - 1)
        xx = (W - tot) / 2
        for c, cw in zip(chars, ws):
            dr.text((xx, yy), c, font=f, fill=col); xx += cw + extra
    im.save(f'{OUT}/splash-{W}x{H}.png', optimize=True)
print('ok')
