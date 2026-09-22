import { test } from "node:test";
import assert from "node:assert/strict";
import { ATMOSPHERE_CONFIG, Renderer } from "../src/rendering.ts";
import { defaults } from "../src/save.ts";
import { Game } from "../src/state.ts";

test("atmospheric configuration has restrained, tunable defaults", () => {
  assert.ok(ATMOSPHERE_CONFIG, "ATMOSPHERE_CONFIG must exist");

  // ambient tint checks
  assert.equal(typeof ATMOSPHERE_CONFIG.ambientColor, "string");
  assert.ok(ATMOSPHERE_CONFIG.ambientColor.length > 0);
  assert.ok(ATMOSPHERE_CONFIG.ambientStrength >= 0 && ATMOSPHERE_CONFIG.ambientStrength <= 0.35,
    "Ambient strength should remain subtle and not exceed readable ceiling");

  // vignette checks
  assert.ok(ATMOSPHERE_CONFIG.vignetteStrength >= 0 && ATMOSPHERE_CONFIG.vignetteStrength <= 0.5,
    "Vignette strength should be gentle and not obscure corners");
  assert.ok(ATMOSPHERE_CONFIG.vignetteSoftness >= 0.2 && ATMOSPHERE_CONFIG.vignetteSoftness <= 0.9,
    "Vignette softness should have a gradual transition");

  // torch haze checks
  assert.ok(ATMOSPHERE_CONFIG.torchHazeStrength >= 0 && ATMOSPHERE_CONFIG.torchHazeStrength <= 0.4,
    "Torch haze should be soft atmospheric diffusion, not an opaque fog block");
  assert.ok(ATMOSPHERE_CONFIG.torchHazeRadius >= 1.0 && ATMOSPHERE_CONFIG.torchHazeRadius <= 2.0,
    "Torch haze radius should gently expand beyond raw light radius");
  assert.ok(ATMOSPHERE_CONFIG.torchHazeBlur >= 0 && ATMOSPHERE_CONFIG.torchHazeBlur <= 12,
    "Torch haze blur should be lightweight and feather gracefully");
});

test("Renderer exposes modular atmosphere config instance that can be tuned", () => {
  // Mock a minimal canvas element
  const canvas = {
    getContext: () => ({
      setTransform: () => {},
      fillRect: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      closePath: () => {},
      clip: () => {},
      createRadialGradient: () => ({
        addColorStop: () => {},
      }),
      getBoundingClientRect: () => ({ width: 400, left: 0, top: 0 }),
    }),
    getBoundingClientRect: () => ({ width: 400, left: 0, top: 0 }),
    width: 400,
    height: 400,
  } as unknown as HTMLCanvasElement;

  const game = new Game(defaults());
  const renderer = new Renderer(canvas, game);

  assert.ok(renderer.atmosphere);
  assert.equal(renderer.atmosphere.ambientStrength, ATMOSPHERE_CONFIG.ambientStrength);

  // Verify parameters can be dynamically tuned per renderer
  renderer.atmosphere.ambientStrength = 0.05;
  renderer.atmosphere.torchHazeStrength = 0.1;
  renderer.atmosphere.vignetteStrength = 0.15;
  assert.equal(renderer.atmosphere.ambientStrength, 0.05);
  assert.equal(renderer.atmosphere.torchHazeStrength, 0.1);
  assert.equal(renderer.atmosphere.vignetteStrength, 0.15);
});
