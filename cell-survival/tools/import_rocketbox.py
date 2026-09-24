"""Импорт реалистичных людей из Microsoft Rocketbox (лицензия MIT) в игру.

python tools/import_rocketbox.py Male_Adult_05 Female_Adult_03 ...

Для каждого аватара: скачивает FBX и текстуры, ужимает текстуры 2048 TGA (~90 МБ)
до 1024 JPG/PNG (~1–2 МБ) и кладёт в public/assets/avatar/people/<имя>/.
Карты specular не нужны (игра использует roughness) — пропускаются.
Имена в FBX остаются *.tga — игра подменяет расширение при загрузке (AvatarManager).
"""
import io
import json
import os
import sys
import urllib.request

from PIL import Image, ImageOps

REPO = 'https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets/Avatars'
API = 'https://api.github.com/repos/microsoft/Microsoft-Rocketbox/contents/Assets/Avatars'
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'avatar', 'people')
SIZE = 1024
ONLY_REALISM = '--realism' in sys.argv  # докачать только лицо 2K и карты блеска


def get(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read()


def group_of(name):
    return 'Professions' if not name.startswith(('Male_Adult', 'Female_Adult', 'Male_Party', 'Female_Party')) else 'Adults'


def import_one(name):
    grp = group_of(name)
    dst = os.path.join(OUT, name)
    os.makedirs(dst, exist_ok=True)
    total = 0
    if not ONLY_REALISM:
        fbx = get(f'{REPO}/{grp}/{name}/Export/{name}.fbx')
        open(os.path.join(dst, f'{name}.fbx'), 'wb').write(fbx)
        total = len(fbx)
    listing = json.loads(get(f'{API}/{grp}/{name}/Textures'))
    for item in listing:
        fn = item['name']
        if not fn.lower().endswith('.tga'):
            continue
        base = os.path.splitext(fn)[0]
        if ONLY_REALISM and not ('body_color' in fn):
            continue
        im = Image.open(io.BytesIO(get(item['download_url'])))
        if 'specular' in fn:
            # блеск → шероховатость для PBR: инверсия, 512 хватает (карта плавная)
            im = ImageOps.invert(im.convert('L')).resize((512, 512), Image.LANCZOS)
            path = os.path.join(dst, base.replace('specular', 'roughness') + '.jpg')
            im.save(path, quality=88)
            total += os.path.getsize(path)
            continue
        # лицо и одежда — в полном 2K (реализм), остальное 1024
        size = 2048 if ('head_color' in fn or 'body_color' in fn) else SIZE // 2 if im.mode == 'RGBA' else SIZE  # волосы/ресницы: 512 хватает
        im = im.resize((size, size), Image.LANCZOS)
        if im.mode == 'RGBA':  # волосы, ресницы — нужна прозрачность
            path = os.path.join(dst, base + '.png')
            im.save(path, optimize=True)
        else:
            path = os.path.join(dst, base + '.jpg')
            im.convert('RGB').save(path, quality=86 if 'normal' not in fn else 92)
        total += os.path.getsize(path)
    # превью для экрана профиля
    if not ONLY_REALISM:
        prev = Image.open(io.BytesIO(get(f'{REPO}/{grp}/{name}/{name}.png')))
        prev.thumbnail((640, 360))
        prev.save(os.path.join(dst, 'preview.png'), optimize=True)
    print(f'{name}: {total / 1e6:.1f} MB')


if __name__ == '__main__':
    for n in [a for a in sys.argv[1:] if not a.startswith('--')]:
        try:
            import_one(n)
        except Exception as e:  # один сбойный аватар не должен ронять остальные
            print(f'{n}: ОШИБКА {e}')
