# Génère des textures PBR tuilables (albédo, normales, ORM, émission) pour l'arène
import numpy as np
from PIL import Image, ImageFilter
rng = np.random.default_rng(7)
OUT = '/home/claude/escadre/v3/assets/'
N = 1024

def blur(a, r):
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255

def fblur(a, r):  # flottant, tuilable (wrap)
    pad = int(r * 3) + 2
    p = np.pad(a, pad, mode='wrap')
    k = np.arange(-pad, pad + 1); g = np.exp(-(k ** 2) / (2 * r * r)); g /= g.sum()
    p = np.apply_along_axis(lambda m: np.convolve(m, g, 'same'), 0, p)
    p = np.apply_along_axis(lambda m: np.convolve(m, g, 'same'), 1, p)
    return p[pad:-pad, pad:-pad]

def value_noise(n, cells, octaves=5, seed=0):
    r = np.random.default_rng(seed); out = np.zeros((n, n), np.float32); amp = 1; tot = 0
    for o in range(octaves):
        c = cells * (2 ** o)
        g = r.random((c, c)).astype(np.float32)
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((n, n), Image.BICUBIC)
        # tuilable : on mélange avec le décalage
        a = np.asarray(im).astype(np.float32) / 255
        out += a * amp; tot += amp; amp *= 0.5
    return out / tot

def tileable_noise(n, cells, octaves=5, seed=0):
    r = np.random.default_rng(seed); out = np.zeros((n, n), np.float32); amp = 1; tot = 0
    for o in range(octaves):
        c = cells * (2 ** o)
        g = r.random((c, c)).astype(np.float32)
        g = np.tile(g, (3, 3))
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((n * 3, n * 3), Image.BICUBIC)
        a = np.asarray(im).astype(np.float32)[n:2 * n, n:2 * n] / 255
        out += a * amp; tot += amp; amp *= 0.5
    return out / tot

def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    nz = np.ones_like(h)
    l = np.sqrt(dx * dx + dy * dy + nz * nz)
    nx, ny, nz = -dx / l, dy / l, nz / l
    return np.stack([nx * 0.5 + 0.5, ny * 0.5 + 0.5, nz * 0.5 + 0.5], -1)

def save_rgb(a, name, q=90):
    im = Image.fromarray(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8))
    if name.endswith('.jpg'): im.save(OUT + name, quality=q, optimize=True)
    else: im.save(OUT + name, optimize=True)

def rect(h, x0, y0, x1, y1, val, bevel=4, mode='max'):
    # plateau biseauté (x1,y1 exclus), avec repli torique
    w = x1 - x0; hh = y1 - y0
    yy, xx = np.mgrid[0:hh, 0:w].astype(np.float32)
    d = np.minimum(np.minimum(xx + 0.5, w - xx - 0.5), np.minimum(yy + 0.5, hh - yy - 0.5))
    v = val * np.clip(d / bevel, 0, 1)
    ys = (np.arange(y0, y1) % N)[:, None]; xs = (np.arange(x0, x1) % N)[None, :]
    if mode == 'max': h[ys, xs] = np.maximum(h[ys, xs], v)
    elif mode == 'set': h[ys, xs] = v
    elif mode == 'add': h[ys, xs] += v
    elif mode == 'sub': h[ys, xs] -= v

# ================= SOL : panneaux de pont =================
def floor():
    H = np.zeros((N, N), np.float32)        # hauteur
    pid = np.zeros((N, N), np.float32)      # identifiant de panneau (variation teinte)
    E = np.zeros((N, N), np.float32)        # émission
    gap = 6
    # 4x4 grands panneaux, certains subdivisés
    S = N // 4
    for gy in range(4):
        for gx in range(4):
            x0, y0 = gx * S, gy * S
            kind = rng.integers(0, 4)
            if kind == 0:
                rect(H, x0 + gap, y0 + gap, x0 + S - gap, y0 + S - gap, 0.7, 6)
                pid[y0:y0 + S, x0:x0 + S] = rng.random()
            elif kind == 1:
                for sy in range(2):
                    for sx in range(2):
                        s = S // 2
                        rect(H, x0 + sx * s + gap, y0 + sy * s + gap, x0 + (sx + 1) * s - gap, y0 + (sy + 1) * s - gap, 0.62 + rng.random() * 0.12, 5)
                        pid[y0 + sy * s:y0 + (sy + 1) * s, x0 + sx * s:x0 + (sx + 1) * s] = rng.random()
            elif kind == 2:
                # panneau à grille d'aération
                rect(H, x0 + gap, y0 + gap, x0 + S - gap, y0 + S - gap, 0.66, 6)
                pid[y0:y0 + S, x0:x0 + S] = rng.random()
                m = 40
                for i in range(9):
                    yy = y0 + m + i * ((S - 2 * m) // 9)
                    rect(H, x0 + m, yy, x0 + S - m, yy + 10, 0.5, 3, 'sub')
            else:
                # panneau avec bande lumineuse centrale
                rect(H, x0 + gap, y0 + gap, x0 + S - gap, y0 + S // 2 - 8, 0.68, 6)
                rect(H, x0 + gap, y0 + S // 2 + 8, x0 + S - gap, y0 + S - gap, 0.68, 6)
                pid[y0:y0 + S, x0:x0 + S] = rng.random()
                E[y0 + S // 2 - 3:y0 + S // 2 + 3, x0 + 30:x0 + S - 30] = 1
            # rivets aux coins
            for (cx, cy) in [(x0 + 22, y0 + 22), (x0 + S - 22, y0 + 22), (x0 + 22, y0 + S - 22), (x0 + S - 22, y0 + S - 22)]:
                yy, xx = np.mgrid[-7:8, -7:8]
                d = np.sqrt(xx ** 2 + yy ** 2)
                bump = np.clip(1 - d / 6, 0, 1) ** 0.6 * 0.18
                ys = (cy + yy) % N; xs = (cx + xx) % N
                H[ys, xs] = np.maximum(H[ys, xs], H[ys, xs] * (d > 6) + (H[ys, xs] + bump) * (d <= 6))
    # micro-détail
    n1 = tileable_noise(N, 8, 6, 1)
    n2 = tileable_noise(N, 64, 3, 2)
    Hd = H + (n1 - 0.5) * 0.04 + (n2 - 0.5) * 0.02
    # rayures
    scr = np.zeros((N, N), np.float32)
    for i in range(500):
        x, y = rng.random() * N, rng.random() * N
        a = rng.normal(0.2, 0.6); L = rng.random() * 60 + 10
        for t in np.linspace(0, L, int(L)):
            xi, yi = int(x + np.cos(a) * t) % N, int(y + np.sin(a) * t) % N
            scr[yi, xi] = max(scr[yi, xi], 0.6 + rng.random() * 0.4)
    scr = np.maximum(scr, fblur(scr, 0.6) * 0.8)
    Hd -= scr * 0.015
    nrm = normal_from_height(Hd, 9.0)
    # AO des joints
    ao = 1 - np.clip((fblur(H, 6) - H) * 3.0, 0, 1) * 0.7
    ao = ao * (0.85 + 0.15 * np.clip(H / 0.7, 0, 1))
    # couleurs
    base = np.array([0.20, 0.215, 0.24])
    tint = (pid - 0.5)[..., None] * np.array([0.05, 0.05, 0.06])
    alb = base + tint + (n1 - 0.5)[..., None] * 0.06
    grime = np.clip(1 - ao, 0, 1)[..., None]
    alb = alb * (1 - grime * 0.6)
    edge = np.clip(np.abs(np.gradient(H)[0]) + np.abs(np.gradient(H)[1]), 0, 1)
    edge = np.clip(fblur(edge, 1.0) * 30, 0, 1)[..., None]
    alb = alb + edge * 0.10 + scr[..., None] * 0.12
    seam = (H < 0.05)[..., None]
    alb = np.where(seam, alb * 0.35, alb)
    rough = 0.38 + (n2 - 0.5) * 0.18 + (1 - ao) * 0.35 - scr * 0.15 + pid * 0.08
    rough = np.where(H < 0.05, 0.85, rough)
    metal = np.where(H < 0.05, 0.3, 0.88 - (1 - ao) * 0.3)
    E = np.maximum(E, (H < 0.03) * 0)  # joints éteints par défaut
    E = fblur(E, 1.2) * 1.0 + E
    E = np.clip(E, 0, 1)
    save_rgb(np.clip(alb, 0, 1), 'floor_albedo.jpg')
    save_rgb(nrm, 'floor_normal.jpg', 92)
    save_rgb(np.stack([np.clip(ao, 0, 1), np.clip(rough, 0.05, 1), np.clip(metal, 0, 1)], -1), 'floor_orm.jpg')
    save_rgb(np.stack([E, E, E], -1), 'floor_emissive.jpg', 85)

# ================= COQUE : panneaux de flanc (bords, pylônes, boss) =================
def hull():
    H = np.zeros((N, N), np.float32)
    pid = np.zeros((N, N), np.float32)
    E = np.zeros((N, N), np.float32)
    y = 0
    while y < N:
        hgt = int(rng.choice([64, 96, 128, 160]))
        if y + hgt > N: hgt = N - y
        x = 0
        while x < N:
            w = int(rng.choice([96, 128, 192, 256]))
            if x + w > N: w = N - x
            v = 0.55 + rng.random() * 0.25
            rect(H, x + 4, y + 4, x + w - 4, y + hgt - 4, v, 5)
            pid[y:y + hgt, x:x + w] = rng.random()
            if rng.random() < 0.18 and hgt > 60:
                E[y + hgt // 2 - 2:y + hgt // 2 + 2, x + 16:x + w - 16] = 1
            if rng.random() < 0.25 and w > 100:
                for k in range(4):
                    rect(H, x + 20 + k * 18, y + 14, x + 30 + k * 18, y + hgt - 14, 0.35, 2, 'sub')
            x += w
        y += hgt
    n1 = tileable_noise(N, 8, 6, 3); n2 = tileable_noise(N, 64, 3, 4)
    Hd = H + (n1 - 0.5) * 0.04 + (n2 - 0.5) * 0.015
    nrm = normal_from_height(Hd, 8.0)
    ao = 1 - np.clip((fblur(H, 5) - H) * 3.0, 0, 1) * 0.7
    base = np.array([0.30, 0.31, 0.34])
    alb = base + (pid - 0.5)[..., None] * 0.08 + (n1 - 0.5)[..., None] * 0.08
    alb = alb * (1 - np.clip(1 - ao, 0, 1)[..., None] * 0.6)
    alb = np.where((H < 0.05)[..., None], alb * 0.3, alb)
    rough = 0.32 + (n2 - 0.5) * 0.2 + (1 - ao) * 0.3 + pid * 0.1
    metal = np.where(H < 0.05, 0.3, 0.92)
    E = np.clip(fblur(E, 1.0) + E, 0, 1)
    save_rgb(np.clip(alb, 0, 1), 'hull_albedo.jpg')
    save_rgb(nrm, 'hull_normal.jpg', 92)
    save_rgb(np.stack([np.clip(ao, 0, 1), np.clip(rough, 0.05, 1), metal], -1), 'hull_orm.jpg')
    save_rgb(np.stack([E, E, E], -1), 'hull_emissive.jpg', 85)
    hh = (Hd - Hd.min()) / (Hd.max() - Hd.min()); save_rgb(np.stack([hh, hh, hh], -1), 'hull_height.jpg', 88)

# ================= ROCHE / ARMURE ANCIENNE (Vorr) =================
def rock():
    n = tileable_noise(N, 4, 7, 11); n2 = tileable_noise(N, 16, 5, 12)
    # fissures : vallées de bruit cellulaire
    pts = rng.random((60, 2)) * N
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    d1 = np.full((N, N), 1e9, np.float32); d2 = np.full((N, N), 1e9, np.float32)
    for px, py in pts:
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                d = np.hypot(xx - px - ox, yy - py - oy)
                d2 = np.minimum(d2, np.maximum(d1, d)); d1 = np.minimum(d1, d)
    crack = np.clip(1 - (d2 - d1) / 6, 0, 1)
    H = n * 0.6 + n2 * 0.3 - crack * 0.5
    nrm = normal_from_height(H, 6)
    alb = np.array([0.24, 0.22, 0.21]) * (0.7 + n[..., None] * 0.6)
    alb = alb * (1 - crack[..., None] * 0.7)
    rough = 0.75 + (n2 - 0.5) * 0.3
    ao = 1 - crack * 0.6
    E = crack ** 2
    save_rgb(np.clip(alb, 0, 1), 'rock_albedo.jpg')
    save_rgb(nrm, 'rock_normal.jpg', 92)
    save_rgb(np.stack([ao, np.clip(rough, 0, 1), np.full_like(ao, 0.15)], -1), 'rock_orm.jpg')
    save_rgb(np.stack([E, E, E], -1), 'rock_emissive.jpg', 85)
    hh = (H - H.min()) / (H.max() - H.min()); save_rgb(np.stack([hh, hh, hh], -1), 'rock_height.jpg', 88)

floor(); hull(); rock()
print('ok')
