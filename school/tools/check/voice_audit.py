# Прослушать записи голоса распознавателем Whisper (faster-whisper, модель small, офлайн) и сверить с текстом.
#   python school/tools/check/voice_audit.py            — только новые/изменённые с прошлого прослушивания
#   python school/tools/check/voice_audit.py --all      — все записи
#   python school/tools/check/voice_audit.py --ab a.json — подбор написания: каждая строка синтезируется 2 раза
# Отчёт: school-art/check/voice_audit.txt; что уже прослушано — school-art/check/heard.json {файл: услышано}.
# Помнить: Whisper пишет цифры цифрами, названия согласных — латиницей («Буква D»), «слова» слышит как «слава» —
# это норма. Одиночную «ы» голос не выговаривает (известно, в программе — с подсказкой-словом).
import json, re, sys, os, difflib, asyncio
from faster_whisper import WhisperModel
sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
VOICE = os.path.join(ROOT, 'assets', 'voice')
OUT = os.path.normpath(os.path.join(ROOT, '..', 'school-art', 'check'))
os.makedirs(OUT, exist_ok=True)
m = WhisperModel('small', device='cpu', compute_type='int8', cpu_threads=8)
NUMS = {'ноль': '0', 'один': '1', 'одна': '1', 'одно': '1', 'одну': '1', 'два': '2', 'две': '2', 'три': '3', 'четыре': '4', 'пять': '5',
        'шесть': '6', 'семь': '7', 'восемь': '8', 'девять': '9', 'десять': '10'}
def norm(t):
    w = re.sub(r'[^а-я0-9 ]', ' ', t.lower().replace('ё', 'е')).split()
    return ' '.join(NUMS.get(x, x) for x in w)
def hear(path):
    try:
        segs, _ = m.transcribe(path, language='ru', beam_size=5, temperature=0, condition_on_previous_text=False)
        return ' '.join(s.text for s in segs).strip()
    except Exception as e:
        return 'ФАЙЛ НЕ ОТКРЫЛСЯ ' + str(e)[:80]

if '--ab' in sys.argv:
    import edge_tts
    cands = json.load(open(sys.argv[sys.argv.index('--ab') + 1], encoding='utf-8'))
    for i, t in enumerate(cands):
        hs = []
        for r in range(2):
            p = os.path.join(OUT, f'ab_{i}_{r}.mp3')
            short = len(t) <= 3 and ' ' not in t
            asyncio.run(edge_tts.Communicate(t, 'ru-RU-SvetlanaNeural', rate='-25%' if short else '-8%', pitch='+6Hz').save(p))
            hs.append(hear(p))
        print(f'{t!r:45} → {hs}')
    sys.exit()

idx = json.load(open(os.path.join(VOICE, 'index.json'), encoding='utf-8'))
heard_file = os.path.join(OUT, 'heard.json')
heard = json.load(open(heard_file, encoding='utf-8')) if os.path.exists(heard_file) and '--all' not in sys.argv else {}
todo = [(t, f) for t, f in sorted(idx.items()) if f not in heard]
print('к прослушиванию', len(todo), flush=True)
for n, (t, f) in enumerate(todo):
    heard[f] = hear(os.path.join(VOICE, f))
    if n % 100 == 0:
        print(n, '/', len(todo), flush=True)
        json.dump(heard, open(heard_file, 'w', encoding='utf-8'), ensure_ascii=False)
json.dump(heard, open(heard_file, 'w', encoding='utf-8'), ensure_ascii=False)
bad = []
for t, f in todo:
    a, b = norm(t), norm(heard[f])
    if len(a) <= 4: continue
    r = difflib.SequenceMatcher(None, a, b).ratio()
    if r < 0.85 or heard[f].startswith('ФАЙЛ'): bad.append((round(r, 2), t, heard[f]))
bad.sort()
rep = [f'прослушано {len(todo)}, длинных фраз {sum(len(norm(t)) > 4 for t, _ in todo)}, подозрительных {len(bad)}'] + [repr(x) for x in bad]
open(os.path.join(OUT, 'voice_audit.txt'), 'w', encoding='utf-8').write('\n'.join(rep))
print('\n'.join(rep[:200]))
