/**
 * PlatformerPlayerController - keyboard/mouse input for the side-on player.
 *
 * Acts as an `IMovementInputProducer`, feeding only the X axis + jump flags into the pawn's
 * `MoverComponent`. Attack and manual-respawn are surfaced as delegates so gameplay
 * components (AttackComponent, damage handler) can subscribe without polling raw input.
 */
import * as ENGINE from '@gnsx/genesys.js';

@ENGINE.GameClass()
export class PlatformerPlayerController extends ENGINE.PlayerController implements ENGINE.IMovementInputProducer {
  /** Fired on the frame the attack button is pressed. */
  public readonly onAttack = new ENGINE.Delegate<[]>();
  /** Fired when the player requests a manual respawn (R). */
  public readonly onRespawnRequested = new ENGINE.Delegate<[]>();

  private readonly leftKeys = ['KeyA', 'ArrowLeft'];
  private readonly rightKeys = ['KeyD', 'ArrowRight'];
  private readonly jumpKeys = ['Space', 'KeyW', 'ArrowUp'];
  private readonly attackKeys = ['KeyJ'];
  private readonly respawnKeys = ['KeyR'];

  private left = 0;
  private right = 0;
  private isJumpHeld = false;
  private jumpJustPressedFlag = false;

  private moverComponent: ENGINE.MoverNode | null = null;

  protected override onPossess(pawn: ENGINE.Pawn): void {
    super.onPossess(pawn);
    this.moverComponent = pawn.getNode(ENGINE.MoverNode);
    if (!this.moverComponent) {
      console.warn(`[PlatformerPlayerController] Pawn '${pawn.name}' has no MoverComponent.`);
      return;
    }
    this.moverComponent.addInputProducer(this);
  }

  protected override onUnpossess(pawn: ENGINE.Pawn): void {
    this.moverComponent?.removeInputProducer(this);
    this.moverComponent = null;
    super.onUnpossess(pawn);
  }

  public produceInput(_simTimeMs: number, cmd: ENGINE.MovementInputCmd): void {
    cmd.moveInput.x += this.right - this.left;
    cmd.jumpJustPressed = cmd.jumpJustPressed || this.jumpJustPressedFlag;
    cmd.jumpPressed = cmd.jumpPressed || this.isJumpHeld;
    this.jumpJustPressedFlag = false;
  }

  public override handleKeyDown(e: KeyboardEvent): boolean {
    const code = e.code;
    if (this.leftKeys.includes(code)) {
      this.left = 1;
    } else if (this.rightKeys.includes(code)) {
      this.right = 1;
    } else if (this.jumpKeys.includes(code)) {
      if (!this.isJumpHeld) this.jumpJustPressedFlag = true;
      this.isJumpHeld = true;
    } else if (this.attackKeys.includes(code)) {
      if (!e.repeat) this.onAttack.invoke();
    } else if (this.respawnKeys.includes(code)) {
      if (!e.repeat) this.onRespawnRequested.invoke();
    } else {
      return false;
    }
    return true;
  }

  public override handleKeyUp(e: KeyboardEvent): boolean {
    const code = e.code;
    if (this.leftKeys.includes(code)) {
      this.left = 0;
    } else if (this.rightKeys.includes(code)) {
      this.right = 0;
    } else if (this.jumpKeys.includes(code)) {
      this.isJumpHeld = false;
    } else {
      return false;
    }
    return true;
  }

  public override handleMouseDown(_button: ENGINE.MouseButton, e: MouseEvent): boolean {
    if (e.button === 0) {
      this.onAttack.invoke();
      return true;
    }
    return false;
  }

  public override getEditorClassIcon(): string | null {
    return 'Icon_Character';
  }
}
