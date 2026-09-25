"""Собирает слои куклы из картинок ChatGPT (dressup-art/raw) в игру (dressup/assets/doll + js/doll-manifest.js).

Принцесса p_<id>: тело без волос (маска pm_<id>), волосы — отдельный слой-причёска, руки — по маске m_arms манекена.
Вещь i_<id> + g_<id>: вещь вырезается по зелёной заливке (cut_green).
Волосы, плащи и крылья делятся на «перед» (поверх фигуры манекена) и «зад» (вне фигуры) — так они правильно
ложатся на любое платье.

python build_assets.py
"""
import json
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # dressup/
ART = os.path.join(os.path.dirname(ROOT), 'dressup-art')
RAW = os.path.join(ART, 'raw')
OUT = os.path.join(ROOT, 'assets', 'doll')
W, H = 1024, 1536
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_jobs import ITEMS, PRINCESSES  # noqa: E402
import cut_green  # noqa: E402

os.makedirs(OUT, exist_ok=True)


def rgba(p):
    im = Image.open(p).convert('RGBA')
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
    return np.asarray(im).astype(np.float32)


def skin_mean(img):
    """Средний цвет кожи по предплечьям (там нет ни волос, ни одежды)."""
    reg = np.concatenate([img[700:900, 250:330].reshape(-1, 4), img[700:900, 694:774].reshape(-1, 4)])
    reg = reg[reg[:, 3] > 250][:, :3]
    return np.median(reg, 0) if len(reg) > 50 else None


def fill_under_hair(body, man, hair, silhouette):
    """Там, где у принцессы были волосы, но у манекена тело — кладём кожу манекена в тон принцессы,
    иначе чужая причёска открывает дыры на шее и плечах."""
    ks, km = skin_mean(body), skin_mean(man)
    if ks is None or km is None:
        return body
    ratio = ks / np.maximum(km, 1)
    region = hair & (man[..., 3] > 200)
    out = body.copy()
    rec = man[..., :3] * ratio
    out[..., :3][region] = rec[region]
    out[..., 3][region] = man[..., 3][region]
    out[..., 3][hair & ~region] = 0   # волосы вне фигуры манекена — прочь из тела
    return out


def slip_region(man):
    """Где у манекена нижнее платье (розовое: синий канал не ниже зелёного), с бретелями."""
    rgb = man[..., :3]
    pink = (rgb[..., 2] - rgb[..., 1] > -8) & (rgb[..., 0] > 140) & (man[..., 3] > 200)
    pink[:300] = False
    lab, _ = ndimage.label(pink)
    core = lab == lab[600, 512]
    core = ndimage.binary_closing(core, iterations=4)
    core = ndimage.binary_fill_holes(core)
    return ndimage.binary_dilation(core, iterations=7)


def skin_slip(body, region):
    """Нижнее платье принцессы перекрашиваем в тон её кожи, сохраняя светотень.
    Под любым вырезом платья тогда видна кожа, а не бельё."""
    rgb = body[..., :3]
    skin = np.median(rgb[345:385, 460:560].reshape(-1, 3), 0)       # ключицы — точно кожа
    reg = region & (body[..., 3] > 200)
    if not reg.any():
        return body
    lum = rgb @ np.array([0.3, 0.59, 0.11])
    ref = np.median(lum[reg])
    k = np.clip(lum / max(ref, 1), 0.55, 1.35) ** 0.8
    rec = skin[None, None, :] * k[..., None]
    soft = ndimage.gaussian_filter(reg.astype(np.float32), 2.0)[..., None]
    out = body.copy()
    out[..., :3] = rgb * (1 - soft) + rec * soft
    # бретели (выше выреза) — дорисовываем окружающей кожей, чтобы не осталось даже контура
    top = reg.copy()
    top[398:] = False
    if top.any():
        mask = (ndimage.binary_dilation(top, iterations=2) * 255).astype(np.uint8)
        fixed = cv2.inpaint(np.ascontiguousarray(out[..., :3].clip(0, 255).astype(np.uint8)), mask, 8, cv2.INPAINT_TELEA)
        out[..., :3][mask > 0] = fixed[mask > 0]
    return out

def green_mask(dressed, green):
    """Маска зелёной заливки, выровненная по лицу/плечам."""
    dy, dx = cut_green.best_shift(dressed, green)
    g = np.roll(np.roll(green, -dy, 0), -dx, 1)
    score = (g[..., 1] - np.maximum(g[..., 0], g[..., 2])) / 255.0
    m = (score > 0.45) & (dressed[..., 3] > 30)
    lab, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        m = np.isin(lab, 1 + np.nonzero(sizes >= 300)[0])
    m = ndimage.binary_closing(m, iterations=2)
    return m


def save_layer(arr, mask, name, soft=0.7):
    a = ndimage.gaussian_filter(mask.astype(np.float32), soft) if soft else mask.astype(np.float32)
    a = np.clip(a * 1.2, 0, 1) * (arr[..., 3] / 255.0)
    out = arr.copy()
    out[..., 3] = a * 255
    out = out.clip(0, 255).astype(np.uint8)
    ys, xs = np.nonzero(out[..., 3] > 6)
    if not len(ys):
        return None
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)
    Image.fromarray(out[y0:y1, x0:x1], 'RGBA').save(os.path.join(OUT, name + '.webp'), quality=86, method=6)
    return {'f': name, 'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0}


def thumb(arr, mask, name, box=None):
    """Миниатюра вещи для ленты гардероба: вещь на светлом фоне, 200 px."""
    a = mask.astype(np.float32) * (arr[..., 3] / 255.0)
    ys, xs = np.nonzero(a > 0.05)
    if not len(ys):
        return None
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    if box:
        x0, y0, x1, y1 = box
    side = max(x1 - x0, y1 - y0) + 24
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    im = np.zeros((side, side, 4), np.uint8)
    sx0, sy0 = cx - side // 2, cy - side // 2
    for y in range(side):
        yy = sy0 + y
        if 0 <= yy < H:
            xa, xb = max(0, sx0), min(W, sx0 + side)
            row = arr[yy, xa:xb].copy()
            row[:, 3] = row[:, 3] * a[yy, xa:xb]
            im[y, xa - sx0:xb - sx0] = row.clip(0, 255).astype(np.uint8)
    t = Image.fromarray(im, 'RGBA').resize((200, 200), Image.LANCZOS)
    t.save(os.path.join(OUT, 't_' + name + '.webp'), quality=82, method=6)
    return 't_' + name


def main():
    man = rgba(os.path.join(ART, 'mannequin.png'))
    silhouette = ndimage.binary_erosion(man[..., 3] > 128, iterations=2)
    manifest = {'w': W, 'h': H, 'princesses': {}, 'items': {}}
    # кэш: вещь пересобирается, только если её исходные картинки изменились (или сменилась версия сборки)
    VER = 7
    cpath = os.path.join(ART, 'build_cache.json')
    cache = json.load(open(cpath, encoding='utf8')) if os.path.exists(cpath) else {}
    if cache.get('_ver') != VER:
        cache = {'_ver': VER}
    stamp = lambda *fs: [round(os.path.getmtime(f), 2) for f in fs if os.path.exists(f)]

    slip = slip_region(man)
    bun_mask = None
    if os.path.exists(os.path.join(RAW, 'm_hair.png')):
        bun_mask = ndimage.binary_dilation(green_mask(man, rgba(os.path.join(RAW, 'm_hair.png'))), iterations=4)
        bun_mask[95:] = False       # только шар пучка над головой; гладкие волосы на макушке остаются телу
    arms_mask = None
    if os.path.exists(os.path.join(RAW, 'm_arms.png')):
        arms_mask = green_mask(man, rgba(os.path.join(RAW, 'm_arms.png')))
        arms_mask = ndimage.binary_dilation(arms_mask, iterations=1)

    for pid, _desc in PRINCESSES:
        p, pm = os.path.join(RAW, f'p_{pid}.png'), os.path.join(RAW, f'pm_{pid}.png')
        if not (os.path.exists(p) and os.path.exists(pm)):
            continue
        key = 'princess:' + pid
        pbf = os.path.join(RAW, f'pb_{pid}.png')
        if cache.get(key, {}).get('stamp') == stamp(p, pm, pbf):
            manifest['princesses'][pid] = cache[key]['entry']
            manifest['items']['hair_' + pid] = cache[key]['hair']
            continue
        body = rgba(p)
        hair = green_mask(body, rgba(pm))
        hair_d = ndimage.binary_dilation(hair, iterations=2)
        pb = os.path.join(RAW, f'pb_{pid}.png')
        if os.path.exists(pb) and bun_mask is not None:
            # тело — та же принцесса с волосами в пучке: шея и плечи открыты; пучок срезаем маской манекена
            clean = rgba(pb)
            dy, dx = cut_green.best_shift(body, clean)
            clean = np.roll(np.roll(clean, -dy, 0), -dx, 1)
            # контур берём не из этой картинки (ChatGPT иногда рисует «шахматку» вместо прозрачности),
            # а из исходной принцессы: её фигура без волос + фигура манекена там, где были волосы
            sil = ((body[..., 3] > 128) & ~hair_d) | ((man[..., 3] > 128) & hair_d)
            sil = ndimage.binary_fill_holes(sil)
            sil = ndimage.binary_erosion(sil, iterations=1)          # край без «шахматки» фона
            clean[..., 3] = np.clip(ndimage.gaussian_filter(sil.astype(np.float32), 0.8) * 1.15, 0, 1) * 255
            clean[..., 3][bun_mask] = 0
        else:
            clean = fill_under_hair(body, man, hair_d, silhouette)
        clean = skin_slip(clean, slip)
        entry = {'body': save_layer(clean, clean[..., 3] > 5, f'body_{pid}', soft=0)}
        if arms_mask is not None:
            entry['arms'] = save_layer(body, arms_mask & ~hair_d, f'arms_{pid}', soft=0.8)
        # собственная причёска — тоже вещь (подходит всем принцессам)
        front, back = hair & silhouette, hair & ~silhouette
        hid = 'hair_' + pid
        manifest['items'][hid] = {
            'slot': 'hair', 'front': save_layer(body, front, hid + '_f'), 'back': save_layer(body, back, hid + '_b'),
            'thumb': thumb(body, hair, hid), 'princess': pid,
        }
        entry['hair'] = hid
        # миниатюра-портрет принцессы
        face = Image.fromarray(body.clip(0, 255).astype(np.uint8), 'RGBA').crop((262, 0, 762, 620)).resize((300, 372), Image.LANCZOS)
        face.save(os.path.join(OUT, f'face_{pid}.webp'), quality=84, method=6)
        entry['face'] = f'face_{pid}'
        manifest['princesses'][pid] = entry
        cache[key] = {'stamp': stamp(p, pm, pbf), 'entry': entry, 'hair': manifest['items'][hid]}
        print('princess', pid)

    items = [('ball_pink', 'dress', '', '')] + ITEMS
    for iid, slot, _what, _noun in items:
        i, g = os.path.join(RAW, f'i_{iid}.png'), os.path.join(RAW, f'g_{iid}.png')
        if not (os.path.exists(i) and os.path.exists(g)):
            continue
        key = 'item:' + iid
        if cache.get(key, {}).get('stamp') == stamp(i, g):
            manifest['items'][iid] = cache[key]['entry']
            continue
        d = rgba(i)
        m = green_mask(d, rgba(g))
        if m.sum() < 200:
            print('EMPTY', iid)
            continue
        e = {'slot': slot, 'thumb': thumb(d, m, iid)}
        if slot == 'outer' or iid == 'head_veil':
            e['front'] = save_layer(d, m & silhouette, iid + '_f')
            e['back'] = save_layer(d, m & ~silhouette, iid + '_b')
        else:
            if slot in ('dress', 'outer') and arms_mask is not None:
                # под руками манекена платье не видно — дорисовываем ткань, чтобы у других принцесс не было щелей
                hole = ndimage.binary_fill_holes(m | arms_mask) & arms_mask & ~m
                hole &= ndimage.binary_dilation(m, iterations=25) & (man[..., 3] > 200)
                if hole.any():
                    hm = (hole * 255).astype(np.uint8)
                    rgb = cv2.inpaint(np.ascontiguousarray(d[..., :3].clip(0, 255).astype(np.uint8)), hm, 11, cv2.INPAINT_TELEA)
                    d = d.copy()
                    d[..., :3][hole] = rgb[hole]
                    d[..., 3][hole] = 255
                    m = m | hole
            e['layer'] = save_layer(d, m, iid)
        # рукава: вещь закрывает руки манекена
        if arms_mask is not None and slot in ('dress', 'outer', 'gloves'):
            cover = (m & arms_mask).sum() / max(1, arms_mask.sum())
            e['sleeves'] = bool(cover > 0.18)
        manifest['items'][iid] = e
        cache[key] = {'stamp': stamp(i, g), 'entry': e}
        print('item', iid, e.get('sleeves', ''))

    # фоны мест и обложка
    bgdir = os.path.join(ROOT, 'assets', 'bg')
    for f in os.listdir(RAW):
        if f.startswith('bg_') and f.endswith('.png'):
            dst = os.path.join(bgdir, f[3:-4] + '.jpg')
            if not os.path.exists(dst):
                im = Image.open(os.path.join(RAW, f)).convert('RGB')
                im.thumbnail((1024, 1024), Image.LANCZOS)
                im.save(dst, 'JPEG', quality=84, optimize=True, progressive=True)
                print('bg', f[3:-4])
    ids = sorted(x[:-4] for x in os.listdir(bgdir) if x.endswith('.jpg'))
    open(os.path.join(ROOT, 'js', 'bg-list.js'), 'w', encoding='utf8').write(
        '// Какие реалистичные фоны лежат в assets/bg (<id>.jpg). Обновляет tools/build_assets.py.' + chr(10)
        + 'export const BG_FILES = ' + json.dumps(ids) + ';' + chr(10))
    cov = os.path.join(RAW, 'cover.png')
    if os.path.exists(cov):
        im = Image.open(cov).convert('RGB')
        im.thumbnail((512, 512), Image.LANCZOS)
        im.save(os.path.join(ROOT, 'assets', 'cover.jpg'), 'JPEG', quality=86, optimize=True)

    json.dump(cache, open(cpath, 'w', encoding='utf8'))
    js = '// Собрано tools/build_assets.py из картинок ChatGPT — не править руками.\nexport const DOLL = ' + json.dumps(manifest, ensure_ascii=False) + ';\n'
    open(os.path.join(ROOT, 'js', 'doll-manifest.js'), 'w', encoding='utf8').write(js)
    print('princesses', len(manifest['princesses']), 'items', len(manifest['items']))


if __name__ == '__main__':
    main()
