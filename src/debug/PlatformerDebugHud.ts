/**
 * Optional platformer KCC / grounded debug tools (DOM + optional slomo hotkey).
 *
 * Neither tool is wired into Play by default: no actor/component in the outliner, no F3/F4
 * shortcuts. Snapshots are still written each tick on the mover (`platformer.debug`) so the
 * overlay can read live state when installed.
 *
 * ## Re-enable for a local investigation (agents / devs)
 *
 * **Debug HUD**
 * 1. Set {@link PLATFORMER_DEBUG_HUD_ENABLED} to `true`
 * 2. From player `doBeginPlay` (or GameMode), call:
 *    `installPlatformerDebugHud(world, () => pawn.getNode(ENGINE.MoverNode))`
 * 3. Keep the returned `dispose()` and call it from `doEndPlay`
 *
 * **Slomo hotkey (F4)**
 * 1. Set {@link PLATFORMER_SLOMO_HOTKEY_ENABLED} to `true`
 * 2. Requires the HUD install path above (hotkey is registered inside `installPlatformerDebugHud`)
 * 3. Cycles world `slomo`: 1 → 0.5 → 0.25 → 0.1 → 1
 *
 * Keep both flags `false` in the shipped template.
 */
import * as ENGINE from '@gnsx/genesys.js';

import {
  getPlatformerDebugSnapshot,
  type PlatformerDebugSnapshot,
} from '../movement/PlatformerModeShared.js';

/** Mount the KCC/grounded overlay. Keep `false` in the template. */
export const PLATFORMER_DEBUG_HUD_ENABLED = false;

/** Bind F4 to cycle world slomo while the debug HUD is installed. Keep `false` in the template. */
export const PLATFORMER_SLOMO_HOTKEY_ENABLED = false;

/** World exposes `slomo` only via the `slomo` console command; private field, fine for debug. */
type WorldSlomoAccess = { slomo: number };

const SLOMO_STEPS = [1, 0.5, 0.25, 0.1];

function fmt(n: number, digits = 2): string {
  return (Object.is(n, -0) ? 0 : n).toFixed(digits);
}

function flag(on: boolean, label: string): string {
  const color = on ? '#6dffa0' : '#666';
  return `<span style="color:${color}">${label}:${on ? 'Y' : 'n'}</span>`;
}

function getSlomo(world: ENGINE.World | null | undefined): number {
  return world ? (world as unknown as WorldSlomoAccess).slomo : 1;
}

function setSlomo(world: ENGINE.World | null | undefined, value: number): void {
  if (!world) return;
  (world as unknown as WorldSlomoAccess).slomo = value;
}

function render(s: PlatformerDebugSnapshot, slomo: number, slomoHotkey: boolean): string {
  const slomoColor = slomo < 1 ? '#ffd36d' : '#9eb0c8';
  const hint = slomoHotkey ? ' <span style="opacity:.6">(F4 slomo)</span>' : '';
  return [
    `<div style="color:#9eb0c8;margin-bottom:4px">PLATFORMER DEBUG${hint}</div>`,
    `<span style="color:${slomoColor}">slomo  ×${fmt(slomo, 2)}</span>`,
    `mode   ${s.mode}`,
    `pos    ${fmt(s.posX)}  ${fmt(s.posY)}`,
    `vel    vx=${fmt(s.vx)}  vy=${fmt(s.vy)}`,
    `input  moveX=${fmt(s.moveX, 2)}  jump=${s.jumpPressed ? 'hold' : '-'}`,
    '',
    `<div style="color:#9eb0c8">ENGINE FLAGS</div>`,
    `${flag(s.kccGrounded, 'kccGrounded')}  ${flag(s.hitGround, 'hitGround')}  ${flag(s.hitCeiling, 'hitCeiling')}`,
    '',
    `<div style="color:#9eb0c8">APPLIED (gameplay)</div>`,
    `${flag(s.groundedApplied, 'grounded')}  ${flag(s.jumping, 'jumping')}  facing=${s.facing > 0 ? '+' : '-'}`,
    `coyote ${fmt(s.coyote, 3)}s   buffer ${fmt(s.buffer, 3)}s`,
    `tags   ${s.tags}`,
    '',
    `<div style="color:#9eb0c8">DELTA (req → actual)</div>`,
    `dx  ${fmt(s.reqDx, 3)} → ${fmt(s.actDx, 3)}  ${flag(s.blockedX, 'blockedX')}`,
    `dy  ${fmt(s.reqDy, 3)} → ${fmt(s.actDy, 3)}  ${flag(s.blockedUp, 'up')} ${flag(s.blockedDown, 'down')}`,
    '',
    `<div style="color:#9eb0c8">HEURISTICS (no normals)</div>`,
    `${flag(s.heurGround, 'heurGround')}  ${flag(s.heurCeiling, 'heurCeiling')}`,
    `<div style="opacity:.65;margin-top:6px;white-space:normal;max-width:300px">` +
      `Gameplay grounded = hitGround || (wasGrounded &amp;&amp; kccGrounded) while not rising; ` +
      `then cleared again if jumping &amp;&amp; vy &gt; 0. Anim / modes read the grounded tag — not kccGrounded alone.` +
      `</div>`,
  ].join('\n');
}

export type PlatformerDebugHudHandle = {
  /** Remove DOM + optional key listener and restore slomo to 1. */
  dispose: () => void;
};

/**
 * Mount the overlay on `world.gameContainer`. No-op when {@link PLATFORMER_DEBUG_HUD_ENABLED} is false.
 * Returns a disposer, or null when disabled / missing container.
 *
 * F4 slomo is registered only when {@link PLATFORMER_SLOMO_HOTKEY_ENABLED} is also true.
 */
export function installPlatformerDebugHud(
  world: ENGINE.World,
  getMover: () => ENGINE.MoverNode | null,
): PlatformerDebugHudHandle | null {
  if (!PLATFORMER_DEBUG_HUD_ENABLED) return null;

  const container = world.gameContainer;
  if (!container) return null;

  const root = document.createElement('div');
  root.id = 'platformer-debug-hud';
  Object.assign(root.style, {
    position: 'absolute',
    top: '8px',
    right: '8px',
    zIndex: '9999',
    padding: '10px 12px',
    background: 'rgba(8, 10, 14, 0.82)',
    border: '1px solid #3a4250',
    borderRadius: '6px',
    color: '#d7dde8',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '12px',
    lineHeight: '1.45',
    whiteSpace: 'pre',
    pointerEvents: 'none',
    minWidth: '280px',
  } as CSSStyleDeclaration);
  container.appendChild(root);

  const slomoHotkey = PLATFORMER_SLOMO_HOTKEY_ENABLED;
  const onKeyDown = (e: KeyboardEvent): void => {
    if (!slomoHotkey || e.repeat || e.code !== 'F4') return;
    const current = getSlomo(world);
    const idx = SLOMO_STEPS.findIndex((s) => Math.abs(s - current) < 1e-6);
    setSlomo(world, SLOMO_STEPS[(idx + 1) % SLOMO_STEPS.length]);
  };
  if (slomoHotkey) {
    window.addEventListener('keydown', onKeyDown);
  }

  let raf = 0;
  const tick = (): void => {
    const mover = getMover();
    const snap = mover ? getPlatformerDebugSnapshot(mover) : null;
    root.innerHTML = snap ? render(snap, getSlomo(world), slomoHotkey) : 'platformer debug: no mover';
    raf = window.requestAnimationFrame(tick);
  };
  raf = window.requestAnimationFrame(tick);

  return {
    dispose: () => {
      window.cancelAnimationFrame(raf);
      if (slomoHotkey) window.removeEventListener('keydown', onKeyDown);
      setSlomo(world, 1);
      root.remove();
    },
  };
}
