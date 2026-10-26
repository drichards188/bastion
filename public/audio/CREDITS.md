# Bastion sound recordings

These files are reused from the owner's Battle Stations and Echelon projects. They are Freesound's MP3 preview encodings; the source licenses apply to these encodings too. All six recordings are CC0. Recordings are cut, normalized, filtered, pitch-shifted and layered with original WebAudio synthesis.

| File | Source | Author | License |
|---|---|---|---|
| `bow-wave-360631.mp3` | [Sailing boat, bow wave (close perspective)](https://freesound.org/s/360631/) | Pfannkuchn | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `explosion-182429.mp3` | [Explosion](https://freesound.org/s/182429/) (from US government video) | qubodup | CC0 1.0 |
| `distant-explosions-438693.mp3` | [G43-14-25 Distant Explosions](https://freesound.org/s/438693/) | craigsmith | CC0 1.0 |
| `metal-pole-drop-188206.mp3` | [Metal pole, dropping, set down, metal ring](https://freesound.org/s/188206/) | SpliceSound | CC0 1.0 |
| `avenger50-160355.mp3` | [Air Defense Artillery Avenger Training .50cal](https://freesound.org/s/160355/) (US Army) | qubodup | CC0 1.0 |
| `rapidfire-486053.mp3` | [R30-43-Rapid-Fire Machine Gun](https://freesound.org/s/486053/) | craigsmith | CC0 1.0 |

These are sound-design ingredients, not claimed recordings of Kirov, an AK-630 or a Granit missile. Machinery, wind, launch roar, low-frequency blast, interface tones, chaff discharge and the general alarm are synthesized. No US Navy spoken alarm is presented as a Soviet crew recording. Optional speech uses the browser's installed voices and is disabled by default.

## Russian crew callouts (`voice/`)

The fire-control callouts in `voice/*.mp3` (indexed by `voice/lines.json`) are synthetic speech, generated offline by `tools/make-voices.py` from the text in `tools/voice-lines.json` with [Piper](https://github.com/OHF-Voice/piper1-gpl) and its `ru_RU-denis-medium` (officer) and `ru_RU-dmitri-medium` (operator) voices from [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices). They are not recordings of people. The game adds the intercom sound at runtime.

Licence notes: both Russian voice datasets are listed as CC0 in their model cards. Both voices were fine-tuned from Piper's English `lessac` voice, whose training data (Blizzard 2013, Lessac Technologies) is under a research licence. That is acceptable for this source-available, non-commercial project; a commercial release should replace these files with a commercially licensed TTS service or recorded voice actors. Any replacement drops in under the same ids: put the files in `voice/` and run `python3 tools/make-voices.py --index-only`.

The lines are game dialogue in a plausible Soviet naval register, not quotations of real drill. Each line was checked for intelligibility by transcribing it back with Whisper; stress marks in `voice-lines.json` correct the synthesiser where it guessed the wrong syllable.
