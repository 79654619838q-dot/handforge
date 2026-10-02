# Картинки из ChatGPT → файлы игры.
# slots-art/raw/<имя>.b64.json (base64 PNG, сохранённый из страницы чата) →
#   assets/<автомат>/<символ>.webp — символы с листов 3×3, белый фон убран;
#   assets/common/{jackpot,coin,gift,pile}.webp — общий лист 2×2;
#   assets/bg/<имя>.jpg — фоны;
#   assets/<автомат>/frame.webp + assets/frames.json — рамка барабанов и где в ней окно;
#   assets/common/logo.webp, assets/<автомат>/title.webp — надписи-логотипы.
# python slots/tools/build_assets.py [имена листов…]   (чего нет в raw — пропускается; с именами — только они)
import base64, io, json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ONLY = set(sys.argv[1:])
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
    'candy_symbols': ('candy', 3, SYM),
    'viking_symbols': ('viking', 3, SYM),
    'aztec_symbols': ('aztec', 3, SYM),
    'shop_icons': ('common', 3, ['boost_x2', 'magnet', 'hot', 'rain_wild', 'lock', 'bag', 'wealth', 'hourglass', 'trophy']),
    'bunny_symbols': ('bunny', 3, SYM),
    # магазин роскоши (порядок клеток — как в запросе ChatGPT)
    'lux_cars': ('lux', 3, ['car_rusty', 'car_city', 'car_sedan', 'car_suv', 'car_muscle', 'car_limo', 'car_coupe', 'car_super', 'car_hyper']),
    'lux_houses': ('lux', 3, ['house_cabin', 'house_cottage', 'house_family', 'house_glass', 'house_sea', 'house_penthouse', 'house_mansion', 'house_palace', 'house_castle']),
    'lux_things': ('lux', 3, ['thing_sneakers', 'thing_phone', 'thing_watch', 'thing_bag', 'thing_chain', 'thing_ring', 'thing_painting', 'thing_crown', 'thing_diamond']),
    'acc_shoes': ('lux', 3, ['shoes_canvas', 'shoes_run', 'shoes_boots', 'shoes_loafers', 'shoes_oxford', 'shoes_designer', 'shoes_heels', 'shoes_gold', 'shoes_diamond']),
    'acc_watch_chain': ('lux', 3, ['watch_digital', 'watch_sport', 'watch_steel', 'watch_gold', 'watch_diamond', 'chain_silver', 'chain_gold', 'chain_ruby', 'chain_diamond']),
    'acc_phone_glasses': ('lux', 3, ['phone_button', 'phone_smart', 'phone_fold', 'phone_gold', 'phone_platinum', 'glasses_black', 'glasses_aviator', 'glasses_gold', 'glasses_diamond']),
    'acc_hats': ('lux', 3, ['hat_cap', 'hat_beanie', 'hat_straw', 'hat_cowboy', 'hat_fedora', 'hat_captain', 'hat_top', 'hat_laurel', 'hat_crown']),
    'avatars_green': ('avatars', 3, ['av1', 'av2', 'av3', 'av4', 'av5', 'av6', 'av7', 'av8', 'av9']),
    'lux_animals_green': ('lux', 3, ['pet_puppy', 'pet_cat', 'pet_parrot', 'pet_chihuahua', 'pet_horse', 'pet_tiger', 'pet_elephant', 'pet_unicorn', 'pet_dragon']),
    'lux_animals': ('lux', 3, ['pet_puppy', 'pet_cat', 'pet_parrot', 'pet_chihuahua', 'pet_horse', 'pet_tiger', 'pet_elephant', 'pet_unicorn', 'pet_dragon']),
    'lux_yachts_heli': ('lux', 3, ['boat_rubber', 'boat_speed', 'boat_sail', 'boat_yacht', 'boat_super', 'heli_black', 'heli_light', 'heli_vip', 'heli_gold']),
    'lux_planes_islands': ('lux', 3, ['plane_prop', 'plane_sea', 'plane_jet', 'plane_liner', 'plane_super', 'plane_space', 'island_palm', 'island_lagoon', 'island_paradise']),
    'lux_moto': ('lux', 3, ['moto_bike', 'moto_moped', 'moto_scooter', 'moto_dirt', 'moto_cruiser', 'moto_touring', 'moto_sport', 'moto_chopper', 'moto_future']),
}
# символы с замкнутыми белыми «окнами» (петля анха, просвет у скарабея) — окна тоже фон
HOLES = {'egypt/l1', 'egypt/l2'}
# белые пушистые символы: белое лицо касается белого фона и «вытекало» — закрываем щели и заливаем
FILL = {'bunny/wild': 10, 'bunny/h1': 6}
# символы с сиянием вокруг: прозрачность по «белизне» по всей картинке, а не только по краю
SOFT = {'egypt/scatter'}
# у вещей магазина роскоши ChatGPT рисует тени на белом — мягкий вырез превращает их в настоящую тень
SOFT_FOLDERS = {'lux'}
# надписи, где белое внутри — часть рисунка (белые полоски леденцов), а не дырки букв
LOGO_KEEP_WHITE = {'title_candy', 'title_bunny'}
FRAME_KEEP_WHITE = {'frame_candy', 'frame_bunny'}  # белые полоски леденцовых тростей
FRAME_FILL = {'frame_bunny': 8}  # белые мордочки зайцев касаются фона — закрыть щели
# сцены домов и островов — фон поместья: scenes/<id>.jpg и уменьшенная scenes/<id>_t.jpg для магазина
SCENES = {f'scene_{k}': k for k in ['house_cabin', 'house_cottage', 'house_family', 'house_glass', 'house_sea', 'house_penthouse',
                                     'house_mansion', 'house_palace', 'house_castle', 'island_palm', 'island_lagoon', 'island_paradise']}
BGS = {'bg_egypt': 'egypt', 'bg_pirate': 'pirate', 'bg_space': 'space', 'bg_lobby': 'lobby', 'bg_candy': 'candy', 'bg_viking': 'viking', 'bg_aztec': 'aztec', 'bg_bunny': 'bunny', 'bg_lux': 'lux', 'bg_estate': 'estate'}
FRAMES = {'frame_egypt': 'egypt', 'frame_pirate': 'pirate', 'frame_space': 'space', 'frame_candy': 'candy', 'frame_viking': 'viking', 'frame_aztec': 'aztec', 'frame_bunny': 'bunny'}
LOGOS = {'logo': 'common/logo', 'title_egypt': 'egypt/title', 'title_pirate': 'pirate/title', 'title_space': 'space/title',
         'title_candy': 'candy/title', 'title_viking': 'viking/title', 'title_aztec': 'aztec/title', 'title_bunny': 'bunny/title'}


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


def soft_rgba(a, mask):
    """Мягкий вырез для сияния: чем ближе пиксель к белому, тем прозрачнее."""
    # мягко только у края (сияние), внутри предмета — непрозрачно (белое солнце не должно пропасть)
    m = a.min(axis=2).astype(np.float32)
    edge = mask & ndimage.binary_dilation(~mask, iterations=22)
    alpha = np.where(edge, np.clip((255 - m) / 90.0, 0, 1), mask.astype(np.float32)).astype(np.float32)
    rgb = a.astype(np.float32)
    k = np.maximum(alpha, 0.05)[..., None]
    rgb = np.clip((rgb - 255 * (1 - k)) / k, 0, 255)
    return Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA')


def shadow_rgba(a, mask):
    """Вырез для вещей магазина: серая тень на белом у края — полупрозрачная тёмная тень,
    а белое и цветное самой вещи остаётся непрозрачным (белые кроссовки и паруса не просвечивают)."""
    m = a.min(axis=2).astype(np.float32)
    sat = (a.max(axis=2) - a.min(axis=2)).astype(np.float32)
    edge = mask & ndimage.binary_dilation(~mask, iterations=22)
    gray = edge & (sat < 22) & (m < 228)
    alpha = mask.astype(np.float32)
    alpha[gray] = np.clip((255 - m[gray]) / 90.0, 0, 1)
    # кайма в 2 px по-прежнему мягкая
    band = mask & ndimage.binary_dilation(~mask, iterations=2)
    alpha[band] = np.minimum(alpha[band], np.clip((255 - m[band]) / 70.0, 0, 1))
    rgb = a.astype(np.float32)
    k = np.maximum(alpha, 0.05)[..., None]
    dec = np.clip((rgb - 255 * (1 - k)) / k, 0, 255)
    rgb = np.where((alpha < 1)[..., None], dec, rgb)
    return Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA')


def cutout(a, mask, soft=False, shadow=False):
    im = shadow_rgba(a, mask) if shadow else soft_rgba(a, mask) if soft else rgba(a, mask)
    box = im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    im = im.crop(box)
    pad = int(max(im.size) * 0.03)
    canvas = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(im, (pad, pad))
    return canvas


# листы, где соседние предметы слиплись (фон небоскрёба касается виллы) — режем строго по клеткам
GRID_CUT = {'lux_houses'}
# листы на зелёном фоне (белые животные на белом сливались) — вырез по зелёному
GREEN = {'lux_animals_green', 'avatars_green', 'acc_shoes', 'acc_watch_chain', 'acc_phone_glasses', 'acc_hats'}


def green_split_rgba(a):
    """Зелёный фон → прозрачный: мягкая кайма по «зелёности», зелёный отсвет на шерсти убран."""
    r, g, b = [a[..., i].astype(np.float32) for i in range(3)]
    greenness = g - np.maximum(r, b)              # у чистого фона ~255, у предмета ≤ 0
    alpha = np.clip(1 - (greenness - 30) / 90.0, 0, 1)
    g2 = np.minimum(g, np.maximum(r, b) + 12)     # убрать зелёный отсвет
    rgb = np.dstack([r, g2, b])
    return rgb, alpha


def split(img, n, names, folder, size=420, grid_cut=False):
    """Лист n×n: каждый кусок предмета относится к клетке, где лежит его центр (предмет может
    чуть вылезать за границу клетки — не режем его пополам)."""
    os.makedirs(os.path.join(OUT, folder), exist_ok=True)
    a = np.asarray(img).astype(np.int16)
    H, W = a.shape[:2]
    green = grid_cut == 'green'
    if green:
        grgb, galpha = green_split_rgba(a)
        fg = galpha > 0.5
    else:
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
        if grid_cut is True:
            r, c = divmod(j, n)
            mask = np.zeros_like(fg)
            mask[r * H // n:(r + 1) * H // n, c * W // n:(c + 1) * W // n] = True
            mask &= fg
            # в клетку заходят кусочки соседей — оставить крупное
            l2, k2 = ndimage.label(mask)
            if k2 > 1:
                sz = ndimage.sum(mask, l2, range(1, k2 + 1))
                mask = np.isin(l2, [i + 1 for i, v in enumerate(sz) if v >= sz.max() * 0.2])
        elif not comps:
            print(f'  {folder}/{name}: клетка пустая!')
            continue
        else:
            mask = np.isin(lab, comps)
        key = f'{folder}/{name}'
        if green:
            near = ndimage.binary_dilation(mask, iterations=3)
            al = np.where(near, galpha, 0)
            im = Image.fromarray(np.dstack([grgb, al * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
            box = im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
            im = im.crop(box)
            pad = int(max(im.size) * 0.03)
            cv = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0)); cv.paste(im, (pad, pad)); im = cv
            im.thumbnail((size, size), Image.LANCZOS)
            im.save(os.path.join(OUT, folder, name + '.webp'), quality=90, method=6)
            print(f'  {folder}/{name}.webp {im.size}')
            continue
        if key in HOLES:
            mask &= ~holes_too(a, ~mask, 0.0002)
        if key in FILL:
            mask = ndimage.binary_fill_holes(ndimage.binary_closing(mask, iterations=FILL[key]))
        im = cutout(a, mask, soft=key in SOFT, shadow=folder in SOFT_FOLDERS)
        im.thumbnail((size, size), Image.LANCZOS)
        im.save(os.path.join(OUT, folder, name + '.webp'), quality=90, method=6)
        print(f'  {folder}/{name}.webp {im.size}')


for raw, (folder, n, names) in SHEETS.items():
    if ONLY and raw not in ONLY:
        continue
    img = load(raw)
    if img is None:
        print(f'{raw}: нет файла — пропуск')
        continue
    print(raw, img.size)
    split(img, n, names, folder, size=520 if folder == 'common' else 420, grid_cut='green' if raw in GREEN else raw in GRID_CUT)

meta_path = os.path.join(OUT, 'frames.json')
meta = json.load(open(meta_path, encoding='utf-8')) if os.path.exists(meta_path) else {}
for raw, mid in FRAMES.items():
    if ONLY and raw not in ONLY:
        continue
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
    bg = (background(a) | win) if raw in FRAME_KEEP_WHITE else holes_too(a, background(a) | win)
    if raw in FRAME_FILL:
        bg = ~(ndimage.binary_fill_holes(ndimage.binary_closing(~bg, iterations=FRAME_FILL[raw])) & ~win)
    im = rgba(a, ~bg)
    ys, xs = np.where(win)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    # окно чуть шире настоящего — внутренний край рамки ложится вплотную к барабанам, без щели
    dx, dy = -(x1 - x0) * 0.002, -(y1 - y0) * 0.003
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
    if ONLY and raw not in ONLY:
        continue
    img = load(raw)
    if img is None:
        print(f'{raw}: нет файла — пропуск')
        continue
    a = np.asarray(img).astype(np.int16)
    bg = background(a) if raw in LOGO_KEEP_WHITE else holes_too(a, background(a))
    im = cutout(a, ~bg)
    im.thumbnail((1400, 700), Image.LANCZOS)
    os.makedirs(os.path.dirname(os.path.join(OUT, out)), exist_ok=True)
    im.save(os.path.join(OUT, out + '.webp'), quality=90, method=6)
    print(f'  {out}.webp {im.size}')

# ---- куклы поместья: основа b1…b4 и костюмы o1…o6 на зелёном; рамка НЕ обрезается (точки надевания —
# в пикселях основы 1024×1536), костюм подгоняется к основе по макушке, подошвам и середине ----
def green_full(img):
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    gr = g - np.maximum(r, b)
    al = np.clip(1 - (gr - 30) / 90.0, 0, 1)
    al = ndimage.binary_opening(al > 0.5, iterations=1) * al  # точки-пылинки
    g2 = np.minimum(g, np.maximum(r, b) + 12)
    return np.dstack([r, g2, b, al * 255]).clip(0, 255).astype(np.uint8)


def body_box(rgba):
    m = rgba[..., 3] > 128
    lab, k = ndimage.label(m)
    if k > 1:  # самый крупный кусок — человек
        sz = ndimage.sum(m, lab, range(1, k + 1)); m = lab == (int(np.argmax(sz)) + 1)
    ys, xs = np.where(m)
    return ys.min(), ys.max(), xs.mean()


doll_have = {}
os.makedirs(os.path.join(OUT, 'doll'), exist_ok=True)
for b in ['b1', 'b2', 'b3', 'b4']:
    if ONLY and not any(x.startswith(f'doll_{b}') for x in ONLY):
        continue
    base = load(f'doll_{b}')
    if base is None:
        continue
    base = base.resize((1024, 1536), Image.LANCZOS)
    brgba = green_full(base)
    t0, b0, c0 = body_box(brgba)
    Image.fromarray(brgba, 'RGBA').resize((512, 768), Image.LANCZOS).save(os.path.join(OUT, 'doll', f'{b}.webp'), quality=90, method=6)
    have = []
    for o in ['o1', 'o2', 'o3', 'o4', 'o5', 'o6']:
        img = load(f'doll_{b}_{o}')
        if img is None:
            continue
        rgba = green_full(img.resize((1024, 1536), Image.LANCZOS))
        t, bt, c = body_box(rgba)
        k = (b0 - t0) / max(1, (bt - t))
        im = Image.fromarray(rgba, 'RGBA')
        im = im.resize((round(1024 * k), round(1536 * k)), Image.LANCZOS)
        canvas = Image.new('RGBA', (1024, 1536), (0, 0, 0, 0))
        canvas.paste(im, (round(c0 - c * k), round(t0 - t * k)), im)
        canvas.resize((512, 768), Image.LANCZOS).save(os.path.join(OUT, 'doll', f'{b}_{o}.webp'), quality=90, method=6)
        have.append(o)
        print(f'  doll/{b}_{o}.webp  масштаб {k:.3f}, сдвиг {c0 - c * k:+.0f},{t0 - t * k:+.0f}')
    doll_have[b] = have
if doll_have:
    p = os.path.join(OUT, 'doll', 'doll.json')
    old = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}
    old.update(doll_have)
    json.dump(old, open(p, 'w', encoding='utf-8'))

os.makedirs(os.path.join(OUT, 'scenes'), exist_ok=True)
for raw, sid in SCENES.items():
    if ONLY and raw not in ONLY:
        continue
    img = load(raw)
    if img is None:
        continue
    big = img.copy(); big.thumbnail((1920, 1920), Image.LANCZOS)
    big.save(os.path.join(OUT, 'scenes', sid + '.jpg'), quality=84, optimize=True, progressive=True)
    small = img.copy(); small.thumbnail((480, 480), Image.LANCZOS)
    small.save(os.path.join(OUT, 'scenes', sid + '_t.jpg'), quality=80, optimize=True)
    print(f'  scenes/{sid}.jpg {big.size}')

os.makedirs(os.path.join(OUT, 'bg'), exist_ok=True)
for raw, name in BGS.items():
    if ONLY and raw not in ONLY:
        continue
    img = load(raw)
    if img is None:
        print(f'{raw}: нет файла — пропуск')
        continue
    img.thumbnail((1920, 1920), Image.LANCZOS)
    img.save(os.path.join(OUT, 'bg', name + '.jpg'), quality=82, optimize=True, progressive=True)
    print(f'  bg/{name}.jpg {img.size}')
print('готово')
