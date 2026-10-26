#!/usr/bin/env python3
"""Choose the clearest synthesis settings for each line in tools/voice-lines.json.

For every line it synthesizes several takes with Piper (length_scale at the speaker's default, 1.05
and 1.15; noise_scale at the default and 0.4), transcribes each take with faster-whisper, scores the
transcript against the intended text, and writes the winning length_scale / noise_scale back into the
line table. tools/make-voices.py then renders those takes. Lines that still score below 0.85 are
listed as WEAK: reword them (short lines usually need more context), do not just add takes.

    pip install --target DIR piper-tts soundfile numpy faster-whisper
    PYTHONPATH=DIR python3 tools/pick-voice-takes.py --models DIR_WITH_ONNX [--only id,id] [--lang ru]

See docs/VOICES.md for the whole recipe.
"""
import argparse
import difflib
import io
import json
import pathlib
import wave

import numpy as np
import soundfile as sf

ROOT = pathlib.Path(__file__).resolve().parent.parent
LINES = ROOT / 'tools' / 'voice-lines.json'


def norm(text):
    text = text.lower().replace('ё', 'е')
    return ' '.join(''.join(ch for ch in text if ch.isalpha() or ch == ' ').split())


def take(voice, text, length_scale, noise_scale):
    from piper import SynthesisConfig
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        voice.synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=length_scale, noise_scale=noise_scale))
    buf.seek(0)
    audio, rate = sf.read(buf, dtype='float32')
    # Whisper wants 16 kHz; resampling here avoids faster-whisper's own decoder (PyAV version clashes).
    t = np.arange(0, len(audio) / rate, 1 / 16000)
    return np.interp(t, np.arange(len(audio)) / rate, audio).astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', default='.')
    ap.add_argument('--only', default='')
    ap.add_argument('--lang', default='ru')
    ap.add_argument('--whisper', default='small')
    args = ap.parse_args()

    from faster_whisper import WhisperModel
    from piper import PiperVoice
    spec = json.loads(LINES.read_text(encoding='utf-8'))
    asr = WhisperModel(args.whisper, device='cpu', compute_type='int8')
    voices = {}
    only = set(filter(None, args.only.split(',')))
    weak = []
    for line in spec['lines']:
        if only and line['id'] not in only:
            continue
        base = spec['speakers'][line['speaker']]
        if base['voice'] not in voices:
            voices[base['voice']] = PiperVoice.load(str(pathlib.Path(args.models) / f"{base['voice']}.onnx"))
        voice, best = voices[base['voice']], None
        for ls in [base.get('length_scale', 1.0), 1.05, 1.15]:
            for ns in [None, 0.4]:
                segments, _ = asr.transcribe(take(voice, line.get('say', line['ru']), ls, ns), language=args.lang, beam_size=5)
                heard = ' '.join(s.text.strip() for s in segments)
                score = difflib.SequenceMatcher(None, norm(heard), norm(line['ru'])).ratio()
                if not best or score > best[0] + 0.02:
                    best = (score, ls, ns, heard)
                if score >= 0.97:
                    break
            if best[0] >= 0.97:
                break
        line.pop('length_scale', None)
        line.pop('noise_scale', None)
        if best[1] != base.get('length_scale', 1.0):
            line['length_scale'] = best[1]
        if best[2] is not None:
            line['noise_scale'] = best[2]
        if best[0] < 0.85:
            weak.append(line['id'])
        print(f"{line['id']:16s} {best[0]:.2f} ls={best[1]} ns={best[2]}  heard: {best[3]}", flush=True)
    LINES.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('WEAK', weak)


if __name__ == '__main__':
    main()
