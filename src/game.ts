/**
 * Mass prototype - entry point.
 *
 * Wires the dedicated slime prototype into the engine game loop. Existing action-template
 * systems remain available under `src/` and all gameplay classes self-register via
 * the `@ENGINE.GameClass()` decorator.
 */
import * as ENGINE from '@gnsx/genesys.js';

import { SlimePrototypeGameMode } from './slime/SlimePrototypeGameMode.js';

class MyGame extends ENGINE.BaseGameLoop {
  protected override resolveStartupGameMode(_sceneData: unknown): ENGINE.GameMode {
    return this.createDefaultGameMode();
  }
}

export function main(container: HTMLElement, options?: Partial<ENGINE.BaseGameLoopOptions>): ENGINE.IGameLoop {
  const mergedOptions: Partial<ENGINE.BaseGameLoopOptions> = {
    ...options,
    defaultGameModeClass: SlimePrototypeGameMode,
  };
  const game = new MyGame(container, mergedOptions);
  return game;
}
