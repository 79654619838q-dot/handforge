# Записывает фразы программы нейронным голосом Microsoft (edge-tts) в assets/voice/*.mp3
# и составляет assets/voice/index.json {фраза: файл}. Уже записанные не перезаписывает.
# python school/tools/build_voice.py            (сначала: node school/tools/collect_phrases.mjs)
import asyncio, hashlib, json, os, subprocess, sys
import edge_tts

# Синтезатор ставит ~0,25 с тишины в начале и до 1,5 с в конце — между фразами выходили
# долгие провалы, а короткое «а» терялось. Обрезаем, оставляя 0,06 с в начале и 0,12 с в конце.
TRIM = ('silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.06,areverse,'
        'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.12,areverse')
def trim(path):
    tmp = path + '.tmp.mp3'
    r = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-af', TRIM, '-ac', '1', '-ar', '24000', '-b:a', '48k', tmp])
    if r.returncode == 0 and os.path.getsize(tmp) > 500: os.replace(tmp, path)
    elif os.path.exists(tmp): os.remove(tmp)

VOICE = 'ru-RU-SvetlanaNeural'
RATE, PITCH = '-8%', '+6Hz'   # чуть медленнее и теплее — для малыша
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'voice')
PHRASES = os.path.join(os.path.dirname(ROOT), 'school-art', 'phrases.json')

# Одиночные слоги и звуки синтезатор иногда читает как буквы или слишком быстро —
# проговариваем их отдельно и медленнее.
def settings(text):
    short = len(text) <= 3 and ' ' not in text
    return ('-25%' if short else RATE), PITCH


async def one(text, sem, index):
    name = hashlib.sha1(f'{VOICE}|{text}'.encode()).hexdigest()[:14] + '.mp3'
    index[text] = name
    path = os.path.join(OUT, name)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return 0
    rate, pitch = settings(text)
    async with sem:
        for attempt in range(4):
            try:
                await edge_tts.Communicate(text, VOICE, rate=rate, pitch=pitch).save(path)
                await asyncio.to_thread(trim, path)
                return 1
            except Exception as e:  # сеть/лимит — пробуем ещё
                await asyncio.sleep(2 + attempt * 3)
        print('НЕ ЗАПИСАНО:', text, file=sys.stderr)
        index.pop(text, None)
        return 0


async def main():
    os.makedirs(OUT, exist_ok=True)
    phrases = json.load(open(PHRASES, encoding='utf-8'))
    index, sem = {}, asyncio.Semaphore(8)
    made = sum(await asyncio.gather(*(one(t, sem, index) for t in phrases)))
    # лишние файлы от старых фраз — убрать
    keep = set(index.values())
    for f in os.listdir(OUT):
        if f.endswith('.mp3') and f not in keep:
            os.remove(os.path.join(OUT, f))
    json.dump(index, open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'фраз {len(index)}, записано новых {made}')

if __name__ == '__main__' and '--trim-all' in sys.argv:  # один раз: обрезать уже записанное
    import concurrent.futures as cf
    files = [os.path.join(OUT, f) for f in os.listdir(OUT) if f.endswith('.mp3')]
    with cf.ThreadPoolExecutor(8) as ex: list(ex.map(trim, files))
    print('обрезано', len(files))
else:
    asyncio.run(main())
