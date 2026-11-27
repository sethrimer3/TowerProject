# How it's built

The game's shape and where its code lives.

Two modes share one page: **Tower** (compact 17 × 17 puzzle floors, generated strategy-first like a Magic Tower) and **Delve** (one endless, wrapping labyrinth).
Worlds are generated deterministically from the run seed, and only your changes to them are saved.
The viewport shows 17 × 17 tiles with the entrance at the bottom center (20 × 20 in the forest outside); in the Delve, terrain below the last milestone gate can't be revisited.
Tower I's west forest path leads to a lakeside dock and fisherman, who takes characters at level 10 or higher out to sea to choose a trial.
The very first climb's floor 2 holds the Divine Portal to a narrative floor 999999, where the Chrono Anchor (the first Divine Relic) lets climbs end and loop.

Code lives in `src/`, with the Tower generator and its floors in `src/tower/`, the Delve labyrinth and its board in `src/delve/`, the Shop's offers, entitlements and transactions in `src/shop/`, Equipment in `src/equipment/`, the Tournament in `src/tournament/`, Mail in `src/mail/`, the daily and weekly missions (their catalogue, rewards and saved state) in `src/missions/`, Events (missions paying Medals toward relics, and their Store) in `src/events/`, Shrines and their boons in `src/shrines.ts`, the Divine Portal and Divine Relics in `src/divine.ts` (the builders' room in `src/tower/divine-room.ts`), Familiars in `src/familiars/`, the Catacombs' engine (undead, halls, turns, Magic levels, the clock) in `src/catacombs/`, board drawing (the Renderer, terrain, lighting, the Game themes' boards, decor and effects) in `src/render/`, the sprites in `src/sprites/`, the enemies (bestiary, legacy roster, curves, schedule, stage and traits) in `src/enemies/`, the cards, their trees, levels, buys and badges in `src/cards/`, the Archives, loadout, skill trees and Training in `src/progression/`, Gems, Gold bonuses and relics in `src/economy/`, Golden Scarabs and their boosts in `src/boosts/`, the save, its decoder, settings and profile in `src/save/`, the Codex's categories, briefs and discoveries in `src/codex/`, and the pages, HUD and dialogs in `src/ui/`.
Design notes are in `docs/` (indexed in the README), and the gameplay rules in [docs/gameplay/](../gameplay/).
Architecture notes, generation invariants, and development commands for contributors (human or AI) are in [AGENTS.md](../../AGENTS.md), with each area's details in [docs/agents/](../agents/).
