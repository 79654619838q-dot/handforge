# Проверка озвучки: Whisper распознаёт каждую запись, сравниваем с текстом реплики.
# python detective/tools/voice_qa.py [--all]  → detective-art/voice_qa.json, печатает худшие
# Без --all проверяет только записи, которых ещё нет в отчёте.
import json, os, re, sys, difflib
from faster_whisper import WhisperModel
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(os.path.dirname(ROOT), 'detective-art')
VOICE = os.path.join(ROOT, 'assets', 'voice')
index = json.load(open(os.path.join(VOICE, 'index.json'), encoding='utf-8'))
rep_path = os.path.join(ART, 'voice_qa.json')
rep = {} if '--all' in sys.argv or not os.path.exists(rep_path) else json.load(open(rep_path, encoding='utf-8'))
NUM = {'0':'ноль','1':'один','2':'два','3':'три','4':'четыре','5':'пять','6':'шесть','7':'семь','8':'восемь','9':'девять'}
def norm(t):
    t = t.lower().replace('ё', 'е')
    t = re.sub(r'[^а-яa-z0-9 ]', ' ', t)
    return ' '.join(t.split())
m = WhisperModel('small', device='cpu', compute_type='int8')
todo = [(k, f) for k, f in index.items() if rep.get(k, {}).get('file') != f]
for i, (k, f) in enumerate(todo):
    who, text = k.split('|', 1)
    segs, _ = m.transcribe(os.path.join(VOICE, f), language='ru', beam_size=5)
    heard = ' '.join(s.text.strip() for s in segs)
    a, b = norm(text).split(), norm(heard).split()
    score = difflib.SequenceMatcher(None, a, b).ratio()
    rep[k] = {'file': f, 'heard': heard, 'score': round(score, 3)}
    if i % 20 == 0: json.dump(rep, open(rep_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
json.dump(rep, open(rep_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
bad = sorted(((v['score'], k, v['heard']) for k, v in rep.items() if k in index), key=lambda x: x[0])
print('проверено', len(todo), 'всего', len(bad))
for s, k, h in bad[:25]:
    if s < 0.8: print(f'{s:.2f}  {k}\n      слышно: {h}')
