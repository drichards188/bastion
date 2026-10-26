# Kirov model references

The playable ship is the original Soviet Project 1144 **Kirov**, in a mid-1980s configuration. It is not Pyotr Velikiy or the modernized Admiral Nakhimov. Geometry is a procedural visual reconstruction, not a shipyard drawing.

## Exterior photos inspected

- [USN, Kirov foredeck, 1 October 1985](https://commons.wikimedia.org/wiki/File:Kirov_forward_launchers.jpg): local `kirov-forward.jpg`; public domain. Confirms the four-column/five-row Granit bank, Fort forward of it, Metel twin launcher forward, Osa and four forward AK-630s along the flanks. The model uses one visible launch aperture per octuple Fort magazine.
- [USN, Kirov aft section, 1 October 1986](https://commons.wikimedia.org/wiki/File:Battlecruiser_Kirov_aft_section_1986.jpg): local `kirov-aft.jpg`; public domain. Confirms tandem centerline single AK-100 mounts, two pairs of aft AK-630s, helicopter deck, below-deck hangar/elevator and aft Top Dome antenna.
- [USN, Kirov anchored, 30 October 1985](https://commons.wikimedia.org/wiki/File:ARKR_Kirov_1985_anchored.jpg): `photos/kirov-1985-bow.jpg`; public domain. Used for stepped bridge and paired oval radar silhouette. The modeled tactical number 065 follows the 30 October 1985 bow photograph. The separate 1 October foredeck image shows 061; numbers changed over the ship's service.

## Original ship's bridge photos inspected

[Oleg Kuleshov's photographic report of Kirov's 35th anniversary, 2015, Korabel.ru](https://www.korabel.ru/news/comments/kak_atomnyy_kreyser_kirov_otmetil_svoe_35-letie.html) contains interior photographs of the original Kirov, renamed Admiral Ushakov. Reference copies in `photos/` are local study material; they are not textures or runtime assets and must not be redistributed as licensed game art.

Observed features incorporated: pale sea-green surfaces, wooden window sill, brown deck, heavy window ribs, bronze window dogs, off-white ribbed overhead, gray pedestals with twin chrome lever handles. The compartment dimensions, console positions, rear bulkhead, and three operational radar displays are reconstruction/gameplay interpretation. These later photographs do not prove every fitting's exact 1986 state. The model does not claim a fully documented 1986 bridge or combat-information-center replica.

## Modeling approach

The custom hull loft, primitive-based fittings and static geometry batching follow the approach in the user's Battle Stations project. Each scene is drawn from local procedural geometry and generated textures. No photographs are embedded in the game. Navigation and weapons displays are gameplay controls; actual combat-system operation would involve additional spaces and crew.

Nine procedural watchkeepers occupy the bridge and weather decks. Their poses and uniforms suggest naval watchstanding; they are not reconstructions of photographed individuals. Radar pivots, the naval ensign and watchkeepers' heads/bodies animate continuously through the model's `animate(time, dt, state)` callback.

Surface finish uses generated paint speckle, restrained runoff streaks and wood grain, plus repeated hull UVs; no image assets are required. Instrument and sign textures match their physical aspect ratios. The Perry-inspired enemy carries a recognizable Mk15 Phalanx radome and Gatling mount rather than a Soviet AK-630.

Launch animation opens the selected Granit hatch or Fort aperture cover and elevates/recoils the selected Osa rail. Timing is illustrative; open lids remain raised briefly and then close. Each weapon uses its own actual modeled launcher anchor.
