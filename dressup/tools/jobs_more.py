"""Очередь 30.09: украшения, 5 корон, 15 платьев — вперемешку, чтобы всё прибывало понемногу.
python jobs_more.py → ../../dressup-art/jobs_more.json
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_jobs as M  # noqa: E402

ART = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'dressup-art')
RAW = os.path.join(ART, 'raw')
WANT = ['necklace_heart', 'necklace_ruby', 'earrings_crystal', 'bracelet_gold', 'earrings_heart', 'earrings_star', 'earrings_hoop',
        'necklace_sapphire', 'necklace_emerald', 'necklace_flower', 'bracelet_pearl', 'bracelet_flower',
        'head_crown_rose', 'head_crown_pearl', 'head_crown_heart', 'head_crown_star', 'head_crown_emerald',
        'dress_queen', 'dress_winter', 'dress_masq', 'dress_newyear', 'dress_school', 'dress_riding', 'dress_sport',
        'dress_ball_gold', 'dress_lavender', 'dress_rose_red', 'dress_snow', 'dress_peach', 'dress_rainbow', 'dress_starry', 'dress_tea']

it = {x[0]: x for x in M.ITEMS}
jew = [w for w in WANT if w.split('_')[0] in ('necklace', 'earrings', 'bracelet')]
cro = [w for w in WANT if w.startswith('head_')]
dre = [w for w in WANT if w.startswith('dress_')]
order = []
while jew or cro or dre:
    for L in (dre, jew, cro, dre):
        if L:
            order.append(L.pop(0))

jobs = []
for k, iid in enumerate(order):
    _, slot, what, noun = it[iid]
    have = os.path.exists(os.path.join(RAW, f'i_{iid}.png'))
    if not have:
        jobs.append({'name': 'i_' + iid, 'newChat': k % 6 == 0, 'attach': M.MAN,
                     'prompt': f'Надень на принцессу на приложенной картинке {what}. ' + M.KEEP})
        jobs.append({'name': 'g_' + iid, 'skipIfMissing': 'i_' + iid, 'prompt': M.GREEN.format(what=noun)})
    else:
        # картинка вещи уже есть — заливку делаем в новом чате, приложив её
        jobs.append({'name': 'g_' + iid, 'newChat': True, 'attach': os.path.join(RAW, f'i_{iid}.png').replace(os.sep, '/'),
                     'prompt': M.GREEN.format(what=noun).replace('На этой последней картинке', 'На приложенной картинке')})

json.dump(jobs, open(os.path.join(ART, 'jobs_more.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print(len(jobs), [j['name'] for j in jobs[:6]])
