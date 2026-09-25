"""Вырезает вещь по зелёной заливке.

ChatGPT делает две картинки: принцесса в вещи (dressed) и та же картинка, где вещь
залита чистым #00FF00 (green). Маска = зелёные пиксели второй картинки, цвет — из первой.
Если вторая картинка чуть сдвинута, находим сдвиг по контуру фигуры и выравниваем.

python cut_green.py dressed.png green.png out.webp [--debug view.png] [--grow 1]
Печатает JSON {x, y, w, h} на холсте 1024×1536.
"""
import argparse
import json
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

W, H = 1024, 1536


def load(p):
    im = Image.open(p).convert('RGBA')
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
    return np.asarray(im).astype(np.float32)


def best_shift(d, g, r=20):
    """Сдвиг заливки относительно одетой картинки — по голове и плечам (они не менялись).
    У заливки фон бывает нарисованной «шахматкой», поэтому сравниваем только фигуру."""
    gray = lambda im: im[..., 0] * 0.3 + im[..., 1] * 0.59 + im[..., 2] * 0.11
    y0, y1, x0, x1 = 40, 520, 260, 764
    gd, gg = gray(d), gray(g)
    greenish = (g[..., 1] - np.maximum(g[..., 0], g[..., 2])) > 80
    sel = (d[..., 3] > 220)
    best, bs = None, (0, 0)
    step_list = [(dy, dx) for dy in range(-r, r + 1, 2) for dx in range(-r, r + 1, 2)]
    for phase in (0, 1):
        cand = step_list if phase == 0 else [(bs[0] + a, bs[1] + b) for a in (-1, 0, 1) for b in (-1, 0, 1)]
        for dy, dx in cand:
            sg = gg[y0 + dy:y1 + dy, x0 + dx:x1 + dx]
            m = sel[y0:y1, x0:x1] & ~greenish[y0 + dy:y1 + dy, x0 + dx:x1 + dx]
            if m.sum() < 1000:
                continue
            v = np.abs(gd[y0:y1, x0:x1] - sg)[m].mean()
            if best is None or v < best:
                best, bs = v, (dy, dx)
    return bs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dressed')
    ap.add_argument('green')
    ap.add_argument('out')
    ap.add_argument('--debug')
    ap.add_argument('--grow', type=int, default=1)
    ap.add_argument('--min', type=int, default=400, help='мельче — выкинуть как соринку')
    a = ap.parse_args()

    d, g = load(a.dressed), load(a.green)
    dy, dx = best_shift(d, g)
    if dy or dx:
        g = np.roll(np.roll(g, -dy, 0), -dx, 1)
    r, gg, b = g[..., 0], g[..., 1], g[..., 2]
    score = (gg - np.maximum(r, b)) / 255.0
    hard = (score > 0.45) & (g[..., 3] > 100) & (d[..., 3] > 30)
    lab, n = ndimage.label(hard)
    if n:
        sizes = ndimage.sum(hard, lab, range(1, n + 1))
        hard = np.isin(lab, 1 + np.nonzero(sizes >= a.min)[0])
    hard = ndimage.binary_closing(hard, iterations=2)
    if a.grow:
        hard = ndimage.binary_dilation(hard, iterations=a.grow)
    soft = ndimage.gaussian_filter(hard.astype(np.float32), 0.7)
    alpha = np.clip(soft * 1.2, 0, 1) * (d[..., 3] / 255.0)
    out = d.copy()
    out[..., 3] = alpha * 255
    out = out.clip(0, 255).astype(np.uint8)
    ys, xs = np.nonzero(out[..., 3] > 8)
    if not len(ys):
        print(json.dumps({'error': 'empty'}))
        sys.exit(1)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    Image.fromarray(out[y0:y1, x0:x1], 'RGBA').save(a.out, quality=90, method=6)
    if a.debug:
        v = Image.new('RGBA', (W, H), (60, 60, 80, 255))
        v.alpha_composite(Image.fromarray(out, 'RGBA'))
        v.convert('RGB').resize((W // 2, H // 2)).save(a.debug)
    print(json.dumps({'x': int(x0), 'y': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0), 'shift': [int(dy), int(dx)]}))


if __name__ == '__main__':
    main()
