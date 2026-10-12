# Runs

## Movement transitions

Movement transitions can be set to **Smooth** (default), **Fast**, or **Off (instant)** in Settings.
This controls camera and player interpolation on both axes; Reduce motion overrides it with instant movement.

## Undo

**Undo** restores one move (a tapped route counts as a single move), including combat, pickups, gear, keys, doors, and the XP a kill paid (with any level it reached), but only on the floor you stand on: climbing or going down a Tower floor forgets the history, as does crossing one of the Delve's floor lines (each ten depth, either way) or a milestone gate.
A step onto empty floor is seldom worth resuming at, so undoing one goes on back past every empty step before it, and the move before them that did something, to just before that move (a fight, a pickup, a door, a card's activation or training bought).
It cancels any queued route.
Undos are a limited resource, like Focus: each run has a number of them to spend, shown on the Undo button, and one spent never comes back, whatever the run does after it.
The history holds no more moves than the run has undos left.
A new profile has no undo, and the button stays hidden until **Rehearsed steps** (5 Inspiration, after the Archives) gives the first undo a run (or Echoes of time and a level of Undo Count do); each level of **Undo Count** research in the Archives adds one a run: Rehearsed steps opens four levels of it and **Echoes of time** (Courage) four more, either opening it first, up to 9 a run.
Each counts the moment it's bought or completed, in a run already under way too; a new run starts with them all.
History persists across refreshes.

## How a run ends

Every way a run ends goes through one dialog, which says what brought it up and shows the same totals of what the run obtained: the floor reached, the run's highest floor, and the Gold, the Inspiration (or Courage) and the XP earned in this run, the first two with their icons, not the amounts held (undo takes a kill's XP back from it, as from the hero).
Pressing End Run asks whether to end the run (or, when no card in the hand can act, says so first), with **End run** and **Keep climbing** (Keep delving).
When the hero falls in a fight, the run waits at 0 HP with the hand paused, a skull and crossbones burns in a red glow over the hero's head for two and a half seconds, and then the dialog, headed **Fallen in combat**, names the monster.
It must be answered: **Undo** (once Rehearsed steps has unlocked undo, while the run has an undo left and a move to take back; without it the dialog doesn't mention undo) spends one to take the fight back and leaves the hand paused; **Return to entrance** ends the run, pays what it still owes, and returns to the forest for the next run.
Headed **Regroup and try again**, the dialog says the Tower (or Delve) will shift to a new layout for the next run and invites the player to look over and spend what this one earned.
The dialog comes back after a refresh until it is answered.
Rewards are credited as they are earned and never rolled back, so taking a fight back cannot duplicate them.
Ending a run with End Run (or retiring from Settings) goes straight back to the forest once confirmed.
Gold is banked the moment it is found and kept however the run ends: the stats show the Gold held, and the run's end dialog and the message after the run say how much the run found.

## Run Notes

Tower I's floor 250 Goal opens the Archives' **Note Taking** (one level, 100,000 Gold and 2 days).
Once it is researched, tapping the floor number during a run opens the run's notes, and the run plays on beneath them.
They list the tower, the floor reached and the current floor, the real time since the run went inside, the steps taken, chests opened, enemies defeated and XP earned, the keys obtained by colour and the doors opened by kind, the Gold, Silver and Inspiration (or Courage) found, the materials found, and the potions, ATK and DEF shards, Gems, Cells and equipment picked up, each group under its heading.
They refresh as the run goes, and the X at their top right closes them.
The copy button beside the X puts them in the clipboard as text, to paste elsewhere.
Undo takes back what it takes back from the run (steps, keys, doors, pickups and Silver), never what was found for good (Gold, materials, Cells, Gems and equipment).
The run's end dialog has a Run Notes button at the end of its totals, which opens them over it.
The Settings page's Stats dialog has the same copy button.

## Rewards and purchases

Rewards are credited as you climb (Courage for every 10 Delve height, Inspiration for each Tower floor completed beyond your highest, paid as you climb its stairs, and 10 for each area cleared; past floor 100, or depth 1,000, a point of either takes 10 floors, past floor 1,000 100 floors, and past floor 10,000 they stop), so retiring from Settings simply starts a fresh run.
A run still in the forest takes everything bought there at once (skills, training, gear, provisions and research); skills bought while another run is inside apply to that run from its next ascent; Wayfinder, Revive, and undo-capacity upgrades unlock immediately.
In the forest, Automove still avoids lethal fights; it and the hand pause off the board, in dialogs, and when hidden.
No offline progress is calculated.

## Controls inside a run

Inside a run, the row of tabs at the bottom (Tower, Delve, Deck, Defend, Gear, Upgrades, Shop) is hidden and its space left empty: modes, gear and upgrades are chosen in the forest before a run, and a run ends back there.
The Settings button in the stats opens the Settings page at any time, with a Back button to the board; inside a run it, Research and End Run wait in the menu the three-line button at the top right opens over the stats, and the Shop (whose Back returns to the run) stands under that button.

## Movement Speed and Rush

**Movement Speed** (the Courage tree's first skill, 1 Courage) opens the Archives' **Movement Speed** research (six levels, priced and timed like Focus Count's first six: 500 Gold and 8 hours, up to 8,000 Gold and 48 hours), each level letting the run's speed arrows go one step a second faster: 4, then 5, up to 9.
**Rush** (1 Courage, after Movement Speed, right of Focus) opens the Archives' **Rush** research: each of its 25 levels lets the hand's first step toward a new target rush across one more empty tile (or chest already opened) in the same step (one turn, one undo), stopping on the tile before anything else (an item, a door, a monster, the stairs, a torch or a Gem), except that a rush with a tile left ends on the item its card is heading for, taking it (scaled by an Effective or Dampen badge as usual; with a Skip badge it stops before the item, which Skip rolls for on its own step); faint echoes of the hero appear on each tile it rushed off, one after another, and fade in the same order within half a second.
Level n costs 250 × n × 2^(n−1) Gold and takes 1.75 × n × 1.2^(n−1) hours (250 Gold and 1.75 hours first; about 105 billion Gold and 145 days at level 25).

## More controls

Instant Combat likewise adds **Animate fights** (see [Fights](fights.md#how-a-fight-plays-out)).
Beside Dev mode, **Dev: free purchases** is a lighter tool for testing: it unlocks nothing, but every purchase (skills, Training, provisions, research and archivists, Defend) goes through whatever you have and costs nothing, and research completes the moment it starts.
In the forest **Enter**, an arrow going into an arch, stands under Goals beside the tower's number: one press goes straight in through the entrance and starts the run.
Inside a run the button under Settings plays and pauses the hand.
