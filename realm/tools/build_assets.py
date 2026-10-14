# Картинки из ChatGPT (realm-art/raw/<имя>.png) → файлы игры realm/assets/.
#   hero_<id>  → heroes/<id>.jpg            (портреты, без вырезания)
#   bg_<имя>   → bg/<имя>.jpg               (фоны)
#   mon1…mon10 → mon/<монстр>.webp          (листы 2×2, фон белый или зелёный убирается)
#   wpn1, armor, … → items/<лист>_<1-9>.webp (листы 3×3)
# python realm/tools/build_assets.py [имена…]   — без имён собирает всё, что есть в raw
import os, sys, json
sys.stdout.reconfigure(encoding='utf-8')
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(os.path.dirname(ROOT), 'realm-art', 'raw')
OUT = os.path.join(ROOT, 'assets')
ONLY = set(sys.argv[1:])

MON = [['wolf', 'goblin', 'spider', 'treant'], ['witch', 'spiderqueen', 'drowned', 'toad'], ['wisp', 'troll', 'lizard', 'hydra'],
       ['skeleton', 'golem', 'bat', 'worm'], ['dwarf', 'bonelord', 'mimic', 'goldgolem'], ['yeti', 'iceel', 'griffin', 'harpy'],
       ['giant', 'wyvern', 'hellhound', 'lavagolem'], ['salamander', 'imp', 'demon', 'dragon'], ['deathknight', 'vampire', 'banshee', 'gargoyle'],
       ['necro', 'lich', 'wanderer', 'shadow']]
ITEMS = ['wpn1', 'wpn2', 'armor', 'helm', 'jewel', 'artifact', 'cons', 'icons', 'skills',
         'wpn3', 'wpn4', 'offh', 'armor2', 'helm2', 'cloak', 'gloves', 'belt', 'boots', 'jewel2', 'artifact2', 'artifact3', 'artifact4', 'skills2']


def save(img, path, **kw):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, **kw)


def bg_mask(a):
    """Фон листа: белый или зелёный, связанный с краем."""
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    green = (g > 150) & (g - np.maximum(r, b) > 70)
    white = (a.min(axis=2) > 226) & (a.max(axis=2) - a.min(axis=2) < 22)
    isgreen = green[:12].mean() > 0.5 or green[-12:].mean() > 0.5
    cand = green if isgreen else white
    lab, _ = ndimage.label(cand)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    # «окна» фона внутри фигуры (между лапами, ветвями, под крыльями) — тоже фон
    pure = green if isgreen else (a.min(axis=2) > 238) & (a.max(axis=2) - a.min(axis=2) < 14)
    if True:
        lab2, k = ndimage.label(pure & ~bg)
        if k:
            sizes = ndimage.sum(np.ones_like(lab2), lab2, range(1, k + 1))
            big = [i + 1 for i, s in enumerate(sizes) if s > (300 if isgreen else 40)]
            bg |= np.isin(lab2, big)
    return bg, isgreen


def cutout(a, bg, isgreen):
    """RGBA: мягкая кайма 2 px, у зелёного — убрать зелёный отсвет по краю."""
    mask = ~bg
    band = mask & ndimage.binary_dilation(bg, iterations=3)
    alpha = mask.astype(np.float32)
    rgb = a.astype(np.float32)
    if isgreen:
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        spill = np.clip((g - np.maximum(r, b)) / 120.0, 0, 1)
        alpha[band] = np.clip(1 - spill[band] * 1.3, 0, 1)
        near = mask & ndimage.binary_dilation(bg, iterations=10)
        g2 = np.where(near, np.minimum(g, np.maximum(r, b) * 1.05), g)
        rgb[..., 1] = g2
    else:
        m = a.min(axis=2).astype(np.float32)
        alpha[band] = np.clip((255 - m[band]) / 60.0, 0, 1)
        k = np.maximum(alpha, 0.05)[..., None]
        dec = np.clip((rgb - 255 * (1 - k)) / k, 0, 255)
        rgb = np.where(band[..., None], dec, rgb)
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8), 'RGBA')


def split(name, n, ids, folder, maxside):
    src = Image.open(os.path.join(RAW, name + '.png'))
    rgba = np.array(src.convert('RGBA'))
    a = rgba[..., :3].copy()
    H, W = a.shape[:2]
    transparent = (rgba[..., 3] < 20).mean() > 0.2  # ChatGPT иногда сразу присылает прозрачный фон
    if transparent:
        bg, isgreen = rgba[..., 3] < 20, False
    else:
        bg, isgreen = bg_mask(a)
    fg = ~bg
    # мелкий мусор (искры, крошки) не считаем отдельными кусками
    closed = ndimage.binary_closing(fg, iterations=3)
    lab, k = ndimage.label(closed)
    if not k:
        return
    objs = ndimage.find_objects(lab)
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, k + 1))
    com = ndimage.center_of_mass(closed, lab, range(1, k + 1))
    boxes = {}
    for i, (sl, sz, (cy, cx)) in enumerate(zip(objs, sizes, com)):
        if sz < H * W * 0.0004:
            continue
        cell = min(n - 1, int(cy / H * n)) * n + min(n - 1, int(cx / W * n))
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        b = boxes.get(cell)
        boxes[cell] = (min(y0, b[0]), max(y1, b[1]), min(x0, b[2]), max(x1, b[3])) if b else (y0, y1, x0, x1)
    full = Image.fromarray(rgba, 'RGBA') if transparent else cutout(a, bg, isgreen)
    for cell, oid in enumerate(ids):
        if cell not in boxes:
            print('  !! нет клетки', cell + 1, 'в', name)
            continue
        y0, y1, x0, x1 = boxes[cell]
        pad = 6
        crop = full.crop((max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)))
        # обнулить чужие куски, попавшие в рамку соседа
        own = np.zeros((H, W), bool)
        for j in range(1, k + 1):
            if sizes[j - 1] >= H * W * 0.0004:
                cy, cx = com[j - 1]
                c = min(n - 1, int(cy / H * n)) * n + min(n - 1, int(cx / W * n))
                if c == cell:
                    own |= lab == j
        own = ndimage.binary_dilation(own, iterations=2)[max(0, y0 - pad):min(H, y1 + pad), max(0, x0 - pad):min(W, x1 + pad)]
        arr = np.array(crop); arr[..., 3] = np.where(own, arr[..., 3], 0); crop = Image.fromarray(arr, 'RGBA')
        crop.thumbnail((maxside, maxside), Image.LANCZOS)
        save(crop, os.path.join(OUT, folder, f'{oid}.webp'), quality=88, method=6)
    print(' ', name, '->', len(boxes), 'кусков')


def main():
    files = sorted(f[:-4] for f in os.listdir(RAW) if f.endswith('.png'))
    for name in files:
        if ONLY and name not in ONLY:
            continue
        if name.startswith('hero_'):
            im = Image.open(os.path.join(RAW, name + '.png')).convert('RGB'); im.thumbnail((720, 1080), Image.LANCZOS)
            save(im, os.path.join(OUT, 'heroes', name[5:] + '.jpg'), quality=86); print(' ', name)
        elif name.startswith('bg_'):
            im = Image.open(os.path.join(RAW, name + '.png')).convert('RGB'); im.thumbnail((1800, 1200), Image.LANCZOS)
            save(im, os.path.join(OUT, 'bg', name[3:] + '.jpg'), quality=84); print(' ', name)
        elif name.startswith('mon') and name[3:].isdigit():
            split(name, 2, MON[int(name[3:]) - 1], 'mon', 720)
        elif name.startswith('mon_L'):  # монстры уровня: L01_1 … L01_4
            nn = name[5:]
            split(name, 2, [f'L{nn}_{i + 1}' for i in range(4)], 'mon', 720)
        elif name.startswith('lv') and name[2:].isdigit():  # поле боя уровня
            im = Image.open(os.path.join(RAW, name + '.png')).convert('RGB'); im.thumbnail((1800, 1200), Image.LANCZOS)
            save(im, os.path.join(OUT, 'bg', name + '.jpg'), quality=84); print(' ', name)
        elif name in ITEMS:
            n = 8 if name == 'skills2' else 9
            split(name, 3, [f'{name}_{i + 1}' for i in range(n)], 'items', 320)
    manifest()


def manifest():
    # список готовых картинок: игра берёт только то, что уже нарисовано (остальное — запасные)
    out = []
    for folder in ['heroes', 'mon', 'items', 'bg']:
        d = os.path.join(OUT, folder)
        if os.path.isdir(d):
            out += [f'{folder}/{os.path.splitext(f)[0]}' for f in sorted(os.listdir(d))]
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f)
    print('  manifest:', len(out))


main()
