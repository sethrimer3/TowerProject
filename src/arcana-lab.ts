import { ARCANA, type ArcanumId } from "./arcana/arcana.ts";

/** Presentation fixtures only: no run, unlock, settings or saved animation state. */
export const ARCANA_EXAMPLES: readonly { id: ArcanumId; name: string; change: string }[] = [
  { id: "voidwell", change: "Stepped blue bands and pixel spirals replace the smooth gradient." },
  { id: "necroticFrost", change: "A crisp double rim with rising frost motes and pixel pops." },
  { id: "lifespring", change: "Broken green rings and healing runes move in discrete frames." },
  { id: "timeDilation", change: "A blue pixel rim and clock marks make the field boundary clear." },
  { id: "overseer", change: "Palette-colored beam edges and moving light bands follow the same sweep." },
  { id: "thunderbolt", change: "A stepped bolt, shaded core and pixel impact replace the stroked lightning." },
  { id: "phantasm", change: "Shaded pixel ghosts and stepped bobbing retain the same orbit." },
  { id: "ricochetShot", change: "A stepped gold trail and small impact sparks replace the white line." },
  { id: "aurumBloom", change: "A new gold-petal burst proposal. Currently Aurum Bloom changes rewards without a dedicated effect." },
].map(ex => ({ ...ex, name: ARCANA[ex.id as ArcanumId].name, id: ex.id as ArcanumId }));

export const arcanaExampleIndex = (index: number) => ((Math.trunc(index) % ARCANA_EXAMPLES.length) + ARCANA_EXAMPLES.length) % ARCANA_EXAMPLES.length;
export const ARCANA_LAB_DURATION = 4800;
export const ARCANA_LAB_STILL = 150;
export const ARCANA_LAB_SIZE = 264;
export const ARCANA_LAB_CENTER = 132;
export const ARCANA_LAB_RADIUS = 76;
export const ARCANA_LAB_TARGET = { x: 204, y: 108 };
/** Slowed equally on both sides so short impact flashes are easy to inspect. */
export const arcanaBurstAge = (time: number) => (time % 2400) / 3;
