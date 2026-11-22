import { ARCANA, type ArcanumId } from "./arcana/arcana.ts";

/** Presentation fixtures only: no run, unlock, settings or saved animation state. */
export const ARCANA_RESEARCH_EXAMPLES = [
  { id: "ricochetShock", name: "Ricochet Shock", change: "The current yellow mark becomes a native lightning badge with a brief pixel crackle. The proposal is now used by Classic gameplay." },
  { id: "dilationGuard", name: "Time Dilation Damage Reduction", change: "Current protection has no separate marker. A native hourglass shield shows when the researched field protects the hero; Classic now uses this feedback." },
  { id: "phantasmStun", name: "Phantasm Stun", change: "Current ghosts have no stun marker. Orbiting violet stars propose a visible stunned state." },
  { id: "necroFreeze", name: "Necrotic Freeze", change: "The current frost field has no freeze marker. Ice shards and a cracking shell identify the frozen target." },
  { id: "voidwellDamage", name: "Voidwell Damage", change: "Current damage uses numbers without a dedicated animation. Inward violet pulses propose a visible damage tick." },
  { id: "extraVoidwell", name: "Extra Voidwell", change: "Compare the current pair of smooth vortices with two synchronized pixel vortices." },
  { id: "overseerZap", name: "Overseer Zap", change: "Current Zap reuses Thunderbolt inside the beams. The proposal adds a gold targeting mark and pixel lightning." },
  { id: "thunderboltExpansion", name: "Thunderbolt Expansion", change: "Current splash reuses the impact flash. A pixel shock ring connects the bolt to nearby splash targets." },
] as const;
export type ArcanaExampleId = ArcanumId | typeof ARCANA_RESEARCH_EXAMPLES[number]["id"];
export const ARCANA_EXAMPLES: readonly { id: ArcanaExampleId; name: string; change: string }[] = [...[
  { id: "voidwell", change: "Stepped blue bands and pixel spirals replace the smooth gradient." },
  { id: "necroticFrost", change: "A crisp double rim with rising frost motes and pixel pops." },
  { id: "lifespring", change: "Broken green rings and healing runes move in discrete frames." },
  { id: "timeDilation", change: "A blue pixel rim and clock marks make the field boundary clear." },
  { id: "overseer", change: "Palette-colored beam edges and moving light bands follow the same sweep." },
  { id: "thunderbolt", change: "A stepped bolt, shaded core and pixel impact replace the stroked lightning." },
  { id: "phantasm", change: "Shaded pixel ghosts and stepped bobbing retain the same orbit." },
  { id: "ricochetShot", change: "A stepped gold trail and small impact sparks replace the white line." },
  { id: "aurumBloom", change: "A new gold-petal burst proposal. Currently Aurum Bloom changes rewards without a dedicated effect." },
].map(ex => ({ ...ex, name: ARCANA[ex.id as ArcanumId].name, id: ex.id as ArcanumId })), ...ARCANA_RESEARCH_EXAMPLES];

export const arcanaExampleIndex = (index: number) => ((Math.trunc(index) % ARCANA_EXAMPLES.length) + ARCANA_EXAMPLES.length) % ARCANA_EXAMPLES.length;
export const ARCANA_LAB_DURATION = 4800;
export const ARCANA_LAB_STILL = 150;
/** Start research examples on the impact frame, including the expansion splash. */
export const arcanaExampleStill = (id: ArcanaExampleId) => ARCANA_RESEARCH_EXAMPLES.some(ex => ex.id === id) ? 450 : ARCANA_LAB_STILL;
export const ARCANA_LAB_SIZE = 264;
export const ARCANA_LAB_CENTER = 132;
export const ARCANA_LAB_RADIUS = 76;
export const ARCANA_LAB_TARGET = { x: 204, y: 108 };
export const ARCANA_LAB_SPLASH = { x: 204, y: 156 };
export const ARCANA_LAB_TWINS = [{ x: 72, y: 132 }, { x: 192, y: 132 }] as const;
/** Slowed equally on both sides so short impact flashes are easy to inspect. */
export const arcanaBurstAge = (time: number) => (time % 2400) / 3;

/** How long each arcanum's purchase preview runs before it repeats: a whole
 * number of every period its painters move by, so the seam doesn't show.
 * Bursts repeat every 2.4 s (`arcanaBurstAge`), frost bubbles every 1.5 s,
 * the vortex's arms every 9 s, the beams every 12 s, and Lifespring's three
 * rings (0.09, 0.13 and 0.17 turns a second) all come round together at 100 s. */
export const ARCANUM_PREVIEW_LOOPS: Record<ArcanumId, number> = {
  thunderbolt: 2400, ricochetShot: 2400, aurumBloom: 2400, timeDilation: 2400,
  necroticFrost: 1500, voidwell: 9000, overseer: 12000, phantasm: 12000, lifespring: 100000,
};
