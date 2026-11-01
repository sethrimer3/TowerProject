import { finite, isRecord, wholeIn } from "../save/decode.ts";
import { tileRandom } from "../random.ts";
import { ARENA_POTIONS, ARENA_SIZE, ELEMENTAL, arenaFloor, directions, key, same, type Spot } from "./arena.ts";
import { difficultyMultiplier } from "./catalog.ts";
import type { SavedBossProgress } from "./access.ts";
import type { TrialState } from "./trial.ts";
import { heroAttackOn } from "./trial-spells.ts";

export const OBELISK_DEFAULT_TURNS = 100;
export const OBELISK_SHOT_INTERVAL = 3;
export const OBELISK_SPECIAL_INTERVAL = 8;
export const VARIANT_MINION_INTERVAL = 6;
export const MAX_VARIANT_MINIONS = 4;
export const MAX_VARIANT_PICKUPS = 10;

export type BossPartKind = "turret" | "regen" | "ward";
export type BossPart = Spot & {
  id: BossPartKind;
  name: string;
  kind: BossPartKind;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
};

export type BossMinion = Spot & {
  id: number;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
};

export type FloorPickupKind = "attack" | "defense" | "potion" | "silver" | "gold";
export type FloorPickup = Spot & {
  id: number;
  kind: FloorPickupKind;
  amount: number;
};

export type CombatCoinPop = {
  from: Spot;
  to: Spot;
  kind: "gold" | "silver";
  amount: number;
};

export type CombatShot = {
  from: Spot;
  to: Spot;
  damage: number;
  special?: boolean;
};

export type CombatRound = {
  step: number;
  from: Spot;
  to: Spot;
  targetName: string;
  heroDamage: number;
  enemyDamage: number;
  coins: CombatCoinPop[];
  shots: CombatShot[];
};

export type BossVariantState = {
  variant: "magic-tower" | "obelisk";
  multiPart: boolean;
  bossAtk: number;
  bossDef: number;
  bossRegen: number;
  turnLimit: number;
  outOfTurns: boolean;
  damageThisRun: number;
  goldEarned: number;
  silverEarned: number;
  parts: BossPart[];
  minions: BossMinion[];
  pickups: FloorPickup[];
  spawned: number;
  focusedCard: number | null;
  lastRound: CombatRound | null;
};

const PART_SPOTS: readonly { id: BossPartKind; name: string; x: number; y: number }[] = [
  { id: "turret", name: "Blaster Turret", x: 9, y: 12 },
  { id: "regen", name: "Regen Conduit", x: 15, y: 12 },
  { id: "ward", name: "Ward Crystal", x: 12, y: 15 },
];

const INITIAL_SHARD_SPOTS: readonly { x: number; y: number; kind: "attack" | "defense" }[] = [
  { x: 7, y: 8, kind: "attack" },
  { x: 17, y: 8, kind: "defense" },
  { x: 7, y: 16, kind: "defense" },
  { x: 17, y: 16, kind: "attack" },
];

const COIN_OFFSETS: readonly Spot[] = [
  { x: -2, y: -1 }, { x: 2, y: -1 }, { x: -2, y: 1 }, { x: 2, y: 1 },
  { x: 0, y: -2 }, { x: 0, y: 2 }, { x: -1, y: -2 }, { x: 1, y: -2 },
];

const distance = (a: Spot, b: Spot) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function variantBossMaxHp(
  variant: "magic-tower" | "obelisk",
  player: { attack: number },
  level: number,
): number {
  const factor = difficultyMultiplier(level);
  if (variant === "magic-tower") {
    return Math.ceil(Math.max(300, player.attack * 30) * factor);
  }
  return Math.ceil(Math.max(1500, player.attack * 150) * factor);
}

export function newBossVariant(
  variant: "magic-tower" | "obelisk",
  player: { maxHp: number; attack: number; defense: number },
  level: number,
  options: { multiPart?: boolean; turnLimit?: number; savedBoss?: SavedBossProgress } = {},
): { bossHp: number; bossMaxHp: number; state: BossVariantState } {
  const factor = difficultyMultiplier(level);
  const bossMaxHp = variantBossMaxHp(variant, player, level);
  const savedDamage = options.savedBoss?.level === level ? Math.max(0, options.savedBoss.damage) : 0;
  const bossHp = variant === "obelisk" ? Math.max(1, bossMaxHp - savedDamage) : bossMaxHp;
  const bossAtk = Math.max(2, Math.ceil(player.maxHp * (variant === "magic-tower" ? 0.06 : 0.05) * factor));
  const bossDef = Math.max(0, Math.floor(player.attack * 0.12 * factor));
  const bossRegen = variant === "magic-tower" ? Math.max(1, Math.round(player.attack * 0.22 * factor)) : 0;
  const turnLimit = variant === "obelisk" ? Math.max(10, Math.floor(options.turnLimit ?? OBELISK_DEFAULT_TURNS)) : 0;
  const multiPart = !!options.multiPart;
  const partMaxHp = Math.max(20, Math.ceil(bossMaxHp * 0.16));
  const parts: BossPart[] = multiPart
    ? PART_SPOTS.map((spec) => {
        const partLost = variant === "obelisk" && options.savedBoss?.level === level ? (options.savedBoss.partDamage?.[spec.id] ?? 0) : 0;
        return {
          id: spec.id,
          name: spec.name,
          kind: spec.id,
          x: spec.x,
          y: spec.y,
          hp: Math.max(0, partMaxHp - partLost),
          maxHp: partMaxHp,
          attack: Math.max(1, Math.ceil(bossAtk * (spec.id === "turret" ? 0.8 : 0.6))),
          defense: Math.max(0, Math.floor(bossDef * (spec.id === "ward" ? 0.8 : 0.5))),
        };
      })
    : [];
  let spawned = 0;
  const shardAmount = Math.max(1, Math.round(player.attack * 0.08 * factor));
  const pickups: FloorPickup[] = INITIAL_SHARD_SPOTS.map((p) => ({
    id: ++spawned,
    x: p.x,
    y: p.y,
    kind: p.kind,
    amount: shardAmount,
  }));
  return {
    bossHp,
    bossMaxHp,
    state: {
      variant,
      multiPart,
      bossAtk,
      bossDef,
      bossRegen,
      turnLimit,
      outOfTurns: false,
      damageThisRun: 0,
      goldEarned: 0,
      silverEarned: 0,
      parts,
      minions: [],
      pickups,
      spawned,
      focusedCard: null,
      lastRound: null,
    },
  };
}

export const activeBossParts = (v: BossVariantState): BossPart[] => v.parts.filter((p) => p.hp > 0);
export const bossPartAt = (v: BossVariantState, x: number, y: number): BossPart | undefined =>
  v.parts.find((p) => p.hp > 0 && p.x === x && p.y === y);
export const bossMinionAt = (v: BossVariantState, x: number, y: number): BossMinion | undefined =>
  v.minions.find((m) => m.hp > 0 && m.x === x && m.y === y);
export const floorPickupAt = (v: BossVariantState, x: number, y: number): FloorPickup | undefined =>
  v.pickups.find((p) => p.x === x && p.y === y);

/** Effective boss defense: increased while the Ward Crystal part is alive. */
export function effectiveBossDef(s: TrialState | BossVariantState): number {
  const v = "variant" in s ? s : s.bossVariant;
  if (!v) return 0;
  const ward = v.parts.find((p) => p.id === "ward" && p.hp > 0);
  const atk = "variant" in s ? v.bossAtk : s.player.attack;
  const bonus = ward ? Math.max(1, Math.ceil(atk * 0.15)) : 0;
  return v.bossDef + bonus;
}

/** Effective boss regeneration per turn: base regen plus Regen Conduit bonus while alive. */
export function effectiveBossRegen(s: TrialState | BossVariantState): number {
  const v = "variant" in s ? s : s.bossVariant;
  if (!v) return 0;
  const regenPart = v.parts.find((p) => p.id === "regen" && p.hp > 0);
  const scale = "variant" in s ? Math.max(10, v.bossAtk) : s.player.attack * difficultyMultiplier(s.level);
  const conduitBonus = regenPart ? Math.max(1, Math.round(scale * 0.14)) : 0;
  return v.bossRegen + conduitBonus;
}

function spawnVariantMinion(s: TrialState) {
  const v = s.bossVariant!;
  if (v.minions.length >= MAX_VARIANT_MINIONS) return;
  const choices: Spot[] = [];
  for (let y = 4; y <= 20; y++) {
    for (let x = 4; x <= 20; x++) {
      const p = { x, y };
      const range = distance(p, s.elemental);
      if (
        range < 3 ||
        range > 8 ||
        !arenaFloor(x, y) ||
        same(p, s.player) ||
        same(p, s.elemental) ||
        activeBossParts(v).some((part) => same(p, part)) ||
        v.minions.some((m) => same(p, m)) ||
        v.pickups.some((item) => same(p, item)) ||
        ARENA_POTIONS.some((pot) => same(p, pot))
      ) {
        continue;
      }
      choices.push(p);
    }
  }
  const id = ++v.spawned;
  const target = choices[Math.floor(tileRandom(id, s.steps, s.seed ^ 0x564d4e) * choices.length)];
  if (!target) return;
  const factor = difficultyMultiplier(s.level);
  const maxHp = Math.max(12, Math.ceil(s.player.attack * 2.5 * factor));
  const attack = Math.max(1, Math.ceil(v.bossAtk * 0.55));
  const defense = Math.max(0, Math.floor(v.bossDef * 0.4));
  v.minions.push({
    ...target,
    id,
    name: v.variant === "magic-tower" ? "Arcane Wisp" : "Obelisk Sentry",
    hp: maxHp,
    maxHp,
    attack,
    defense,
  });
}

export function enterBossVariant(s: TrialState): { changed: boolean; message: string; fired: boolean } {
  const v = s.bossVariant!;
  spawnVariantMinion(s);
  spawnVariantMinion(s);
  if (v.variant === "magic-tower") {
    return {
      changed: true,
      message: `Magic Tower${v.multiPart ? " (1b Multi-Part)" : ""}: each turn is one combat round. Hit the boss to pop out Gold & Silver coins, train stats, and outpace its ${effectiveBossRegen(s)} HP/turn Regen!`,
      fired: false,
    };
  }
  return {
    changed: true,
    message: `Obelisk${v.multiPart ? " (2b Multi-Part)" : ""}: ${v.turnLimit} turns to inflict damage (${Math.ceil(s.bossHp)}/${Math.ceil(s.bossMaxHp)} HP left). Damage is saved across runs!`,
    fired: false,
  };
}

/** Pops Gold and Silver coins out of the boss when damaged in Magic Tower. */
function popCoinsOnBossHit(s: TrialState, origin: Spot, step: number): CombatCoinPop[] {
  const v = s.bossVariant!;
  if (v.variant !== "magic-tower") return [];
  const factor = difficultyMultiplier(s.level);
  const silverAmount = Math.max(20, Math.round(30 * factor));
  const goldAmount = Math.max(8, Math.round(12 * factor));
  s.purchases ??= { silver: 0, training: {} };
  s.purchases.silver += silverAmount;
  v.silverEarned += silverAmount;
  v.goldEarned += goldAmount;

  const candidates = COIN_OFFSETS.map((off, i) => ({
    x: origin.x + off.x,
    y: origin.y + off.y,
    score: tileRandom(step, i, s.seed ^ 0x434f494e),
    i,
  })).filter(
    (p) =>
      arenaFloor(p.x, p.y) &&
      !same(p, s.elemental) &&
      !activeBossParts(v).some((part) => same(p, part)) &&
      !v.minions.some((m) => same(p, m)),
  );
  candidates.sort((a, b) => a.score - b.score || a.i - b.i);

  const pops: CombatCoinPop[] = [];
  const kinds: ("silver" | "gold")[] = ["silver", "gold"];
  for (let i = 0; i < Math.min(2, candidates.length); i++) {
    const spot = { x: candidates[i].x, y: candidates[i].y };
    const kind = kinds[i];
    const amount = kind === "silver" ? Math.max(10, Math.round(silverAmount * 0.5)) : goldAmount;
    pops.push({ from: { x: origin.x, y: origin.y }, to: spot, kind, amount });
    if (v.pickups.length < MAX_VARIANT_PICKUPS && !same(spot, s.player)) {
      const existing = v.pickups.find((item) => same(item, spot) && (item.kind === "silver" || item.kind === "gold"));
      if (existing) existing.amount += amount;
      else v.pickups.push({ id: ++v.spawned, x: spot.x, y: spot.y, kind, amount });
    }
  }
  return pops;
}

/** Resolves a single round of combat between the hero and a minion (never to the death). */
function roundFightMinion(s: TrialState, minion: BossMinion, step: number): { heroDamage: number; enemyDamage: number; defeated: boolean } {
  const heroStrike = Math.max(1, Math.round(heroAttackOn(s, minion) - minion.defense));
  minion.hp = Math.max(0, minion.hp - heroStrike);
  if (minion.hp === 0) {
    s.bossVariant!.minions = s.bossVariant!.minions.filter((m) => m.id !== minion.id);
    s.purchases ??= { silver: 0, training: {} };
    s.purchases.silver += Math.max(10, Math.round(15 * difficultyMultiplier(s.level)));
    return { heroDamage: heroStrike, enemyDamage: 0, defeated: true };
  }
  // Minion survives this round and strikes once; ATK never increases with hits.
  const enemyStrike = Math.max(1, Math.round(minion.attack - s.player.defense * 0.35));
  s.player.hp = Math.max(0, s.player.hp - enemyStrike);
  return { heroDamage: heroStrike, enemyDamage: enemyStrike, defeated: false };
}

/** Minions step toward the player; if adjacent, they perform one round of combat. */
function advanceVariantMinions(s: TrialState, step: number): { message: string; round: CombatRound | null } {
  const v = s.bossVariant!;
  const occupied = new Set<string>([
    key(s.elemental),
    ...activeBossParts(v).map(key),
    ...v.minions.map(key),
  ]);
  let message = "";
  let round: CombatRound | null = null;
  for (const minion of [...v.minions].sort((a, b) => a.id - b.id)) {
    if (s.player.hp === 0) break;
    occupied.delete(key(minion));
    const distances = new Map([[key(s.player), 0]]);
    const queue: Spot[] = [{ x: s.player.x, y: s.player.y }];
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i], d = distances.get(key(p))!;
      for (const [dx, dy] of directions) {
        const next = { x: p.x + dx, y: p.y + dy }, at = key(next);
        if (!arenaFloor(next.x, next.y) || occupied.has(at) || distances.has(at)) continue;
        distances.set(at, d + 1);
        queue.push(next);
      }
    }
    const here = distances.get(key(minion)) ?? Infinity;
    const next = directions
      .map(([dx, dy]) => ({ x: minion.x + dx, y: minion.y + dy }))
      .find((p) => (distances.get(key(p)) ?? Infinity) < here);
    if (next) {
      if (same(next, s.player)) {
        const result = roundFightMinion(s, minion, step);
        round = {
          step,
          from: { x: s.player.x, y: s.player.y },
          to: { x: minion.x, y: minion.y },
          targetName: minion.name,
          heroDamage: result.heroDamage,
          enemyDamage: result.enemyDamage,
          coins: [],
          shots: [],
        };
        message = result.defeated
          ? `${minion.name} attacks and is defeated on the counter-strike!`
          : `${minion.name} engages for 1 round (−${result.enemyDamage} HP to you, −${result.heroDamage} HP to ${minion.name}).`;
      } else {
        minion.x = next.x;
        minion.y = next.y;
      }
    }
    if (v.minions.some((m) => m.id === minion.id)) occupied.add(key(minion));
  }
  return { message, round };
}

/** Resolves one turn in the Magic Tower or Obelisk arena. */
export function bossVariantStep(s: TrialState, x: number, y: number): { changed: boolean; message: boolean | string; fired: boolean } & { message: string } {
  const v = s.bossVariant!;
  const nextStep = s.steps + 1;
  let message = "";
  let move = true;
  let round: CombatRound | null = null;
  let fired = false;

  const part = bossPartAt(v, x, y);
  const minion = bossMinionAt(v, x, y);

  if (same({ x, y }, s.elemental)) {
    // Single round of combat against the main boss (hero stays on current tile).
    move = false;
    const bossDef = effectiveBossDef(s);
    const wardAlive = v.parts.some((p) => p.id === "ward" && p.hp > 0);
    const heroDef = wardAlive ? Math.floor(s.player.defense * 0.8) : s.player.defense;
    const heroStrike = Math.max(1, Math.round(heroAttackOn(s, s.elemental) - bossDef));
    const actualBossDmg = Math.min(s.bossHp, heroStrike);
    s.bossHp = Math.max(0, s.bossHp - heroStrike);
    v.damageThisRun += actualBossDmg;
    const coins = popCoinsOnBossHit(s, s.elemental, nextStep);

    if (s.bossHp === 0) {
      s.steps = nextStep;
      s.status = "won";
      s.playing = false;
      v.minions = [];
      v.lastRound = {
        step: nextStep,
        from: { x: s.player.x, y: s.player.y },
        to: { x: s.elemental.x, y: s.elemental.y },
        targetName: v.variant === "magic-tower" ? "Arcane Spire" : "Dread Obelisk",
        heroDamage: actualBossDmg,
        enemyDamage: 0,
        coins,
        shots: [],
      };
      return {
        changed: true,
        message: `Trial complete — the ${v.variant === "magic-tower" ? "Arcane Spire" : "Dread Obelisk"} is defeated!`,
        fired: false,
      };
    }

    // Boss counters once; Boss ATK never increases with hits.
    const bossCounter = Math.max(1, Math.round(v.bossAtk - heroDef * 0.35));
    s.player.hp = Math.max(0, s.player.hp - bossCounter);
    round = {
      step: nextStep,
      from: { x: s.player.x, y: s.player.y },
      to: { x: s.elemental.x, y: s.elemental.y },
      targetName: v.variant === "magic-tower" ? "Arcane Spire" : "Dread Obelisk",
      heroDamage: actualBossDmg,
      enemyDamage: bossCounter,
      coins,
      shots: [],
    };
    const coinNote = coins.length ? " Gold & Silver coins pop out!" : "";
    message = `Round of combat: you deal ${actualBossDmg} damage (${Math.ceil(s.bossHp)} HP left); boss counters for ${bossCounter} damage.${coinNote}`;
  } else if (part) {
    // Single round of combat against a boss part.
    move = false;
    const heroStrike = Math.max(1, Math.round(heroAttackOn(s, part) - part.defense));
    const actualPartDmg = Math.min(part.hp, heroStrike);
    part.hp = Math.max(0, part.hp - heroStrike);
    v.damageThisRun += actualPartDmg;
    const coins = popCoinsOnBossHit(s, { x: part.x, y: part.y }, nextStep);
    let partCounter = 0;
    if (part.hp > 0) {
      partCounter = Math.max(1, Math.round(part.attack - s.player.defense * 0.35));
      s.player.hp = Math.max(0, s.player.hp - partCounter);
      message = `Round vs ${part.name}: −${actualPartDmg} HP (${part.hp}/${part.maxHp} left); it counters for ${partCounter} damage.`;
    } else {
      message = `${part.name} is knocked out and disappears from the floor! Its effect is permanently disabled.`;
    }
    round = {
      step: nextStep,
      from: { x: s.player.x, y: s.player.y },
      to: { x: part.x, y: part.y },
      targetName: part.name,
      heroDamage: actualPartDmg,
      enemyDamage: partCounter,
      coins,
      shots: [],
    };
  } else if (minion) {
    // Single round of combat against a minion (does not fight to the death in one turn unless 1 round kills it).
    const result = roundFightMinion(s, minion, nextStep);
    move = result.defeated;
    round = {
      step: nextStep,
      from: { x: s.player.x, y: s.player.y },
      to: { x: minion.x, y: minion.y },
      targetName: minion.name,
      heroDamage: result.heroDamage,
      enemyDamage: result.enemyDamage,
      coins: [],
      shots: [],
    };
    message = result.defeated
      ? `You strike ${minion.name} for ${result.heroDamage} damage and defeat it!`
      : `Round vs ${minion.name}: you deal ${result.heroDamage} damage (${minion.hp}/${minion.maxHp} HP left); it counters for ${result.enemyDamage} damage.`;
  }

  if (move) {
    s.player.x = x;
    s.player.y = y;
  }

  // Floor pickups (shards, coins, potions).
  const pickupIdx = v.pickups.findIndex((item) => same(item, s.player));
  if (pickupIdx >= 0) {
    const [item] = v.pickups.splice(pickupIdx, 1);
    if (item.kind === "attack") {
      s.player.attack += item.amount;
      message = `ATK shard grants +${item.amount} ATK.`;
    } else if (item.kind === "defense") {
      s.player.defense += item.amount;
      message = `DEF shard grants +${item.amount} DEF.`;
    } else if (item.kind === "silver") {
      s.purchases ??= { silver: 0, training: {} };
      s.purchases.silver += item.amount;
      v.silverEarned += item.amount;
      message = `Picked up +${item.amount} Silver coins.`;
    } else if (item.kind === "gold") {
      v.goldEarned += item.amount;
      message = `Picked up +${item.amount} Gold coins.`;
    } else if (item.kind === "potion") {
      const healed = Math.min(s.player.maxHp - s.player.hp, item.amount);
      s.player.hp += healed;
      message = `Potion restores ${healed} HP.`;
    }
  }

  const here = key(s.player);
  if (ARENA_POTIONS.some((p) => key(p) === here) && !s.consumed.includes(here)) {
    const healed = Math.min(s.player.maxHp - s.player.hp, Math.ceil(s.player.maxHp * 0.35));
    s.player.hp += healed;
    s.consumed.push(here);
    message = `Potion restores ${healed} HP.`;
  }

  s.steps = nextStep;

  // Boss Regeneration (Magic Tower always; Obelisk if Regen Conduit part is alive).
  const regen = effectiveBossRegen(s);
  if (s.bossHp > 0 && regen > 0 && s.player.hp > 0) {
    const before = s.bossHp;
    s.bossHp = Math.min(s.bossMaxHp, s.bossHp + regen);
    const gained = s.bossHp - before;
    if (gained > 0 && !message) {
      message = `The boss regenerates +${gained} HP (${Math.ceil(s.bossHp)}/${Math.ceil(s.bossMaxHp)}).`;
    }
  }

  // Minion movement and spawns.
  if (s.player.hp > 0 && v.minions.length > 0) {
    const minionTurn = advanceVariantMinions(s, s.steps);
    if (minionTurn.message && !message) message = minionTurn.message;
    if (minionTurn.round && !round) round = minionTurn.round;
  }
  if (s.player.hp > 0 && s.steps % VARIANT_MINION_INTERVAL === 0) {
    spawnVariantMinion(s);
  }

  // Periodic ranged shots & Special attacks (Obelisk + Blaster Turret part).
  const shots: CombatShot[] = [];
  const turret = v.parts.find((p) => p.id === "turret" && p.hp > 0);
  if (s.player.hp > 0 && turret && s.steps % 4 === 2) {
    const dmg = Math.max(1, Math.round(turret.attack * 0.65 - s.player.defense * 0.25));
    s.player.hp = Math.max(0, s.player.hp - dmg);
    shots.push({ from: { x: turret.x, y: turret.y }, to: { x: s.player.x, y: s.player.y }, damage: dmg });
    fired = true;
    message = message ? `${message} Blaster Turret fires for ${dmg} damage!` : `Blaster Turret fires a bolt for ${dmg} damage!`;
  }

  if (s.player.hp > 0 && v.variant === "obelisk") {
    if (s.steps % OBELISK_SPECIAL_INTERVAL === 0) {
      const dmg = Math.max(2, Math.round(v.bossAtk * 1.1 - s.player.defense * 0.25));
      s.player.hp = Math.max(0, s.player.hp - dmg);
      shots.push({ from: { x: s.elemental.x, y: s.elemental.y }, to: { x: s.player.x, y: s.player.y }, damage: dmg, special: true });
      fired = true;
      // Spawn a helpful stat shard when surviving a special pulse.
      if (v.pickups.length < MAX_VARIANT_PICKUPS) {
        const spot = INITIAL_SHARD_SPOTS[s.steps % INITIAL_SHARD_SPOTS.length];
        if (!same(spot, s.player) && !v.pickups.some((p) => same(p, spot))) {
          v.pickups.push({
            id: ++v.spawned,
            x: spot.x,
            y: spot.y,
            kind: (s.steps / OBELISK_SPECIAL_INTERVAL) % 2 === 0 ? "attack" : "defense",
            amount: Math.max(1, Math.round(s.player.attack * 0.08 * difficultyMultiplier(s.level))),
          });
        }
      }
      message = message ? `${message} Obelisk Arcane Pulse hits for ${dmg} damage!` : `Obelisk unleashes an Arcane Pulse for ${dmg} damage!`;
    } else if (s.steps % OBELISK_SHOT_INTERVAL === 0) {
      const dmg = Math.max(1, Math.round(v.bossAtk * 0.6 - s.player.defense * 0.25));
      s.player.hp = Math.max(0, s.player.hp - dmg);
      shots.push({ from: { x: s.elemental.x, y: s.elemental.y }, to: { x: s.player.x, y: s.player.y }, damage: dmg });
      fired = true;
      message = message ? `${message} Obelisk fires a shot for ${dmg} damage!` : `Obelisk fires an arcane shot for ${dmg} damage!`;
    }
  }

  if (shots.length > 0) {
    if (round) {
      round.shots.push(...shots);
    } else {
      round = {
        step: s.steps,
        from: { x: s.player.x, y: s.player.y },
        to: { x: s.elemental.x, y: s.elemental.y },
        targetName: v.variant === "obelisk" ? "Dread Obelisk" : "Blaster Turret",
        heroDamage: 0,
        enemyDamage: shots.reduce((sum, sh) => sum + sh.damage, 0),
        coins: [],
        shots,
      };
    }
  }

  v.lastRound = round;

  if (s.player.hp === 0) {
    s.status = "lost";
    s.playing = false;
    message = v.variant === "obelisk"
      ? `You were knocked out! ${v.damageThisRun} damage inflicted on the Obelisk has been saved for your next run.`
      : "The trial ends in defeat. Your Tower progress is safe.";
    return { changed: true, message, fired };
  }

  if (v.variant === "obelisk" && v.turnLimit > 0 && s.steps >= v.turnLimit && s.bossHp > 0) {
    s.status = "lost";
    v.outOfTurns = true;
    s.playing = false;
    message = `Out of turns (${v.turnLimit}/${v.turnLimit})! ${v.damageThisRun} damage inflicted on the Obelisk is saved for your next trial.`;
    return { changed: true, message, fired };
  }

  return { changed: true, message: message || "Turn complete.", fired };
}

export function decodeBossVariant(raw: unknown, trialRaw: Record<string, unknown>): BossVariantState | undefined {
  if (!isRecord(raw) || (raw.variant !== "magic-tower" && raw.variant !== "obelisk")) return;
  if (
    typeof raw.multiPart !== "boolean" ||
    !finite(raw.bossAtk, 1e100) ||
    raw.bossAtk <= 0 ||
    !finite(raw.bossDef, 1e100) ||
    raw.bossDef < 0 ||
    !finite(raw.bossRegen, 1e100) ||
    raw.bossRegen < 0 ||
    !wholeIn(raw.turnLimit, 0, 1e6) ||
    typeof raw.outOfTurns !== "boolean" ||
    !finite(raw.damageThisRun, 1e100) ||
    raw.damageThisRun < 0 ||
    !finite(raw.goldEarned, 1e100) ||
    raw.goldEarned < 0 ||
    !finite(raw.silverEarned, 1e100) ||
    raw.silverEarned < 0 ||
    !wholeIn(raw.spawned, 0, 1e9) ||
    !Array.isArray(raw.parts) ||
    raw.parts.length > 3 ||
    !Array.isArray(raw.minions) ||
    raw.minions.length > MAX_VARIANT_MINIONS ||
    !Array.isArray(raw.pickups) ||
    raw.pickups.length > MAX_VARIANT_PICKUPS
  ) {
    return;
  }
  const parts: BossPart[] = [];
  for (const p of raw.parts) {
    if (
      !isRecord(p) ||
      (p.id !== "turret" && p.id !== "regen" && p.id !== "ward") ||
      p.kind !== p.id ||
      typeof p.name !== "string" ||
      !arenaFloor(p.x as number, p.y as number) ||
      !finite(p.hp, 1e100) ||
      !finite(p.maxHp, 1e100) ||
      p.hp < 0 ||
      p.maxHp <= 0 ||
      p.hp > p.maxHp ||
      !finite(p.attack, 1e100) ||
      !finite(p.defense, 1e100)
    ) {
      return;
    }
    parts.push({
      id: p.id,
      name: p.name,
      kind: p.kind,
      x: p.x as number,
      y: p.y as number,
      hp: p.hp,
      maxHp: p.maxHp,
      attack: p.attack,
      defense: p.defense,
    });
  }
  const minions: BossMinion[] = [];
  for (const m of raw.minions) {
    if (
      !isRecord(m) ||
      !wholeIn(m.id, 1, raw.spawned) ||
      typeof m.name !== "string" ||
      !arenaFloor(m.x as number, m.y as number) ||
      !finite(m.hp, 1e100) ||
      !finite(m.maxHp, 1e100) ||
      m.hp <= 0 ||
      m.maxHp <= 0 ||
      m.hp > m.maxHp ||
      !finite(m.attack, 1e100) ||
      !finite(m.defense, 1e100)
    ) {
      return;
    }
    minions.push({
      id: m.id,
      name: m.name,
      x: m.x as number,
      y: m.y as number,
      hp: m.hp,
      maxHp: m.maxHp,
      attack: m.attack,
      defense: m.defense,
    });
  }
  const pickups: FloorPickup[] = [];
  for (const item of raw.pickups) {
    if (
      !isRecord(item) ||
      !wholeIn(item.id, 1, raw.spawned) ||
      !["attack", "defense", "potion", "silver", "gold"].includes(item.kind as string) ||
      !arenaFloor(item.x as number, item.y as number) ||
      !finite(item.amount, 1e100) ||
      item.amount <= 0
    ) {
      return;
    }
    pickups.push({
      id: item.id,
      kind: item.kind as FloorPickupKind,
      x: item.x as number,
      y: item.y as number,
      amount: item.amount,
    });
  }
  const focusedCard =
    raw.focusedCard === null || raw.focusedCard === undefined
      ? null
      : wholeIn(raw.focusedCard, 0, 64)
        ? raw.focusedCard
        : undefined;
  if (focusedCard === undefined) return;
  let lastRound: CombatRound | null = null;
  if (isRecord(raw.lastRound) && isRecord(raw.lastRound.from) && isRecord(raw.lastRound.to)) {
    const lr = raw.lastRound;
    if (
      wholeIn(lr.step, 1, 1e9) &&
      wholeIn(lr.from.x, 0, ARENA_SIZE) &&
      wholeIn(lr.from.y, 0, ARENA_SIZE) &&
      wholeIn(lr.to.x, 0, ARENA_SIZE) &&
      wholeIn(lr.to.y, 0, ARENA_SIZE) &&
      typeof lr.targetName === "string" &&
      finite(lr.heroDamage, 1e100) &&
      finite(lr.enemyDamage, 1e100) &&
      Array.isArray(lr.coins) &&
      Array.isArray(lr.shots)
    ) {
      lastRound = {
        step: lr.step,
        from: { x: lr.from.x, y: lr.from.y },
        to: { x: lr.to.x, y: lr.to.y },
        targetName: lr.targetName,
        heroDamage: lr.heroDamage,
        enemyDamage: lr.enemyDamage,
        coins: lr.coins
          .filter((c): c is Record<string, unknown> => isRecord(c) && isRecord(c.from) && isRecord(c.to) && (c.kind === "gold" || c.kind === "silver") && finite(c.amount, 1e100))
          .map((c) => ({
            from: { x: (c.from as Spot).x, y: (c.from as Spot).y },
            to: { x: (c.to as Spot).x, y: (c.to as Spot).y },
            kind: c.kind as "gold" | "silver",
            amount: c.amount as number,
          })),
        shots: lr.shots
          .filter((sh): sh is Record<string, unknown> => isRecord(sh) && isRecord(sh.from) && isRecord(sh.to) && finite(sh.damage, 1e100))
          .map((sh) => ({
            from: { x: (sh.from as Spot).x, y: (sh.from as Spot).y },
            to: { x: (sh.to as Spot).x, y: (sh.to as Spot).y },
            damage: sh.damage as number,
            ...(sh.special ? { special: true } : {}),
          })),
      };
    }
  }
  void trialRaw;
  return {
    variant: raw.variant,
    multiPart: raw.multiPart,
    bossAtk: raw.bossAtk,
    bossDef: raw.bossDef,
    bossRegen: raw.bossRegen,
    turnLimit: raw.turnLimit,
    outOfTurns: raw.outOfTurns,
    damageThisRun: raw.damageThisRun,
    goldEarned: raw.goldEarned,
    silverEarned: raw.silverEarned,
    parts,
    minions,
    pickups,
    spawned: raw.spawned,
    focusedCard,
    lastRound,
  };
}
