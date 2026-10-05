# Записывает все реплики игры голосами нейросети Microsoft (edge-tts) → detective/assets/voice/*.mp3 + index.json
# Сначала: node detective/tools/collect_lines.mjs (→ detective-art/lines.json)
# python detective/tools/build_voice.py      — пишет только новое, лишнее удаляет
import asyncio, hashlib, json, os, re, subprocess, sys
import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'voice')
LINES = os.path.join(os.path.dirname(ROOT), 'detective-art', 'lines.json')

# Синтезатор ставит ~0,25 с тишины в начале и до 1,5 с в конце — обрезаем (как в «Школе Умки»).
TRIM = ('silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,'
        'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse')
def trim(path):
    tmp = path + '.tmp.mp3'
    r = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-af', TRIM, '-ac', '1', '-ar', '24000', '-b:a', '48k', tmp])
    if r.returncode == 0 and os.path.getsize(tmp) > 500: os.replace(tmp, path)
    elif os.path.exists(tmp): os.remove(tmp)

def num(s): return int(re.sub(r'[^-\d]', '', s) or 0)

# что произнести вместо написанного (ключ остаётся прежним)
SAY = [
    (r'«|»', ''),                    # кавычки голос не читает, но иногда делает паузы
    (r'ВМТ-9', 'вэ эм тэ девять'),
    (r'№\s?', 'номер '),
    (r'КАСКО', 'каско'),
    (r'ПТС', 'пэ тэ эс'),
    (r'(?<![А-Яа-я])Б-(\d+)', r'бэ \1'),  # ячейка «Б-14» — «бэ четырнадцать»
    (r'\s—\s', ', '),
    (r'\s*→\s*', ', затем '),       # «Места → Двор» в подсказках: «Места, затем Двор»
]
def speakable(t):
    for a, b in SAY: t = re.sub(a, b, t)
    return t

def params(l):
    rate, pitch = num(l['rate']), num(l['pitch'])
    if l.get('mood') == 'tense': rate += 6; pitch += 3
    return f'{rate:+d}%', f'{pitch:+d}Hz'

async def one(l, sem, index):
    rate, pitch = params(l)
    spoken = speakable(l['text'])
    name = hashlib.sha1(f"{l['voice']}|{rate}|{pitch}|{spoken}".encode()).hexdigest()[:16] + '.mp3'
    index[l['key']] = name
    path = os.path.join(OUT, name)
    if os.path.exists(path) and os.path.getsize(path) > 0: return 0
    async with sem:
        for attempt in range(5):
            try:
                await edge_tts.Communicate(spoken, l['voice'], rate=rate, pitch=pitch).save(path)
                await asyncio.to_thread(trim, path)
                return 1
            except Exception as e:
                await asyncio.sleep(2 + attempt * 3)
        print('НЕ ЗАПИСАНО:', l['key'], file=sys.stderr)
        index.pop(l['key'], None)
        if os.path.exists(path): os.remove(path)
        return 0

async def main():
    os.makedirs(OUT, exist_ok=True)
    lines = json.load(open(LINES, encoding='utf-8'))
    index, sem = {}, asyncio.Semaphore(6)
    made = sum(await asyncio.gather(*(one(l, sem, index) for l in lines)))
    keep = set(index.values())
    for f in os.listdir(OUT):
        if f.endswith('.mp3') and f not in keep: os.remove(os.path.join(OUT, f))
    json.dump(index, open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'реплик {len(index)}, записано новых {made}')

asyncio.run(main())
