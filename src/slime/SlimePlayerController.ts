import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { SlimePawn } from './SlimePawn.js';
import { getSlimeGameContext } from './SlimeRuntime.js';

@ENGINE.GameClass()
export class SlimePlayerController extends ENGINE.PlayerController implements ENGINE.IMovementInputProducer {
  private left = 0;
  private right = 0;
  private pawnRef: SlimePawn | null = null;
  private mover: ENGINE.MoverNode | null = null;
  private readonly aimPoint = new THREE.Vector3(1, 1, 0);

  protected override onPossess(pawn: ENGINE.Pawn): void {
    super.onPossess(pawn);
    this.pawnRef = pawn instanceof SlimePawn ? pawn : null;
    this.mover = this.pawnRef?.getMover() ?? null;
    this.mover?.addInputProducer(this);
  }

  protected override onUnpossess(pawn: ENGINE.Pawn): void {
    this.mover?.removeInputProducer(this);
    this.mover = null;
    this.pawnRef = null;
    super.onUnpossess(pawn);
  }

  public produceInput(_simTimeMs: number, cmd: ENGINE.MovementInputCmd): void {
    const gameplayActive = getSlimeGameContext(this.getWorld())?.isGameplayActive() ?? false;
    const moveInput = gameplayActive ? this.right - this.left : 0;
    this.pawnRef?.setTetherMovementInputActive(Math.abs(moveInput) > 0.01);
    if (!gameplayActive) return;
    cmd.moveInput.x += moveInput;
  }

  public override handleKeyDown(event: KeyboardEvent): boolean {
    if (!getSlimeGameContext(this.getWorld())?.isGameplayActive()) return false;
    if (event.code === 'KeyA' || event.code === 'ArrowLeft') {
      this.left = 1;
    } else if (event.code === 'KeyD' || event.code === 'ArrowRight') {
      this.right = 1;
    } else if (event.code === 'Space') {
      if (!event.repeat) this.pawnRef?.beginSplitCharge();
    } else if (event.code === 'KeyQ') {
      if (!event.repeat) this.pawnRef?.pulseSense();
    } else if (event.code === 'KeyR') {
      if (!event.repeat) getSlimeGameContext(this.getWorld())?.restartPrototype();
    } else {
      return false;
    }
    return true;
  }

  public override handleKeyUp(event: KeyboardEvent): boolean {
    if (!getSlimeGameContext(this.getWorld())?.isGameplayActive()) return false;
    if (event.code === 'KeyA' || event.code === 'ArrowLeft') {
      this.left = 0;
    } else if (event.code === 'KeyD' || event.code === 'ArrowRight') {
      this.right = 0;
    } else if (event.code === 'Space') {
      const direction = Math.sign(this.aimPoint.x - (this.pawnRef?.getWorldPosition().x ?? 0));
      this.pawnRef?.commitSplit(direction);
    } else {
      return false;
    }
    return true;
  }

  public override handleMouseMove(event: MouseEvent): boolean {
    if (!getSlimeGameContext(this.getWorld())?.isGameplayActive()) return false;
    const point = this.projectMouseToPlayPlane(event);
    if (!point) return false;
    this.aimPoint.copy(point);
    this.pawnRef?.setAimWorldPoint(point);
    return false;
  }

  public override handleMouseDown(_button: ENGINE.MouseButton, event: MouseEvent): boolean {
    if (!getSlimeGameContext(this.getWorld())?.isGameplayActive()) return false;
    if (event.button !== 0) return false;
    this.pawnRef?.beginStretch();
    return true;
  }

  public override handleMouseUp(_button: ENGINE.MouseButton, event: MouseEvent): boolean {
    if (!getSlimeGameContext(this.getWorld())?.isGameplayActive()) return false;
    if (event.button !== 0) return false;
    this.pawnRef?.releaseStretch();
    return true;
  }

  private projectMouseToPlayPlane(event: MouseEvent): THREE.Vector3 | null {
    const pawn = this.pawnRef;
    const camera = pawn?.getCamera();
    const container = pawn?.getWorld()?.gameContainer;
    if (!pawn || !camera || !container) return null;
    const bounds = container.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const ndc = new THREE.Vector3(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      0.5,
    );
    const worldPoint = ndc.unproject(camera);
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const direction = worldPoint.sub(origin).normalize();
    if (Math.abs(direction.z) < 0.0001) return null;
    const distance = -origin.z / direction.z;
    return origin.addScaledVector(direction, distance).setZ(0);
  }

  public override getEditorClassIcon(): string | null {
    return 'Icon_Character';
  }
}
