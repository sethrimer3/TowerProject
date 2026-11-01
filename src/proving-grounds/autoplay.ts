import type { Board } from "../board.ts";
import { CARDS, planHand } from "../cards/cards.ts";
import type { Tile } from "../entities.ts";
import {TRIALS} from "./catalog.ts";
import {keymasterDoorAt,mimicDamage} from "./keymaster.ts";
import type { TowerRun } from "../runs.ts";
import { ARENA_POTIONS, ARENA_SIZE, bossMinionAt, bossPartAt, effectiveBossDef, floorPickupAt, trialFloor, key, trialStep, type TrialState } from "./trial.ts";

/** Expose the encounter to the normal Tower card planner. Replan each turn
 * because slime targets can move. The ordinary Game/run is never mutated. */
export function trialBoard(s: TrialState): Board {
  return {
    width: s.room === "staging" ? 9 : ARENA_SIZE, floor: s.keymaster && s.room==="arena"?0:1,
    tile(x,y): Tile {
      if (!trialFloor(s,x,y)) return {kind:"wall"};
      if (s.room === "staging") return {kind:x===4 && y===6 ? "stairs" : "floor"};
      if(s.keymaster) {
        const k=s.keymaster,door=keymasterDoorAt(x,y);
        if(door>=0 && !k.doors.some(d=>d.door===door))return {kind:"door",color:"yellow"};
        const mimic=k.mimics.find(p=>p.x===x && p.y===y);
        if(mimic)return {kind:"enemy",enemy:{name:"Mimic",hp:k.useKeys && k.keys>0?1:mimic.hp,attack:k.useKeys && k.keys>0?0:mimicDamage(s),defense:0,tier:1,strength:"strong"}};
        if((s.elemental.incorporeal || x!==s.elemental.x || y!==s.elemental.y) && k.drops.some(p=>p.x===x && p.y===y))return {kind:"key",color:"yellow"};
      }
      if (s.bossVariant) {
        const v = s.bossVariant;
        if (x === s.elemental.x && y === s.elemental.y && s.bossHp > 0) {
          return {
            kind: "enemy",
            enemy: {
              name: TRIALS[s.trialId].name,
              hp: s.bossHp,
              attack: v.bossAtk,
              defense: Math.min(effectiveBossDef(s), Math.max(0, s.player.attack - 1)),
              tier: 1,
              strength: "boss",
            },
          };
        }
        const part = bossPartAt(v, x, y);
        if (part) {
          return {
            kind: "enemy",
            enemy: {
              name: part.name,
              hp: part.hp,
              attack: part.attack,
              defense: Math.min(part.defense, Math.max(0, s.player.attack - 1)),
              tier: 1,
              strength: "elite",
            },
          };
        }
        const minion = bossMinionAt(v, x, y);
        if (minion) {
          return {
            kind: "enemy",
            enemy: {
              name: minion.name,
              hp: minion.hp,
              attack: minion.attack,
              defense: Math.min(minion.defense, Math.max(0, s.player.attack - 1)),
              tier: 1,
              strength: "weak",
            },
          };
        }
        const item = floorPickupAt(v, x, y);
        if (item) {
          if (item.kind === "attack") return { kind: "attack", amount: item.amount };
          if (item.kind === "defense") return { kind: "defense", amount: item.amount };
          if (item.kind === "potion") return { kind: "potion" };
          return { kind: "treasure" };
        }
      }
      const boss = !s.elemental.incorporeal && x===s.elemental.x && y===s.elemental.y;
      if (boss || s.slimes.some(p=>p.x===x && p.y===y)) return { kind:"enemy", enemy: {
        name:boss ? TRIALS[s.trialId].name : "Light Slime", hp:boss ? s.bossHp : 1,
        attack:0,defense:0,tier:1,strength:boss ? "boss" : "weak",
      }};
      if (ARENA_POTIONS.some(p=>p.x===x && p.y===y) && !s.consumed.includes(key({x,y}))) return {kind:"potion"};
      return {kind:"floor"};
    },
    step(x,y,dx,dy) { return trialFloor(s,x+dx,y+dy) ? {x:x+dx,y:y+dy} : null; },
    clear() {},
    typicalEnemy() { return {name:TRIALS[s.trialId].name,hp:s.bossHp,attack:Math.max(1,Math.ceil(s.player.maxHp*.04)),defense:0,tier:1,strength:"boss"}; },
  };
}

/** Selects a card slot in the trial hand to break off combat and redirect targeting. */
export function focusTrialCard(s: TrialState, slot: number | null): boolean {
  if (s.mode === "manual" || s.status !== "active") return false;
  if (slot !== null && (!Number.isInteger(slot) || slot < 0 || slot >= s.hand.length)) return false;
  if (s.bossVariant) {
    s.bossVariant.focusedCard = s.bossVariant.focusedCard === slot ? null : slot;
  }
  if (slot !== null) s.playing = true;
  return true;
}

export function trialPlan(s: TrialState) {
  if (s.mode === "manual" || s.status !== "active") return null;
  const pos = trialPosition(s);
  const focused = s.bossVariant?.focusedCard ?? null;
  if (focused !== null && focused >= 0 && focused < s.hand.length) {
    const focusedPlan = planHand(pos, s.hand, "tower", focused);
    if (focusedPlan) return focusedPlan;
    if (s.bossVariant) s.bossVariant.focusedCard = null;
  }
  return planHand(pos,s.hand,"tower");
}
export function trialPosition(s:TrialState) {
  const run: TowerRun = { seed:s.seed, player:{...s.player, keys:{yellow:s.keymaster?.keys??0,blue:0,red:0}},
    height:1,kills:0,treasures:0,changes:{},floor:1,damaged:false };
  return {world:trialBoard(s),run};
}

export function autoplayTrial(s: TrialState, plan=trialPlan(s)) {
  if (s.mode === "manual" || !s.playing || s.status !== "active") return { changed:false,message:"",fired:false };
  const next = plan?.path[0];
  if (!next && s.room==="arena" && s.elemental.incorporeal) {
    const outcome=trialStep(s,0,0,"cards");
    return {...outcome,message:outcome.message || `${TRIALS[s.trialId].name} is incorporeal. Waiting for reformation.`};
  }
  if (!next) {
    s.playing = false;
    return {changed:true,message:"No card can act. Change your equipped hand in the forest, then retry this trial.",fired:false};
  }
  const outcome = trialStep(s,next.dx,next.dy,"cards");
  return {...outcome,message:outcome.message || `${CARDS[s.hand[plan!.card]].name} leads the way.`};
}
