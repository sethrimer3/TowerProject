# First steps

## Interface sprites

The game uses matching pixel-art controls, icons, cards, heroes, enemies, pickups, terrain, buildings and dungeon decorations by default.
A loading screen waits for the artwork and fonts before the game appears; if loading fails, use Retry after checking your connection.
Settings offers **Animations** and **Square doors** as independent checkboxes; both start off and remember your choices.
Animations enables matching torch frames, subtle potion bubbles, occasional key shines and a small idle motion after the hero stops.
The skull and crossbones shown when the hero falls also uses matching PNG art, with a short animation while Animations is on.
Reduce motion keeps these frames still; movement and combat stop the hero's idle motion.
Outside, cloud shadows drift across the ground, trees, buildings and hero, shifting over taller surfaces.
Soft shafts of sunlight shine through the moving cloud gaps, with fainter rays during rain and storms.
They descend steeply with softly fading edges and low opacity so the pixel art remains clear.
Reduce motion keeps the cloud shadows still too.
World pickups and chests have thin gold pixel outlines, the hero and staircase sprites have blue outlines, and doors have black outlines.
Square doors uses tile-filling rectangular doors with the same key and HP requirements as before.
Tower I sprite floors mix large slabs and smaller bricks with connected joints across neighboring tiles.
Tower II has warm limestone walls and rectangular paving; Tower III has cool basalt walls and octagonal paving with small square insets.
Each of these two towers keeps its own single floor-and-wall tileset throughout the climb while the Classic Game theme is selected.
Choose another owned UI or Game theme in Settings to change its appearance.
The default Medieval and Classic interface looks use the sprites; other UI themes override them.
Other Game themes override world sprites independently, and returning to Classic restores them.
small navigation and close marks, slider tracks and handles, reward stars, and the Gold-bonus and enemy-odds popup frames share the pixel-art look.
Sliders still work with pointer or keyboard input and show their values as live text.
The default interface uses custom pixel lettering, with button frames that leave room for text and icons. On phones, ad controls stack and Training values sit above their purchase buttons.
The Classic board kit also uses pixel lettering for damage, rewards and other annotations, plus matching Target, Ignore, skipped and blocked tile marks. Torch lighting follows the active sprite shapes.
With environmental decoration enabled, the Classic sprite kit also gives moss, pools, vine leaves, flowers and glowing mushrooms matching PNG artwork, preserving their locations, water movement and interactions.
In the forest, the Classic sprite kit shows the enormous lower bases of the Tower and Delve mountain extending beyond the top of the view.
Oak, birch and pine crowns span several tiles above smaller trees, bushes, ferns, rocks, logs, stumps, flowers and mushrooms, with paths, entrances, building yards and the mode sign kept clear.
The whole 20-column Tower clearing is walkable wherever grass or dirt is clear of trees, rocks and buildings, including the path and grass on the right.
Walk onto a left or right edge tile to enter the adjacent unlocked tower's clearing, or use the side arrow.
The new screen pauses for 0.1 seconds before your hero walks in from the opposite side; movement waits until the walk finishes.
Fast transitions shorten the walk, while Instant transitions and Reduce motion keep the pause and place the hero directly on its landing tile.
Grass still moves around the hero; turning environmental decoration off hides that grass and extra floor plants while keeping the forest's trees and rocks.
Inside the Tower, the Classic sprite kit uses fitted stone floors and joined masonry walls with visible tops and south-facing wall faces.
In the Delve, rough stone and packed earth form adjoining patches of floors and walls, with stepped soil edges and matching biome colors.
Walls have six variations of their tops and south-facing faces, with fitted masonry, broad fractured bedrock or packed earth, plus matching diagonal corner pieces.
Earth and stone interlock at their edges and diagonal joins on both floors and exposed walls.
Walls keep a broad textured edge and recede through connected shades of stone or earth into the shared black interior.
The shading follows room boundaries continuously across tiles and around corners, while south-facing wall faces keep their visible height.
Occasional chipped joints, rock fractures and embedded roots or earth layers span adjoining wall tiles, chosen to fit the surrounding edges while leaving most surfaces quiet.
Tower masonry also has repaired mortar joints, shallow spalled flakes and worn chisel marks that fit broad edges, thin strips and sheltered faces.
These interior tiles remain with environmental decoration off; torchlight follows the selected floor's seams, and movement, doors and map layouts stay the same.

## The HUD

Health, combat stats and keys fill the upper part of the player panel.
The portrait sits below them beside the limited-use inventory, with your level and XP bar underneath the hero.
Once Shrines are researched, the separate Shrine progress bar appears below XP and still opens your boon choices or collected boons.
On narrow phones, inventory controls wrap and the Menu, Shop and play/pause buttons keep room for their labels.

## The first runs

A new game starts inside its first Tower run with a hand of one card, **Stairs**.
Until the Inspiration tree's **Auto-Climb** is owned, the hand moves only when you press a card: the hero heads for that card's target, and once it gets there the hand waits for your next press (see Pressing a card in hand-and-cards.md).
A note over the board, headed *Welcome, adventurer!* and then *Press the Stairs card to climb*, says each card sends the hero toward what it names, while a hand points at Stairs; play and the speed arrows stay closed until Stairs is pressed, and the hero then walks at 2 steps a second.
Floor 1's stairs always stand open, so Stairs climbs it, paying the run's first Inspiration; floor 2's stairs are behind a gold door Stairs can't open.
The first time no card can take the hero further, a note says the Inspiration the run earned unlocks new abilities and to press **End Climb**, which pulses slowly until it is pressed.
In the forest a note then says to spend the Inspiration, a hand pointing at the **Upgrades** tab, while **Door & Key** can be bought.
On the Inspiration tree a note asks you to unlock Door & Key, a hand pointing at it; once it is bought, the note says Door and Key have joined your hand, that in a run they collect keys and open doors, that each door costs 1 key, that with no key some HP can break down a Wooden Door, that the tower's other items become accessible later as you unlock their cards, and to press the Tower button to go back, a hand pointing at it.
Back in the forest a note says *Click Enter to start climbing the tower.*, a hand pointing at **Enter**; pressing Enter dismisses it, as tapping the note or entering does.
In that run a note asks you to press Key and Door, a hand pointing at each, until you press one of them.
Ten steps into that run's first floor, a hero slower than 3 steps a second is paused once, a hand pointing at the › beside play, until you press it to walk at 3 ([Play, pause and speed](hand-and-cards.md#play-pause-and-speed)).
When the hand is stuck again with an enemy in the way, while **Enemy** isn't owned and you hold the Inspiration it costs, a note says an enemy blocks the way, that the Enemy card on the Inspiration tree lets you fight it, and to press End Run, which pulses again; the forest, the Inspiration tree and Enter then lead you to Enemy and back as they did for Door & Key.
Reaching floor 4 of a climb while Enemy is owned and **Auto-Climb** isn't, the hero stops and a note says you can end the climb now to unlock Auto-Climb: end it from the menu, then spend its Inspiration on Auto-Climb on the Inspiration tree.
The climb stays paused until you tap the note, which dismisses it for good (ending the climb does too).
In the first run inside after **Auto-Climb** is bought, a note says Auto-Climb moves the hero for you: it heads for the target of the first card in your hand with an open path to it, and pressing a card goes for that card's target first; the hand plays on under it, and tapping the note or pressing a card dismisses it.
Once the **Archives** skill is bought, in the Tower's forest a note says research is unlocked and to press the **Research** tab, a hand pointing at it and a red dot on it; until you open the Research page, nothing else in the forest can be pressed.
On the Research page a hand then points at its **Archives** tab, over a note: pay the archivist Gold to research permanent upgrades, and Gems rush research and hire more archivists to research more at once.
Until that note is tapped, which ends the lesson, the other tabs can't be pressed.
The first time training points can be spent, in the forest a note says that after levelling up you can spend points to increase your stats, a hand pointing at the **Research** tab.
On its Training tab a note says *Spend training points to upgrade your stats.*, with a hand on each training-points button you can press, until you tap the note, which ends the lesson.
When a Tower Goal is ready to claim, the Tower's forest says Tower Goals are ready to claim, every ten floors climbed paying a Goal reward, a hand pointing at the **Goals** button, until you open the Goals page.
While a tournament is open, the forest's next note says to follow the path down to the Delve and enter its cave, the hand pointing at the sign at the foot of the forest path, until the Delve is opened.

## The tab bar and the forest sign

The tab bar along the bottom is one strip of icons, the open page's lit: the board (its icon the Tower's or the Delve's, whichever is active), Upgrades, Deck, Gear, Research and Shop.
Tower and Delve share the one board button: a large sign stands at the foot of each forest's path, the other place's icon over a down arrow, and tapping it or walking the hero down onto the path's last tile goes to the other forest.
The Delve is open only while a tournament is open for entry, once the Tournament is unlocked: only then does the Tower's forest show its sign, and the Delve's cave is the way into the tournament (`docs/TOURNAMENT.md`).
The Delve's forest always shows its sign back to the Tower's.
If tournament entry closes while the Delve's forest shows, the game goes back to the Tower's forest at once and says *Tournament entry has closed*, until a click.
A forest run's hero starts partway up the path.
The dirt path has patches of packed earth, gravel, pebbles, cracks, scuffs and fallen leaves, with grass along its edges; these details do not change where the hero can walk.
Reloading mid-Delve-run opens the Delve where it was.

## Moving by hand

In the forest before a run, a tap on an open tile walks straight to it, and a tap anywhere in the Tower's arch walks to the entrance under it, beginning a climb.
The line under the forest says *Press Enter or the tower entrance to begin a climb.* (in the Delve's forest, *Press Enter or the cave entrance to begin a delve.*), as does the status line when a run ends.
With Dev mode on, swipes and the keyboard arrows / WASD also step the hero one tile in any cardinal direction, in the forest or inside a run.
Monsters on manual routes are fought even when lethal.
Missing keys stop movement at the necessary door, with a fading red X; unreachable wall targets get the same feedback at the tapped spot.
Routing prefers an available detour over a door for which no key is held.
Inside a run, where the hand moves the hero, a tap on a tile highlights it and shows what's there (a monster's stats, an item, a door's keys); it leaves the hand playing.
With Dev mode on, the hero can also walk by hand inside a run: a second tap on the highlighted tile walks there, fighting monsters and collecting items along the route.
A pickup's box shows what it gives with every bonus counted, as its icon and +N (a key's keys, a potion's full heal, a shard's ATK or DEF), and a lit torch's says Torch.
Pressing play clears the highlight.
On a plain floor or wall tile the highlight and its box fade away on their own, shown for 2 seconds and gone over the next.
A potion's box also says how much HP it restores (a percent potion its share of max HP too).

## Tab dots

While a Deck lesson is waiting, its tab carries a red dot.
After a card levels up or joins the deck, the Deck tab carries one with a number until you open it: the new cards and the cards with card points to spend (see Card levels in hand-and-cards.md).
The Upgrades tab carries one too, once the first run that earns Inspiration is over, until you open it; and whenever a run that earned Inspiration ends, the Upgrades tab and the Inspiration tab on that page carry one in the forest while you hold enough Inspiration to buy a skill there, until you look at the Inspiration tree (likewise a Tower Goal claimed, which pays a Breakthrough point, once the Breakthrough tree is open, for the Breakthrough tab); and so does the Gear tab once a first provision opens, until you open it.
