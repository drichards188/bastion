# Crew voices: how they were made

The Russian fire-control callouts (`public/audio/voice/`) are synthetic speech generated offline, then given a shipboard intercom sound in the browser. This is the recipe that worked, step by step, so it can be repeated for other games and languages.

## 1. Engine and voices

- **Piper** (`pip install piper-tts`, the OHF-Voice piper1 package): offline neural TTS, fast on CPU, many languages. The tool's own licence does not cover its output.
- Voices come from [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices). **Read each voice's `MODEL_CARD` before using it**: the dataset licence is listed there. For Russian, `denis` and `dmitri` (CC0 datasets) were used; `irina` (unknown) and `ruslan` (CC BY-NC-SA) were rejected. Note what the voice was fine-tuned from: these two were fine-tuned from the English `lessac` voice, whose data is under a research licence, which is acceptable for a non-commercial project only.
- This machine has no `python3-venv`, so install into a folder and point `PYTHONPATH` at it: `pip install --target <dir>/pylib piper-tts soundfile numpy`, then `PYTHONPATH=<dir>/pylib python3 ...`.
- **Casting**: with two voices, measure each one's pitch (median f0 by autocorrelation of a test sentence) and give the deeper one to the officer giving orders, the other to the operator reporting back. Two distinct voices in a call-and-response is what makes it sound like a crew.

## 2. The line table

`tools/voice-lines.json`: one entry per line with `id`, `speaker`, `ru` (subtitle text), `en` (English subtitle), and `say` (the text actually sent to the TTS). Keep lines short and in a plausible service register: orders from the officer ("Захватить цель.", "Залпом, пуск!"), reports from the operator ("Есть захват. Цель на сопровождении.", "Первая пошла.").

## 3. Stress marks fix most mispronunciation

Piper phonemizes with espeak-ng, which guesses word stress and is often wrong (стре́льбы for стрельбы́, бо́ю for бою́). Check with `voice.phonemize(text)`: the `ˈ` shows the stressed vowel. Put a combining acute accent (U+0301) after the correct stressed vowel in `say` (`Це́пи стрельбы́ включи́ть.`); it moves the stress and is stripped from the subtitle. Marking every polysyllabic word is the safe default.

## 4. Pick the best take by transcribing it back

You cannot judge pronunciation by reading the text, and listening to 40 lines by hand is slow, so let a speech recogniser listen:

1. For each line synthesize several takes: `length_scale` at the speaker's default, 1.05 and 1.15; `noise_scale` at the default and 0.4 (cleaner articulation).
2. Transcribe each take with **faster-whisper** (`small`, `int8`, CPU, `language='ru'`). Decode the audio with `soundfile` and resample to 16 kHz with `np.interp`, then pass the array; faster-whisper's own decoder (PyAV) failed here with a version clash.
3. Score with `difflib.SequenceMatcher` between the normalised transcript and the intended text (lower case, ё as е, letters and spaces only). Keep the best take; stop early at 0.97 or better.
4. A line that stays below about 0.85 needs rewording, not more takes. Very short lines are the usual problem ("Цель поражена!" was heard as "Станет поражено"); give them context ("Есть попадание! Цель поражена!").

`tools/pick-voice-takes.py` does all of this and writes the chosen `length_scale` / `noise_scale` back into the line table, so `tools/make-voices.py` reproduces the winning takes.

```bash
D=/tmp/tts; pip install --target $D/pylib piper-tts soundfile numpy faster-whisper
# voices: https://huggingface.co/rhasspy/piper-voices (the .onnx and .onnx.json of each) into $D
PYTHONPATH=$D/pylib python3 tools/pick-voice-takes.py --models $D        # choose takes
PYTHONPATH=$D/pylib python3 tools/make-voices.py --models $D             # render public/audio/voice
```

## 5. Tidy and encode

Trim leading and trailing silence (threshold 0.02, keep 40 ms), remove DC, normalise the peak to about -1 dBFS, write 22.05 kHz mono MP3 with `soundfile` (libsndfile 1.2 writes MP3). 39 lines came to about 490 KB. `tools/make-voices.py --index-only` rebuilds `lines.json` from whatever files are present, so recorded or commercial replacements drop in under the same ids.

## 6. In the browser: the intercom and the queue

- **Intercom chain** (`src/fire-cues.js`): highpass 330 Hz, peaking EQ +6 dB at 2.2 kHz (Q 1), a tanh waveshaper (k 2.4, 2x oversample), lowpass 3.5 kHz, then the master, with a little send to the reverb (more on the bridge). A key click at the start and end of each line and a faint line hiss under it sell the loudspeaker.
- **Subtitles**: `«Russian» English` over the 3D view for the line's length plus a second.
- **One line at a time**: the next line starts when the previous one ends (`onended` plus 250 ms), not on a frame poll. Each queued line has a priority and a maximum wait (wall clock, `performance.now()`, never the game clock, which runs slow at low frame rates); a newer step line replaces an older one still waiting; order lines that fall in the same update deliberately (the firing order, then "first away", then "salvo complete").
- **Verify** by driving a full cycle in a headless browser and recording the subtitle text in order.
