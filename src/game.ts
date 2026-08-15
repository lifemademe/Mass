/**
 * 2D Action Template - entry point.
 *
 * Wires the `Action2DGameMode` (side-on platformer player + controller, HUD, objective/respawn
 * flow) into the engine game loop. All gameplay classes live under `src/` and self-register via
 * the `@ENGINE.GameClass()` decorator.
 */
import * as ENGINE from '@gnsx/genesys.js';

import { Action2DGameMode } from './core/Action2DGameMode.js';

class MyGame extends ENGINE.BaseGameLoop {
}

export function main(container: HTMLElement, options?: Partial<ENGINE.BaseGameLoopOptions>): ENGINE.IGameLoop {
  const mergedOptions: Partial<ENGINE.BaseGameLoopOptions> = {
    ...options,
    defaultGameModeClass: Action2DGameMode,
  };
  const game = new MyGame(container, mergedOptions);
  return game;
}
