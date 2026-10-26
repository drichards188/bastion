# History and sources

Bastion depicts two Soviet Northern Fleet missile cruisers in a **mid-1980s fit: the original nuclear-powered Kirov (Project 1144) and the Slava (Project 1164)**. The engagement is fictional. Nuclear propulsion describes the ship's machinery; the playable weapons use conventional warheads.

## Evidence and reconstruction

The original ship's 1985 US Navy photographs anchor the exterior. In particular, the [dated aerial foredeck photograph](https://commons.wikimedia.org/wiki/File:Image-Kirov_forward_launchers_highlighted.jpg) identifies the Granit, Fort, Osa, AK-630 and Metel positions. The [October 1985 bow photograph](https://commons.wikimedia.org/wiki/File:ARKR_Kirov_1985_anchored.jpg) shows hull number 065 and the superstructure. The model does not combine this ship with *Pyotr Velikiy*'s later weapons fit.

The bridge uses [Oleg Kuleshov's photographs aboard the original Kirov at its 35th anniversary](https://www.korabel.ru/news/comments/kak_atomnyy_kreyser_kirov_otmetil_svoe_35-letie.html). Green frames, timber sills, metal window hardware and control pedestals come from those images. They were taken decades after the playable period. The overall room dimensions, unseen equipment and functional screen layout are interpretations. See [the photo index](../refs/README.md).

## Weapons in this version

The values below describe the game's selected public-data envelope. Range is a launch limit, not a promise that every shot will intercept. Speeds vary during acceleration and flight. Detailed seeker behavior, damage and probability of kill are game models.

| System | Initial magazine | Modeled character |
|---|---:|---|
| P-700 Granit / SS-N-19 | 20 | Heavy supersonic anti-ship missile; 550 km nominal envelope, high and low flight segments, conventional 750 kg warhead representation. |
| S-300F Fort / 5V55RM | 96 | Cold-launch area air defense; selected 7–75 km envelope, 25 m minimum target altitude, limited simultaneous target channels, radar support required. |
| Osa-M family / SA-N-4 | 40 | Short-range command-guided defense; selected 1.5–10 km envelope and two director channels. Early low-altitude limitations matter. |
| AK-630 | 16,000 ready rounds across eight mounts | Automatic close-in defense; short bursts within a conservative 2.5 km anti-missile engagement gate. |
| Early Harpoon / AGM/RGM-84 | Scenario-defined enemy load | Subsonic anti-ship missile, approximately 267 m/s, low flight and terminal radar homing. No modern GPS or networked retargeting features. |

Two AK-100 single gun turrets and antisubmarine fittings belong to the ship's visual fit; they are not separate playable weapon systems in this version. The scenario covers surface, air and incoming missile threats. It does not simulate submarine warfare.

## Public technical sources

- [Rosoboronexport AK-630M product sheet](https://roe.ru/pdfs/pdf_6536.pdf): primary manufacturer/exporter specification, 4,000–5,000 rounds/minute, 2,000 rounds per mount and a 4–5 km published range. The game's shorter anti-missile gate is a deliberate conservative engagement rule, not a replacement for that published range.
- [US Navy Harpoon fact file](https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2168358/harpoon-missile/harpoon-missile/): primary source for sea-skimming flight, active terminal radar and air/ship launch. The fact file also describes modern upgrades; those are not used for the 1980s scenario.
- [Smithsonian National Museum of American History: other submarine armament](https://www.americanhistory.si.edu/subs/weapons/armament/other/index.html): historical early Harpoon context, approximately 100 km range and 960 km/h cruise speed. Aircraft and surface launch configurations differ; the game uses a common simplified early-family envelope.
- [Saint Petersburg State University of Aerospace Instrumentation, air-defense teaching material](https://fs.guap.ru/uvc/meth/4_17.pdf): public educational comparison of S-300 variants, including the naval 5V55RM. It is a comparison reference, not a complete fire-control manual.
- [Nordic Nuclear Safety Research: Russian nuclear ships](https://www.nks.org/scripts/getdocument.php?file=111010111119756): research report identifying Project 1144/1144.2, twin nuclear reactors and class dimensions. Length and displacement figures vary with source and configuration; the visual hull uses approximately 252 × 28.5 m.

## What realism means here

Distances and velocities use meters and seconds; ship controls display knots. The simulation includes radar horizon, finite ammunition, launch intervals, altitude and range envelopes, limited guidance channels, moving launch positions and missile travel time.

Public sources disagree on some Soviet variants and envelopes. The 75 km Fort limit and conservative Osa altitude floor are explicit implementation choices. Granit guidance is simplified; cooperative salvo intelligence and classified electronic counter-countermeasures are not claimed. There is no real-world predictive validity.

Hit probabilities, hull percentages, subsystem damage, chaff effectiveness, contact certainty, enemy reactions and encounter timing are authored game rules. A weapon's warhead mass is historical context; damage points are not calculated structural damage. The tactical overlay exposes weapons command from the bridge for playability; it is not a reconstruction of Soviet combat-information-center procedures.
