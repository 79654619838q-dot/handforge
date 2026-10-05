# Сетка поверх картинки для разметки точек осмотра: линии через 5%, подписи в долях.
# python detective/tools/grid.py c01/yard out.jpg
import sys, os
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
key, out = sys.argv[1], sys.argv[2]
im = Image.open(os.path.join(ROOT, 'assets', 'img', key + '.webp')).convert('RGB')
W, H = im.size
d = ImageDraw.Draw(im)
try: f = ImageFont.truetype('arial.ttf', 16)
except Exception: f = ImageFont.load_default()
for i in range(1, 20):
    x = W * i / 20; y = H * i / 20
    c = (255, 255, 0) if i % 2 == 0 else (0, 255, 255)
    d.line([(x, 0), (x, H)], fill=c, width=1)
    d.line([(0, y), (W, y)], fill=c, width=1)
    if i % 2 == 0:
        d.text((x + 2, 2), f'{i/20:.1f}', fill=c, font=f)
        d.text((2, y + 2), f'{i/20:.1f}', fill=c, font=f)
im.save(out, quality=85)
