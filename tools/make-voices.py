#!/usr/bin/env python3
"""Generate the Russian crew callouts in public/audio/voice/ from tools/voice-lines.json.

Uses Piper (https://github.com/OHF-Voice/piper1-gpl), an offline neural text-to-speech engine, with
the ru_RU "denis" and "dmitri" voices (trained on CC0 datasets; see public/audio/CREDITS.md). The
output is plain speech; the game adds the shipboard intercom sound at runtime (src/fire-cues.js).

    pip install piper-tts soundfile numpy
    # voices: https://huggingface.co/rhasspy/piper-voices/tree/main/ru/ru_RU/{denis,dmitri}/medium
    python3 tools/make-voices.py --models DIR_WITH_ONNX [--only id,id]

To use other voices (a cloud service or recorded actors), drop files with the same ids into
public/audio/voice/ and rerun with --index-only to rebuild lines.json from what is there.
"""
import argparse
import json
import pathlib
import wave
import io

import numpy as np
import soundfile as sf

ROOT = pathlib.Path(__file__).resolve().parent.parent
LINES = ROOT / 'tools' / 'voice-lines.json'
OUT = ROOT / 'public' / 'audio' / 'voice'


def synthesize(voice, text, length_scale, noise_scale=None):
    from piper import SynthesisConfig
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        voice.synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=length_scale, noise_scale=noise_scale))
    buf.seek(0)
    audio, rate = sf.read(buf, dtype='float32')
    return audio, rate


def tidy(audio, rate):
    # Trim silence (keep 40 ms either side), remove DC, peak-normalise to -1 dBFS.
    level = np.abs(audio)
    voiced = np.where(level > 0.02)[0]
    if len(voiced):
        pad = int(0.04 * rate)
        audio = audio[max(0, voiced[0] - pad):min(len(audio), voiced[-1] + pad)]
    audio = audio - audio.mean()
    peak = np.abs(audio).max() or 1.0
    return audio / peak * 0.89


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', default='.', help='directory holding the .onnx and .onnx.json voices')
    ap.add_argument('--only', default='', help='comma-separated line ids to regenerate')
    ap.add_argument('--index-only', action='store_true', help='rebuild lines.json from existing files')
    args = ap.parse_args()

    spec = json.loads(LINES.read_text(encoding='utf-8'))
    OUT.mkdir(parents=True, exist_ok=True)
    only = set(filter(None, args.only.split(',')))
    voices = {}
    index = {}
    for line in spec['lines']:
        path = OUT / f"{line['id']}.mp3"
        if not args.index_only and (not only or line['id'] in only):
            speaker = spec['speakers'][line['speaker']]
            name = speaker['voice']
            if name not in voices:
                from piper import PiperVoice
                voices[name] = PiperVoice.load(str(pathlib.Path(args.models) / f'{name}.onnx'))
            audio, rate = synthesize(voices[name], line.get('say', line['ru']), line.get('length_scale', speaker.get('length_scale', 1.0)), line.get('noise_scale'))
            sf.write(path, tidy(audio, rate), rate, format='MP3')
        if path.exists():
            info = sf.info(path)
            index[line['id']] = {'file': path.name, 'speaker': line['speaker'], 'ru': line['ru'], 'en': line['en'], 'seconds': round(info.duration, 2)}
    (OUT / 'lines.json').write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{len(index)} lines in {OUT}')


if __name__ == '__main__':
    main()
