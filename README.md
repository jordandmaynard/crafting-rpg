# Emberwild

A fantasy survival game in the spirit of V Rising, with the same low-res, isometric pixel look as [Dungeon Golf](https://github.com/jordandmaynard/dungeon-golf) and [Bone Road](https://github.com/jordandmaynard/board-game-rpg).

You are a human adventurer in a wild land that is generated fresh every time: 1024 × 1024 tiles of terraced ground on a strict grid, with half-tile slopes and ramps between the levels. Fell trees and break rocks for wood and stone, fight what comes out of the wilds, and build a shelter before night falls.

## Play

Open `index.html` in a browser. It is a single file; Three.js r128 loads from cdnjs. Generating the world takes a couple of seconds.

Every load rolls a new world. To replay one, pin its seed (shown on the title screen and the map): `index.html?seed=12345` or `index.html#seed-12345`.

## Controls

- **Move:** WASD (W always walks up the screen).
- **Attack:** left click, aimed at the cursor. Hold to keep swinging; the third swing of a combo is a heavy overhead. Hitting trees and rocks gathers wood and stone.
- **Q** whirlwind, **E** lunge, **Space** dash.
- **F** open and close doors.
- **Camera:** hold the right mouse button and drag to turn it freely (the middle button works too). The tilt always stays at 30°. **Z** / **C** turn it a quarter at a time, and the mouse wheel zooms.
- **B** build mode: **1** floor, **2** wall, **3** door. Left click places, and a right click (without dragging) removes a piece for a full refund. Walls and doors snap to the tile side nearest the cursor.
- **M** map.

## The world

- **Terrain:** eight height levels over open water. Each level is half a tile high. No step between neighbours is more than one level, and the side of every terrace is a slope that reaches half a tile into the lower ground, so you can't walk up it. Rocks of the local kind (mossy stone, sandstone ledges, snow-capped boulders) are strewn down every slope. Ramps join the terraces. After the ramps are carved, a flood fill from the first town adds more ramps until every stretch of land you could walk to is reachable.
- **Biomes:** Bone Road's four (the Whispering Wood, Mirefen Bog, the Hollow Graves, and towns like Emberbrook), plus Goldenreach Meadows, the Sunscorch Waste desert, and the Frostspine snow on the high ground.
- **Roads:** roads join the towns and three waystones in every biome. They only change level by ramps, every street out of a town carries on as a road, and every road ends at a town or a waystone.
- **Towns:** seven per world, each with a plaza, a well, streets and four houses built from the same walls, doors, floors and roofs you build with. Monsters keep out of town, and you wake by the well in Emberbrook if you fall.
- **Foes:** goblins and wolves in the wood, slimes and zombies in the bog, ghosts, zombies and skeletons in the graves, boars and goblins in the meadows, frost wolves and ice wraiths in the snow, scorpions and skeletons in the desert. More come out at night, and they hunt farther.

## Building

Floors need flat ground that no slope reaches into. Floors cost 2 wood, walls 2 wood and 2 stone, doors 5 wood. Close in a room with walls and doors (any shape, up to about 200 tiles) and a hipped roof goes up over it. The roof hides while you stand inside, and every roof hides in build mode. Inside, the walls between you and the camera drop to their stone footing so you can see in. You heal faster under a roof, and monsters can't get through walls or closed doors.

## How it renders

The Dungeon Golf pipeline: a low-resolution WebGL buffer scaled up by a whole number, an orthographic camera at a fixed 30° tilt (starting at a 45° turn, where tile edges are a clean 2:1 pixel staircase), and a camera snapped to whole big pixels with the leftover slid in CSS. Scenery is merged into vertex-coloured, flat-shaded meshes, and the hero draws in a second pass so a silhouette shows through anything in front.

The 1024 × 1024 map is split into 32 × 32-tile chunks. Only chunks near the camera are built, nearest first and a few milliseconds' worth per frame, and far ones are let go. Felling a tree or building a wall rebuilds only its chunk.
