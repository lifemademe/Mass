import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

export interface SlimeMovementHost {
  getMoveSpeed(): number;
  getTetherAnchorPosition(): THREE.Vector3 | null;
  getTetherLength(): number;
  getMovementSettings(): SlimeMovementSettingsNode;
}

@ENGINE.GameClass()
export class SlimeMovementSettingsNode extends ENGINE.SceneNode {
  @ENGINE.property({ type: 'number', category: 'Movement', min: 1, max: 20, step: 0.1 })
  public smallSpeed = 8;

  @ENGINE.property({ type: 'number', category: 'Movement', min: 1, max: 20, step: 0.1 })
  public mediumSpeed = 6.5;

  @ENGINE.property({ type: 'number', category: 'Movement', min: 1, max: 20, step: 0.1 })
  public largeSpeed = 5.2;

  @ENGINE.property({ type: 'number', category: 'Movement', min: 1, max: 200, step: 1 })
  public acceleration = 70;

  @ENGINE.property({ type: 'number', category: 'Movement', min: 0, max: 1, step: 0.05 })
  public airControl = 0.7;

  @ENGINE.property({ type: 'number', category: 'Movement', min: 0, max: 30, step: 0.25 })
  public airDrag = 3;

  @ENGINE.property({ type: 'number', category: 'Movement', min: 1, max: 100, step: 1 })
  public gravity = 38;

  @ENGINE.property({ type: 'number', category: 'Movement', min: 1, max: 100, step: 1 })
  public maxFallSpeed = 30;

  @ENGINE.property({ type: 'number', category: 'Stretch', min: 1, max: 100, step: 1 })
  public tetherPull = 64;

  @ENGINE.property({ type: 'number', category: 'Stretch', min: 2, max: 8, step: 0.05 })
  public swingTetherLength = 4;

  @ENGINE.property({ type: 'number', category: 'Stretch', min: 0, max: 100, step: 1 })
  public tetherSpringStrength = 34;

  @ENGINE.property({ type: 'number', category: 'Stretch', min: 0, max: 20, step: 0.25 })
  public tetherRadialDamping = 8;

  @ENGINE.property({ type: 'number', category: 'Stretch', min: 1, max: 20, step: 0.25 })
  public maxTetherReelSpeed = 7;

  @ENGINE.property({ type: 'number', category: 'Stretch', min: 0, max: 60, step: 1 })
  public swingAcceleration = 18;

  @ENGINE.property({ type: 'number', category: 'Stretch', min: 0, max: 20, step: 0.25 })
  public releaseBoost = 3;

  public override getEditorClassIcon(): string | null {
    return 'Icon_Character';
  }
}

function moveToward(current: number, target: number, maxDelta: number): number {
  const difference = target - current;
  if (Math.abs(difference) <= maxDelta) return target;
  return current + Math.sign(difference) * maxDelta;
}

export class SlimeMovementMode implements ENGINE.IMovementMode {
  public readonly transitions: ENGINE.IMoverTransition[] = [];

  private readonly controllerOptions = {
    ...ENGINE.defaultCharacterControllerOptions(),
    simulatedGravityScale: 0,
    snapToGroundDistance: undefined,
    autoStepConfig: undefined,
  };

  public onActivate(mover: ENGINE.MoverNode): void {
    ENGINE.ensureCharacterController(mover, this.controllerOptions);
  }

  public onDeactivate(_mover: ENGINE.MoverNode): void {}

  public cleanup(mover: ENGINE.MoverNode): void {
    ENGINE.releaseCharacterController(mover);
  }

  public generateMove(startData: ENGINE.MoverTickStartData): ENGINE.ProposedMove {
    return {
      velocity: new THREE.Vector3(
        THREE.MathUtils.clamp(startData.inputCmd.moveInput.x, -1, 1),
        0,
        0,
      ),
      mixMode: ENGINE.MoveMixMode.Override,
    };
  }

  public simulationTick(params: ENGINE.SimulationTickParams): ENGINE.MoverTickEndData {
    const { startData, proposedMove, timeStep, mover } = params;
    const sync = ENGINE.cloneSyncState(startData.syncState);
    const auxState = { custom: startData.auxState.custom.clone() };
    const host = mover.getRoot() as unknown as SlimeMovementHost;
    const settings = host.getMovementSettings();
    const dt = Math.min(timeStep.stepMs / 1000, 0.1);
    const wasGrounded = startData.syncState.tags.includes(ENGINE.GROUNDED_TAG);
    const inputX = THREE.MathUtils.clamp(startData.inputCmd.moveInput.x, -1, 1);

    let vx = sync.velocity.x;
    let vy = ENGINE.getVerticalVelocity(sync);
    const anchor = host.getTetherAnchorPosition();
    const targetX = proposedMove.velocity.x * host.getMoveSpeed();
    if (!anchor) {
      const hasHorizontalInput = Math.abs(inputX) > 0.01;
      const horizontalRate = hasHorizontalInput
        ? settings.acceleration * (wasGrounded ? 1 : settings.airControl)
        : wasGrounded ? settings.acceleration : settings.airDrag;
      vx = moveToward(vx, targetX, horizontalRate * dt);
    }
    vy = Math.max(vy - settings.gravity * dt, -settings.maxFallSpeed);

    if (anchor) {
      const toAnchor = anchor.clone().sub(sync.position);
      const distance = Math.max(toAnchor.length(), 0.001);
      const direction = toAnchor.multiplyScalar(1 / distance);
      const tangent = new THREE.Vector3(direction.y, -direction.x, 0);
      if (tangent.x < 0) tangent.negate();
      const tetherLength = host.getTetherLength();
      const extension = Math.max(0, distance - tetherLength);
      const tautness = THREE.MathUtils.clamp(distance / tetherLength, 0, 1);
      const pull = settings.tetherPull * tautness + extension * settings.tetherSpringStrength;
      vx += (direction.x * pull + tangent.x * inputX * settings.swingAcceleration) * dt;
      vy += (direction.y * pull + tangent.y * inputX * settings.swingAcceleration) * dt;

      // Remove rubber-band energy only along the tether. Tangential velocity is
      // intentionally preserved so A/D still produces a lively, controllable swing.
      const radialSpeed = vx * direction.x + vy * direction.y;
      const dampedRadialSpeed = THREE.MathUtils.clamp(
        radialSpeed * Math.exp(-settings.tetherRadialDamping * dt),
        -settings.maxTetherReelSpeed,
        settings.maxTetherReelSpeed,
      );
      const radialCorrection = dampedRadialSpeed - radialSpeed;
      vx += direction.x * radialCorrection;
      vy += direction.y * radialCorrection;

      // Keep the tether at the length captured when it attached. Waiting until the
      // exact limit allows a fast fall to overshoot by a full frame and slowly drift
      // below the level, so begin enforcing it just before the rope becomes taut.
      if (distance >= tetherLength - 0.05) {
        const constrainedRadialSpeed = vx * direction.x + vy * direction.y;
        if (constrainedRadialSpeed < 0) {
          vx -= direction.x * constrainedRadialSpeed;
          vy -= direction.y * constrainedRadialSpeed;
        }
      }
    }

    let grounded = false;
    const root = ENGINE.getPrimitiveRoot(mover);
    if (root && ENGINE.ensureCharacterController(mover, this.controllerOptions)) {
      const minimumDown = 0.002;
      // Preserve a tiny downward sweep only while falling/grounded. Applying it
      // unconditionally discarded every upward velocity produced by a tether.
      const requestedY = vy > 0 ? vy * dt : Math.min(vy * dt, -minimumDown);
      const delta = new THREE.Vector3(vx * dt, requestedY, 0);
      const moved = mover.getPhysicsEngine()!.computeCharacterMovement(
        mover,
        root,
        delta.toArray(),
        false,
        dt,
        false,
      );
      sync.position.add(moved.actualMovement);
      grounded = moved.hitGround || (wasGrounded && moved.isGrounded && vy <= 0);
      if (grounded) vy = 0;
      if (moved.hitCeiling && vy > 0) vy = 0;
      sync.position.z = 0;
      root.position.copy(sync.position);
      root.setPhysicsTransformUpdateFlags({
        sendPosition: true,
        sendRotation: false,
        receivePosition: false,
        receiveRotation: false,
      });
    } else {
      sync.position.add(new THREE.Vector3(vx * dt, vy * dt, 0));
    }

    if (anchor) {
      const lowestTetherY = anchor.y - host.getTetherLength();
      const tetherWasAboveFloor = startData.syncState.position.y >= lowestTetherY - 0.05;
      if (tetherWasAboveFloor && sync.position.y < lowestTetherY) {
        sync.position.y = lowestTetherY;
        if (vy < 0) vy = 0;
        if (root) {
          root.position.copy(sync.position);
          root.setPhysicsTransformUpdateFlags({
            sendPosition: true,
            sendRotation: false,
            receivePosition: false,
            receiveRotation: false,
          });
        }
      }
    }

    sync.rotation.set(0, 0, 0, 'YXZ');
    sync.velocity.set(vx, vy, 0);
    sync.tags = [grounded ? ENGINE.GROUNDED_TAG : ENGINE.FALLING_TAG];
    if (anchor) sync.tags.push('slime.tethered');
    ENGINE.setVerticalVelocity(sync, vy);
    return { syncState: sync, auxState };
  }
}
