# Картинки из ChatGPT → файлы программы.
# school-art/raw/*.b64.json (base64 PNG, сохранённые из страницы чата) →
#   assets/items/s<лист>_<клетка>.webp — предметы с листов 3×3, белый фон убран;
#   assets/owl/<поза>.webp — совёнок с листа 2×2;
#   assets/bg/<имя>.jpg — фоны разделов.
# python school/tools/build_assets.py
import base64, io, json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(os.path.dirname(ROOT), 'school-art', 'raw')
OUT = os.path.join(ROOT, 'assets')


def load(name):
    with open(os.path.join(RAW, name + '.b64.json'), encoding='utf-8') as f:
        data = json.load(f)
    if not isinstance(data, str) or data.startswith(('NONE', 'SEND')):
        sys.exit(f'{name}: картинки нет — {str(data)[:80]}')
    img = Image.open(io.BytesIO(base64.b64decode(data))).convert('RGB')
    img.save(os.path.join(RAW, name + '.png'))
    return img


def cut_out(cell):
    """Белый фон, связанный с краем клетки, → прозрачный; белое внутри предмета остаётся."""
    a = np.asarray(cell).astype(np.int16)
    whiteish = (a.min(axis=2) > 232) & (a.max(axis=2) - a.min(axis=2) < 18)
    lab, _ = ndimage.label(whiteish)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    # мягкий край: полупрозрачная кайма в 2 px вместо «лесенки»
    solid = ~bg
    soft = ndimage.gaussian_filter(solid.astype(np.float32), 1.0)
    alpha = np.where(solid, 1.0, soft) * 255
    # убрать мусор: оставить крупные куски предмета
    lab2, n = ndimage.label(solid)
    if n > 1:
        sizes = ndimage.sum(solid, lab2, range(1, n + 1))
        keep = np.isin(lab2, [i + 1 for i, s in enumerate(sizes) if s > sizes.max() * 0.06])
        alpha = np.where(keep | (alpha < 255), alpha, 0)
        alpha = np.where(solid & ~keep, 0, alpha)
    rgba = np.dstack([a.astype(np.uint8), alpha.clip(0, 255).astype(np.uint8)])
    im = Image.fromarray(rgba, 'RGBA')
    box = im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()
    im = im.crop(box)
    pad = int(max(im.size) * 0.04)
    canvas = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(im, (pad, pad))
    return canvas


def grid(img, n, prefix, folder, names=None, size=360):
    os.makedirs(os.path.join(OUT, folder), exist_ok=True)
    w, h = img.size
    for r in range(n):
        for c in range(n):
            i = r * n + c
            cell = img.crop((c * w // n, r * h // n, (c + 1) * w // n, (r + 1) * h // n))
            im = cut_out(cell)
            im.thumbnail((size, size), Image.LANCZOS)
            name = names[i] if names else f'{prefix}_{i}'
            im.save(os.path.join(OUT, folder, name + '.webp'), quality=88, method=6)


for s in range(1, 12):
    grid(load(f'sheet{s}'), 3, f's{s}', 'items')
grid(load('mascot'), 2, '', 'owl', ['hello', 'joy', 'think', 'cheer'], size=520)
grid(load('cups'), 2, '', 'cups', ['math', 'sounds', 'syllables', 'words'], size=420)
grid(load('cup_abc'), 1, '', 'cups', ['abc'], size=420)

os.makedirs(os.path.join(OUT, 'bg'), exist_ok=True)
for b in ['bg_menu', 'bg_math', 'bg_sounds', 'bg_syllables', 'bg_words', 'bg_reward', 'bg_abc']:
    im = load(b)
    im.thumbnail((1920, 1920), Image.LANCZOS)
    im.save(os.path.join(OUT, 'bg', b[3:] + '.jpg'), quality=84, optimize=True, progressive=True)
print('готово')
