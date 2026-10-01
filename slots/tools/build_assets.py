# Картинки из ChatGPT → файлы игры.
# slots-art/raw/<имя>.b64.json (base64 PNG, сохранённый из страницы чата) →
#   assets/<автомат>/<символ>.webp — символы с листов 3×3, белый фон убран;
#   assets/common/{jackpot,coin,gift,pile}.webp — общий лист 2×2;
#   assets/bg/<имя>.jpg — фоны.
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
}
BGS = {'bg_egypt': 'egypt', 'bg_pirate': 'pirate', 'bg_space': 'space', 'bg_lobby': 'lobby'}


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


def cutout(a, mask):
    """Предмет на прозрачном фоне: кайма в 2 px полупрозрачная по «белизне», белый ореол снят."""
    bg = ~mask
    band = mask & ndimage.binary_dilation(bg, iterations=2)
    m = a.min(axis=2).astype(np.float32)
    alpha = mask.astype(np.float32)
    alpha[band] = np.clip((255 - m[band]) / 70.0, 0, 1)
    rgb = a.astype(np.float32)
    k = np.maximum(alpha, 0.05)[..., None]
    dec = np.clip((rgb - 255 * (1 - k)) / k, 0, 255)
    rgb = np.where(band[..., None], dec, rgb)
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
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
