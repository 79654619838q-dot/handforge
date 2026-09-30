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

# Что синтезатор должен прочитать вместо надписи (ключ в index.json — прежний текст).
# Проверено распознаванием речи (scratchpad asr.py, Vosk): без правки нейронный голос читает
# отдельную «о» как [а] («найди букву а»), слоги «по/во/до/со/ко» — как предлоги [па], [са],
# одиночную «ы» — нечётко (слышно «и»/«э»). С ударением / протяжно / подсказкой-словом — верно.
import re
ACUTE = '\u0301'
def speakable(text):
    # Проверено Whisper (scratchpad ab.py, по 2 дубля): гласная-буква без кавычек сливается со словом
    # («Найди букву и» → «найди буквы», «букву а» → «буква»); в кавычках — чётко; «о» даже в кавычках
    # звучит [а] — только протяжно «о-о». Одиночную «ы» голос не произносит вовсе — с подсказкой-словом.
    t = text
    bare = t.strip(' .,!?').lower()
    if bare in ('о', 'у', 'э'): return f'{bare}-{bare}'
    if bare == 'ы': return 'ы, как в слове мы'
    if bare in WORD_FIX and t.strip(' .,!?') == bare: return WORD_FIX[bare]
    if bare in SYL_FIX and t.strip(' .,!?') == t.strip(' .,!?').lower(): return SYL_FIX[bare]
    VOW = 'аеёиоуыэюя'
    def q(v):
        v = v.lower()
        return '«о-о»' if v == 'о' else ('«у-у»' if v == 'у' else ('«э-э»' if v == 'э' else f'«{v}»'))
    ctx = r'(букв[ауы]|звук:?)'
    t = re.sub(ctx + r' ы(?= в )', lambda m: f'{m[1]} «ы»', t)  # «ы в слове сыр» — слово уже есть, подсказка не нужна
    t = re.sub(ctx + r' ы(?=[.,!?]|$)', lambda m: f'{m[1]} «ы», как в слове мы', t)
    # согласная-буква без кавычек сливается со словом («Буква дэ» → «бук воды», «букву нэ в слове» → «на условии»)
    t = re.sub(ctx + r' ([бвгджзклмнпрстфхцчшщ]э)(?=[.,!?:]| в |$)', lambda m: f'{m[1]} «{m[2]}»', t)
    t = re.sub(ctx + r' ([' + VOW + r'])(?=[.,!?]| в |$)', lambda m: f'{m[1]} {q(m[2])}', t)
    t = re.sub(r'(^|\. )([ОУЭАИЕЁЮЯ]) —', lambda m: f'{m[1]}{q(m[2]).strip("«»").capitalize()} —', t)
    t = re.sub(r'(слог )([а-яё]{1,4})(?=[.,!?]|$)', lambda m: f'{m[1]}«{SYL_FIX.get(m[2], m[2])}»', t)
    t = re.sub(r'(?i)йогурт', lambda m: 'ёгурт' if m[0][0] == 'й' else 'Ёгурт', t)
    return t
# слоги, которые голос читает неверно (Vosk, закрытый выбор, 2 дубля): «по/во/до/со/ко» — как предлоги [па],
# «ла» — как [ло]. Протяжно — верно. Остальные слоги (бо, го, ма, ра, ша…) проверены — звучат правильно.
# отдельные слова: «жёлудь» один (по нажатию на картинку) Whisper и Vosk оба слышат как «желать»;
# «жо́лудь» — верно. Во фразах слово звучит правильно и не трогается.
WORD_FIX = {'жёлудь': 'жо́лудь'}
SYL_FIX = {'по': 'поо', 'во': 'воо', 'до': 'доо', 'со': 'соо', 'ко': 'коо', 'ла': 'лаа'}

# Одиночные слоги и звуки синтезатор иногда читает как буквы или слишком быстро —
# проговариваем их отдельно и медленнее.
def settings(text):
    short = len(text) <= 3 and ' ' not in text
    return ('-25%' if short else RATE), PITCH


async def one(text, sem, index):
    spoken = speakable(text)
    # в имени — то, что реально произнесено: поправили произношение — запишется заново
    name = hashlib.sha1(f'{VOICE}|v2|{spoken}'.encode()).hexdigest()[:14] + '.mp3'  # v2 — после обрезки тишины
    index[text] = name
    path = os.path.join(OUT, name)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return 0
    rate, pitch = settings(text)
    async with sem:
        for attempt in range(4):
            try:
                await edge_tts.Communicate(spoken, VOICE, rate=rate, pitch=pitch).save(path)
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
