# Картинки из ChatGPT → файлы игры.
# slots-art/raw/<имя>.b64.json (base64 PNG, сохранённый из страницы чата) →
#   assets/<автомат>/<символ>.webp — символы с листов 3×3, белый фон убран;
#   assets/common/{jackpot,coin,gift,pile}.webp — общий лист 2×2;
#   assets/bg/<имя>.jpg — фоны;
#   assets/<автомат>/frame.webp + assets/frames.json — рамка барабанов и где в ней окно;
#   assets/common/logo.webp, assets/<автомат>/title.webp — надписи-логотипы.
# python slots/tools/build_assets.py   (чего нет в raw — пропускается)
import base64, io, json, os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(os.path.dirname(ROOT), 'slots-art', 'raw')
OUT = os.path.join(ROOT, 'assets')

SYM = ['wild', 'h1', 'h2', 'h3', 'l1', 'l2', 'l3', 'l4', 'scatter']  # порядок клеток в запросе
SHEETS = {
    'egypt_symbols': ('egypt', 3, SYM),
    'pirate_symbols': ('pirate', 3, SYM),
    'space_symbols': ('space', 3, SYM),
    'common_icons': ('common', 2, ['jackpot', 'coin', 'gift', 'pile']),
    'feature_icons': ('common', 3, ['mystery', 'orb', 'chest', 'chest_open', 'wheel', 'medal', 'star', 'fire', 'bolt']),
}
BGS = {'bg_egypt': 'egypt', 'bg_pirate': 'pirate', 'bg_space': 'space', 'bg_lobby': 'lobby'}
FRAMES = {'frame_egypt': 'egypt', 'frame_pirate': 'pirate', 'frame_space': 'space'}
LOGOS = {'logo': 'common/logo', 'title_egypt': 'egypt/title', 'title_pirate': 'pirate/title', 'title_space': 'space/title'}


def load(name):
    p = os.path.join(RAW, name + '.b64.json')
    if not os.path.exists(p):
        return None
    with open(p, encoding='utf-8') as f:
        data = json.load(f)
    img = Image.open(io.BytesIO(base64.b64decode(data))).convert('RGB')
    img.save(os.path.join(RAW, name + '.png'))
    return img


def background(a):
    """Белый фон, связанный с краем листа."""
    white = (a.min(axis=2) > 228) & (a.max(axis=2) - a.min(axis=2) < 20)
    lab, _ = ndimage.label(white)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    return np.isin(lab, list(edge))


def whites(a):
    return (a.min(axis=2) > 228) & (a.max(axis=2) - a.min(axis=2) < 20)


def holes_too(a, bg, min_frac=0.0004):
    """Крупные белые «окна» внутри (буква О, просвет орнамента) — тоже фон."""
    lab, k = ndimage.label(whites(a) & ~bg)
    if not k:
        return bg
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, k + 1))
    big = [i + 1 for i, sz in enumerate(sizes) if sz > a.shape[0] * a.shape[1] * min_frac]
    return bg | np.isin(lab, big)


def rgba(a, mask):
    """Полный размер, кайма в 2 px полупрозрачная по «белизне», белый ореол снят."""
    bg = ~mask
    band = mask & ndimage.binary_dilation(bg, iterations=2)
    m = a.min(axis=2).astype(np.float32)
    alpha = mask.astype(np.float32)
    alpha[band] = np.clip((255 - m[band]) / 70.0, 0, 1)
    rgb = a.astype(np.float32)
    k = np.maximum(alpha, 0.05)[..., None]
    dec = np.clip((rgb - 255 * (1 - k)) / k, 0, 255)
    rgb = np.where(band[..., None], dec, rgb)
    return Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA')


def cutout(a, mask):
    im = rgba(a, mask)
    box = im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    im = im.crop(box)
    pad = int(max(im.size) * 0.03)
    canvas = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(im, (pad, pad))
    return canvas


def split(img, n, names, folder, size=420):
    """Лист n×n: каждый кусок предмета относится к клетке, где лежит его центр (предмет может
    чуть вылезать за границу клетки — не режем его пополам)."""
    os.makedirs(os.path.join(OUT, folder), exist_ok=True)
    a = np.asarray(img).astype(np.int16)
    H, W = a.shape[:2]
    fg = ~background(a)
    lab, k = ndimage.label(fg)
    idx = range(1, k + 1)
    sizes = ndimage.sum(fg, lab, idx)
    cents = ndimage.center_of_mass(fg, lab, idx)
    cells = {}
    for i, (sz, (cy, cx)) in enumerate(zip(sizes, cents), start=1):
        if sz < H * W * 0.0003:
            continue  # пылинки
        r, c = min(n - 1, int(cy / (H / n))), min(n - 1, int(cx / (W / n)))
        cells.setdefault(r * n + c, []).append(i)
    for j, name in enumerate(names):
        comps = cells.get(j)
        if not comps:
            print(f'  {folder}/{name}: клетка пустая!')
            continue
        mask = np.isin(lab, comps)
        im = cutout(a, mask)
        im.thumbnail((size, size), Image.LANCZOS)
        im.save(os.path.join(OUT, folder, name + '.webp'), quality=90, method=6)
        print(f'  {folder}/{name}.webp {im.size}')


for raw, (folder, n, names) in SHEETS.items():
    img = load(raw)
    if img is None:
        print(f'{raw}: нет файла — пропуск')
        continue
    print(raw, img.size)
    split(img, n, names, folder, size=520 if folder == 'common' else 420)

meta_path = os.path.join(OUT, 'frames.json')
meta = json.load(open(meta_path, encoding='utf-8')) if os.path.exists(meta_path) else {}
for raw, mid in FRAMES.items():
    img = load(raw)
    if img is None:
        print(f'{raw}: нет файла — пропуск')
        continue
    a = np.asarray(img).astype(np.int16)
    H, W = a.shape[:2]
    lab, _ = ndimage.label(whites(a))
    win_lab = lab[H // 2, W // 2]
    if not win_lab:
        print(f'{raw}: в центре нет белого окна — пропуск')
        continue
    win = lab == win_lab
    bg = holes_too(a, background(a) | win)
    im = rgba(a, ~bg)
    ys, xs = np.where(win)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    # рамка чуть заходит на барабаны — без щели между ними
    dx, dy = (x1 - x0) * 0.008, (y1 - y0) * 0.012
    box = im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    im = im.crop(box)
    k = min(1, 1800 / im.width)
    if k < 1:
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    os.makedirs(os.path.join(OUT, mid), exist_ok=True)
    im.save(os.path.join(OUT, mid, 'frame.webp'), quality=90, method=6)
    meta[mid] = {'iw': im.width, 'ih': im.height,
                 'x0': round(float(x0 + dx - box[0]) * k, 1), 'y0': round(float(y0 + dy - box[1]) * k, 1),
                 'x1': round(float(x1 - dx - box[0]) * k, 1), 'y1': round(float(y1 - dy - box[1]) * k, 1)}
    print(f'  {mid}/frame.webp {im.size}, окно {meta[mid]}, пропорция окна {(x1 - x0) / (y1 - y0):.3f} (нужно 1.667)')
if meta:
    os.makedirs(OUT, exist_ok=True)
    json.dump(meta, open(meta_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

for raw, out in LOGOS.items():
    img = load(raw)
    if img is None:
        print(f'{raw}: нет файла — пропуск')
        continue
    a = np.asarray(img).astype(np.int16)
    bg = holes_too(a, background(a))
    im = cutout(a, ~bg)
    im.thumbnail((1400, 700), Image.LANCZOS)
    os.makedirs(os.path.dirname(os.path.join(OUT, out)), exist_ok=True)
    im.save(os.path.join(OUT, out + '.webp'), quality=90, method=6)
    print(f'  {out}.webp {im.size}')

os.makedirs(os.path.join(OUT, 'bg'), exist_ok=True)
for raw, name in BGS.items():
    img = load(raw)
    if img is None:
        print(f'{raw}: нет файла — пропуск')
        continue
    img.thumbnail((1920, 1920), Image.LANCZOS)
    img.save(os.path.join(OUT, 'bg', name + '.jpg'), quality=82, optimize=True, progressive=True)
    print(f'  bg/{name}.jpg {img.size}')
print('готово')
