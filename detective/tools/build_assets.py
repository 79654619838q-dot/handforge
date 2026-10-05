# Картинки ChatGPT (detective-art/raw/*.png) → detective/assets/img/**.webp
# Одиночные: имя «c01_yard» → c01/yard.webp, «ui_menu» → ui/menu.webp.
# Листы (сетка кадров с тёмными полосами) режутся по найденным полосам — список SHEETS ниже.
# python detective/tools/build_assets.py [имя…]   — без имён: всё, что новее готового
import os, sys, json
from PIL import Image, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(os.path.dirname(ROOT), 'detective-art', 'raw')
OUT = os.path.join(ROOT, 'assets', 'img')

def P(*names):  # портреты: на каждого спокойный и напряжённый
    out = []
    for n in names: out += [f'p/{n}', f'p/{n}_t']
    return out

# имя листа: (столбцов, строк, ключи по строкам слева направо; None — пропустить)
SHEETS = {
    'c01_cams': (2, 2, ['c01/cam1', 'c01/cam2', 'c01/cam3', 'c01/cam4']),
    'c01_ev1': (3, 3, ['c01/ev/latch', 'c01/ev/clean', 'c01/ev/dog', 'c01/ev/hook', 'c01/ev/boots', 'c01/ev/debt', 'c01/ev/letter', 'c01/ev/note', 'c01/ev/pts']),
    'c01_ev2': (3, 3, ['c01/ev/policy', 'c01/ev/tracks', 'c01/ev/steps', 'c01/ev/key2', 'c01/ev/cam', 'c01/ev/taxi', 'c01/ev/token', None, None]),
    'p_main': (2, 3, P('volkova', 'artyom', 'granin')),
    'p_c01': (2, 3, P('maya', 'shubin', 'zina')),
    'p_c01b': (2, 3, P('kirill', 'kravets', 'katya')),
    'c02_ev1': (3, 3, ['c02/ev/shelf', 'c02/ev/watch', 'c02/ev/jewel', 'c02/ev/lock', 'c02/ev/print', 'c02/ev/dust', 'c02/ev/alarmlog', 'c02/ev/keylog', 'c02/ev/boots44']),
    'c02_ev2': (3, 3, ['c02/ev/bootmatch', 'c02/ev/letter2', 'c02/ev/receipt', None, None, None, None, None, None]),
    'p_c02': (2, 3, P('maxim', 'galina', 'ruslan')),
    'c03_cams': (2, 2, ['c03/cam1', 'c03/cam2', 'c03/cam3', 'c03/cam4']),
    'c03_ev1': (3, 3, ['c03/ev/bag', 'c03/ev/family', 'c03/ev/meds', 'c03/ev/taxikeys', 'c03/ev/threat', 'c03/ev/triplog', 'c03/ev/lastcall', 'c03/ev/lcalls', 'c03/ev/bankrec']),
    'c03_ev2': (3, 3, ['c03/ev/niva', 'c03/ev/cups', 'c03/ev/jacket', None, None, None, None, None, None]),
    'p_c03': (2, 3, P('lyudmila', 'vera', 'somov')),
    'p_c04': (2, 3, P('igor', 'savely', 'krotov')),
    'p_c05': (2, 3, P('pestov', 'laptev', 'markova')),
    'p_c06': (2, 3, P('nina', 'gleb', 'alla')),
    'p_c06b': (2, 3, P('konstantin', 'mamontov', 'lisitsyn')),
    'c06_cams': (2, 2, ['c06/cam1', 'c06/cam2', 'c06/cam3', 'c06/cam4']),
    'c06_ev1': (3, 3, ['c06/ev/visitlog', 'c06/ev/statement', 'c06/ev/shift', 'c06/ev/taxi6', 'c06/ev/hand', 'c06/ev/loanfile', 'c06/ev/wig', 'c06/ev/ninaphotos', 'c06/ev/fakepass']),
    'c06_ev2': (3, 3, ['c06/ev/note6', None, None, None, None, None, None, None, None]),
    'c07_cams': (2, 2, ['c07/cam1', 'c07/cam2', 'c07/cam3', 'c07/cam4']),
    'c07_ev1': (3, 3, ['c07/ev/album', 'c07/ev/canemark', 'c07/ev/tiremark', 'c07/ev/height', 'c07/ev/plate', 'c07/ev/wardlog', 'c07/ev/schedule', 'c07/ev/coat', 'c07/ev/moustache']),
    'c07_ev2': (3, 3, ['c07/ev/letter7', None, None, None, None, None, None, None, None]),
    'p_c08': (2, 3, P('olga', 'zubov', 'svetlana')),
    'p_c10': (2, 3, P('timur', 'ryabov', 'zeynalov')),
    'c08_ev1': (3, 3, ['c08/ev/rope', 'c08/ev/tank', 'c08/ev/vest', 'c08/ev/carmark', 'c08/ev/threat8', 'c08/ev/leash', 'c08/ev/lodgephoto', 'c08/ev/cashout', 'c08/ev/adchat']),
    'c08_ev2': (3, 3, ['c08/ev/dog', 'c08/ev/seller', 'c08/ev/niva8', 'c08/ev/cashbag', None, None, None, None, None]),
    'c09_ev1': (3, 3, ['c09/ev/bag14', 'c09/ev/ticket14', 'c09/ev/calls14', 'c09/ev/closure', 'c09/ev/fire14', 'c09/ev/studid', 'c09/ev/ruins', 'c09/ev/busstop', 'c09/ev/pier3']),
    'c09_ev2': (3, 3, ['c09/ev/flowers', 'c09/ev/cambag', 'c09/ev/draft', 'c09/ev/photokl', 'c09/ev/timeline', None, None, None, None]),
    'c10_ev1': (3, 3, ['c10/ev/wrench', 'c10/ev/dna', 'c10/ev/print10', 'c10/ev/tornpage', 'c10/ev/pageres', 'c10/ev/negatives', 'c10/ev/damage', 'c10/ev/suvtrack', 'c10/ev/suvcam']),
    'c10_ev2': (3, 3, ['c10/ev/folder', 'c10/ev/stopnote', None, None, None, None, None, None, None]),
    'c05_ev1': (3, 3, ['c05/ev/vpattern', 'c05/ev/padlock', 'c05/ev/panel5', 'c05/ev/archive', 'c05/ev/sample', 'c05/ev/gasoline', 'c05/ev/ring', 'c05/ev/origin', 'c05/ev/camlog']),
    'c05_ev2': (3, 3, ['c05/ev/cutters', 'c05/ev/cutmatch', 'c05/ev/fuel', 'c05/ev/note5', None, None, None, None, None]),
    'c04_ev1': (3, 3, ['c04/ev/body', 'c04/ev/autopsy', 'c04/ev/bottle', 'c04/ev/paint', 'c04/ev/prints', 'c04/ev/pocket', 'c04/ev/train', 'c04/ev/boat', 'c04/ev/boots45']),
    'c04_ev2': (3, 3, ['c04/ev/paintmatch', 'c04/ev/bootmatch4', 'c04/ev/burnt', 'c04/ev/note4', None, None, None, None, None]),
}
# отдельные картинки, которые идут не под своим именем
ALIAS = {}

def key_of(name):
    if name in ALIAS: return ALIAS[name]
    a, _, b = name.partition('_')
    return f'{a}/{b}'

def lum_profile(im, axis):
    g = im.convert('L')
    w, h = g.size
    px = g.load()
    if axis == 'x':  # средняя яркость каждого столбца
        return [sum(px[x, y] for y in range(0, h, 4)) / len(range(0, h, 4)) for x in range(w)]
    return [sum(px[x, y] for x in range(0, w, 4)) / len(range(0, w, 4)) for y in range(h)]

def cuts(profile, n):
    # границы n частей: около ожидаемых мест ищем самую тёмную полосу
    L = len(profile)
    bounds = [0]
    for k in range(1, n):
        c = L * k // n
        win = int(L * 0.08)
        lo, hi = max(1, c - win), min(L - 1, c + win)
        m = min(range(lo, hi), key=lambda i: profile[i])
        thr = profile[m] + 18
        a = m
        while a > lo and profile[a - 1] <= thr: a -= 1
        b = m
        while b < hi and profile[b + 1] <= thr: b += 1
        if profile[m] > 60:  # тёмной полосы нет — режем ровно
            a = b = c
        bounds.append((a, b))
    bounds.append(L)
    out = []
    for i in range(n):
        s = 0 if i == 0 else bounds[i][1] + 1
        e = L if i == n - 1 else bounds[i + 1][0]
        out.append((s, e))
    return out

def trim_dark(im, thr=22):
    # срезать оставшиеся по краям тёмные полоски-разделители
    w, h = im.size
    g = im.convert('L')
    def dark_col(x): return ImageStat.Stat(g.crop((x, 0, x + 1, h))).mean[0] < thr
    def dark_row(y): return ImageStat.Stat(g.crop((0, y, w, y + 1))).mean[0] < thr
    l, r, t, b = 0, w - 1, 0, h - 1
    while l < w // 10 and dark_col(l): l += 1
    while r > w - w // 10 and dark_col(r): r -= 1
    while t < h // 10 and dark_row(t): t += 1
    while b > h - h // 10 and dark_row(b): b -= 1
    return im.crop((l, t, r + 1, b + 1))

def save(im, key, size=None, square=False):
    path = os.path.join(OUT, key + '.webp')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = im.convert('RGB')
    if square:
        w, h = im.size
        s = min(w, h)
        im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    if size and max(im.size) > size:
        r = size / max(im.size)
        im = im.resize((round(im.size[0] * r), round(im.size[1] * r)), Image.LANCZOS)
    im.save(path, 'WEBP', quality=84, method=6)
    return path

def build(name):
    src = os.path.join(RAW, name + '.png')
    im = Image.open(src)
    if name in SHEETS:
        cols, rows, keys = SHEETS[name]
        xs = cuts(lum_profile(im, 'x'), cols)
        ys = cuts(lum_profile(im, 'y'), rows)
        i = 0
        report = []
        for (y0, y1) in ys:
            for (x0, x1) in xs:
                k = keys[i]; i += 1
                if not k: continue
                cell = trim_dark(im.crop((x0, y0, x1, y1)))
                portrait = k.startswith('p/')
                ev = '/ev/' in k
                save(cell, k, size=640 if (portrait or ev) else 1100, square=ev)
                report.append(f'{k} {cell.size[0]}x{cell.size[1]}')
        print(name, '->', ', '.join(report))
    else:
        k = key_of(name)
        save(im, k, size=1600)
        print(name, '->', k)

def main():
    names = [a for a in sys.argv[1:] if not a.startswith('-')]
    if not names:
        for f in sorted(os.listdir(RAW)):
            if not f.endswith('.png'): continue
            n = f[:-4]
            srcm = os.path.getmtime(os.path.join(RAW, f))
            first = (SHEETS[n][2][0] if n in SHEETS else key_of(n))
            dst = os.path.join(OUT, (first or '') + '.webp')
            if '--all' in sys.argv or not os.path.exists(dst) or os.path.getmtime(dst) < srcm:
                names.append(n)
    for n in names: build(n)
    # пока обложки дела нет (рисуется последней) — ставим вместо неё главное место дела
    import shutil
    for c, src in COVER_FALLBACK.items():
        dst = os.path.join(OUT, c, 'cover.webp')
        sp = os.path.join(OUT, src + '.webp')
        if not os.path.exists(dst) and os.path.exists(sp):
            shutil.copyfile(sp, dst)
            print('cover <-', src)

COVER_FALLBACK = {'c05': 'c05/corridor', 'c06': 'c06/prosecutor', 'c07': 'c07/garage', 'c08': 'c08/pier', 'c09': 'c09/archive', 'c10': 'c10/garage'}

main()
