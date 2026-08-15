/**
 * EquippedWeaponComponent - follows a bone socket on a host ModelMeshNode with a weapon mesh.
 *
 * The weapon ModelMeshNode stays parented under this component (SceneNode reparent onto bone
 * sockets during Play breaks the v14 PlayState machine). Each tick the component copies the
 * socket world pose onto the weapon. `ModelMeshNode.rebuildSockets()` recreates socket
 * Object3Ds on model load / socket edits; `onSocketsChanged` re-syncs pose after that.
 *
 * Grip: `socketOffset` / `socketRotation` / `socketScale` live on the socket (relative to the bone);
 * `localOffset` / `localRotation` / `localScale` live on the weapon relative to the socket.
 * Mixamo bone scale is already stripped by the engine socket's `updateMatrixWorld` override.
 *
 * Listens for `attackStart` / `attackCancel` feedback to drive attack anim.
 */
import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { PlayerAnimationController } from '../animation/PlayerAnimationController.js';
import { feedback } from '../core/FeedbackEvents.js';

export interface EquippedWeaponComponentOptions extends ENGINE.SceneNodeOptions {
  modelUrl?: string;
  hostMeshName?: string;
  socketName?: string;
  boneName?: string;
  socketOffset?: THREE.Vector3;
  socketRotation?: THREE.Euler;
  socketScale?: THREE.Vector3;
  localOffset?: THREE.Vector3;
  localRotation?: THREE.Euler;
  localScale?: THREE.Vector3;
}

@ENGINE.GameClass()
export class EquippedWeaponComponent extends ENGINE.SceneNode {
  @ENGINE.property({ type: 'modelPath', category: 'Weapon', description: 'Weapon GLB path (@project / @engine).' })
  public modelUrl = '@project/assets/models/Sword.glb';

  @ENGINE.property({ type: 'string', category: 'Weapon', description: 'Name of the host ModelMeshComponent to socket onto.' })
  public hostMeshName = 'PlayerVisual';

  @ENGINE.property({ type: 'string', category: 'Socket', description: 'Logical socket name created on the host mesh.' })
  public socketName = 'RightHand';

  @ENGINE.property({ type: 'string', category: 'Socket', description: 'Skeleton bone to bind the socket to (Mixamo: mixamorigRightHand).' })
  public boneName = 'mixamorigRightHand';

  @ENGINE.property({ type: 'vector3', category: 'Socket', description: 'Socket offset relative to the bone.' })
  public socketOffset = new THREE.Vector3(-0.37, -0.16, 0.06);

  @ENGINE.property({ type: 'euler', category: 'Socket', description: 'Socket rotation relative to the bone.' })
  public socketRotation = new THREE.Euler(0, 0, -1.047198);

  @ENGINE.property({ type: 'vector3', category: 'Socket', description: 'Socket scale relative to the bone.' })
  public socketScale = new THREE.Vector3(2, 2, 2);

  @ENGINE.property({ type: 'vector3', category: 'Mesh', description: 'Extra local position of the weapon under the socket.' })
  public localOffset = new THREE.Vector3(0, 0, 0);

  @ENGINE.property({ type: 'euler', category: 'Mesh', description: 'Extra local rotation of the weapon under the socket.' })
  public localRotation = new THREE.Euler(0, 0, 0);

  @ENGINE.property({ type: 'vector3', category: 'Mesh', description: 'Extra local scale of the weapon under the socket.' })
  public localScale = new THREE.Vector3(1, 1, 1);

  @ENGINE.property({ type: 'boolean', category: 'Weapon', description: 'Play the attack graph state when attackStart feedback fires.' })
  public driveAttackAnimation = true;

  /** Prefab spawn skips initialize(); declare on the class so Play keeps ticking grip pose. */
  protected override canEverTick = true;

  private host: ENGINE.ModelMeshNode | null = null;
  private weaponMesh: ENGINE.ModelMeshNode | null = null;
  /** Driven by invuln blink / death. */
  private renderVisible = true;
  private animController: PlayerAnimationController | null = null;
  private boundHostSockets = false;

  private readonly onFeedback = (event: string, _payload: unknown): void => {
    if (event === 'attackCancel') {
      this.animController?.cancelAttack();
      return;
    }
    if (event !== 'attackStart') return;
    if (this.driveAttackAnimation) {
      this.animController?.playAttack();
    }
  };

  private readonly onHostSocketsChanged = (): void => {
    this.ensureWeaponOwnedBySelf();
    this.applyAttachmentTransforms();
  };

  public override initialize(options?: EquippedWeaponComponentOptions): void {
    super.initialize(options);
    if (options?.modelUrl !== undefined) this.modelUrl = options.modelUrl;
    if (options?.hostMeshName !== undefined) this.hostMeshName = options.hostMeshName;
    if (options?.socketName !== undefined) this.socketName = options.socketName;
    if (options?.boneName !== undefined) this.boneName = options.boneName;
    if (options?.socketOffset) this.socketOffset.copy(options.socketOffset);
    if (options?.socketRotation) this.socketRotation.copy(options.socketRotation);
    if (options?.socketScale) this.socketScale.copy(options.socketScale);
    if (options?.localOffset) this.localOffset.copy(options.localOffset);
    if (options?.localRotation) this.localRotation.copy(options.localRotation);
    if (options?.localScale) this.localScale.copy(options.localScale);

  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) {
      return false;
    }
    this.setup();
    feedback.onEvent.add(this.onFeedback);
    return true;
  }

  public override endPlay(): boolean {
    if (!super.endPlay()) {
      return false;
    }
    feedback.onEvent.remove(this.onFeedback);
    this.unbindHostSockets();
    // Keep the mesh owned by this component (never leave it on a discarded socket Object3D).
    this.ensureWeaponOwnedBySelf();
    return true;
  }

  public override onEditorAddToWorld(): void {
    super.onEditorAddToWorld();
    this.setup();
  }

  public override onEditorRemoveFromWorld(): void {
    this.unbindHostSockets();
    super.onEditorRemoveFromWorld();
  }

  public override onEditorPropertyChanged(path: string, value: unknown, result: ENGINE.EditorPropertyChangedResult): void {
    super.onEditorPropertyChanged(path, value, result);

    if (path === 'modelUrl' && this.weaponMesh && typeof value === 'string') {
      void this.weaponMesh.loadModel(ENGINE.AssetPath.fromString(value));
    }

    if (path === 'hostMeshName' || path === 'socketName' || path === 'boneName') {
      if (path === 'hostMeshName') {
        this.unbindHostSockets();
        this.host = null;
      }
      this.setup();
      return;
    }

    if (
      path === 'socketOffset'
      || path === 'socketRotation'
      || path === 'socketScale'
      || path === 'localOffset'
      || path === 'localRotation'
      || path === 'localScale'
    ) {
      this.syncSocketDefFromProperties();
      this.applyAttachmentTransforms();
    }
  }

  public override tickInEditor(_deltaTime: number): void {
    super.tickInEditor(_deltaTime);
    // Prefab/scene editor: keep trying until the mannequin finishes loading and sockets exist.
    this.setup();
    this.applyAttachmentTransforms();
  }

  public override tickPostPhysics(_deltaTime: number): void {
    super.tickPostPhysics(_deltaTime);
    // Live Inspector tweaks during Play (pose itself is driven by skeleton parenting).
    this.applyAttachmentTransforms();
  }

  /** Bind the animation controller that should receive playAttack() calls. */
  public setAnimationController(controller: PlayerAnimationController | null): void {
    this.animController = controller;
  }

  public getWeaponMesh(): ENGINE.ModelMeshNode | null {
    return this.weaponMesh;
  }

  /** Show/hide the weapon mesh (used for invuln blink alongside the body). */
  public setRenderVisible(visible: boolean): void {
    this.renderVisible = visible;
    if (this.weaponMesh) this.weaponMesh.visible = visible;
  }

  private setup(): void {
    this.resolveHost();
    this.ensureWeaponMesh();
    this.stripStaleSlashVfx();
    this.bindHostSockets();
    this.upsertHostSocket();
    // Keep the ModelMeshNode under this component — parenting SceneNodes under bone sockets
    // during Play ends/restarts play state and fails SceneNode beginPlay/endPlay ensures.
    this.ensureWeaponOwnedBySelf();
    this.applyAttachmentTransforms();
  }

  private resolveHost(): void {
    if (this.host) return;
    const root = this.getRoot();
    if (!root) return;

    const named = root.getNodes(ENGINE.ModelMeshNode).find((m) => m.name === this.hostMeshName);
    if (!named) {
      console.warn(`EquippedWeaponComponent: host mesh '${this.hostMeshName}' not found on root.`);
      return;
    }
    this.host = named;
  }

  private bindHostSockets(): void {
    if (!this.host || this.boundHostSockets) return;
    this.host.onSocketsChanged.add(this.onHostSocketsChanged);
    this.boundHostSockets = true;
  }

  private unbindHostSockets(): void {
    if (!this.host || !this.boundHostSockets) return;
    this.host.onSocketsChanged.remove(this.onHostSocketsChanged);
    this.boundHostSockets = false;
  }

  private ensureWeaponMesh(): void {
    if (this.weaponMesh) return;
    const root = this.getRoot();
    if (!root) return;

    // Prefab may still nest the mesh under this component; adopt it before pose sync.
    const existing = this.children.find((child): child is ENGINE.ModelMeshNode => child instanceof ENGINE.ModelMeshNode);
    if (existing) {
      this.weaponMesh = existing;
    } else {
      this.weaponMesh = ENGINE.ModelMeshNode.create({
        name: `${this.name || 'Weapon'}_Mesh`,
        modelUrl: this.modelUrl,
        physicsOptions: { enabled: false },
        castShadow: true,
      });
      this.weaponMesh.setTransient(true);
      this.add(this.weaponMesh);
    }

    if (this.isEditor || root.getWorld()?.isEditorWorld) {
      this.weaponMesh.onEditorAddToWorld();
    }
  }

  /** Drop leftover blade-trail VFX children from older prefabs/scenes. */
  private stripStaleSlashVfx(): void {
    if (!this.weaponMesh) return;
    for (const child of [...this.weaponMesh.children]) {
      if (child instanceof ENGINE.VFXNode) {
        child.removeFromParent();
      }
    }
  }

  /** Ensure the host has a socket def; rebuild when missing so we can follow it. */
  private upsertHostSocket(): void {
    if (!this.host) return;

    const sockets = this.host.sockets ?? [];
    let def = sockets.find((s) => s.name === this.socketName);
    let needsRebuild = false;

    if (!def) {
      def = {
        name: this.socketName,
        boneName: this.boneName,
        offsetLocation: this.socketOffset.clone(),
        offsetRotation: this.socketRotation.clone(),
        offsetScale: this.socketScale.clone(),
      } as typeof sockets[number];
      sockets.push(def);
      this.host.sockets = sockets;
      needsRebuild = true;
    } else {
      this.syncSocketDefFromProperties();
      if (def.boneName !== this.boneName) {
        def.boneName = this.boneName;
        needsRebuild = true;
      }
    }

    if (this.host.isModelLoaded() && (needsRebuild || !this.host.getSocket(this.socketName))) {
      this.host.rebuildSockets();
    }
  }

  private syncSocketDefFromProperties(): void {
    if (!this.host) return;
    const def = this.host.sockets?.find((s) => s.name === this.socketName);
    if (!def) return;
    def.boneName = this.boneName;
    def.offsetLocation.copy(this.socketOffset);
    def.offsetRotation.copy(this.socketRotation);
    def.offsetScale.copy(this.socketScale);
  }

  /**
   * Pull the weapon mesh back under this component if a prefab/socket still parents it elsewhere.
   * Safe while NotStarted; while Playing, repairs PlayState after the engine's add/remove cycle.
   */
  private ensureWeaponOwnedBySelf(): void {
    if (!this.weaponMesh || this.weaponMesh.parent === this) return;

    const rootPlaying = this.getRoot()?.isPlaying() === true;
    this.add(this.weaponMesh);

    // Object3D.add ends play on remove, then beginPlay fails because Ended !== NotStarted.
    if (rootPlaying && !this.weaponMesh.isPlaying()) {
      this.reenterPlay(this.weaponMesh);
    }
  }

  private reenterPlay(node: ENGINE.SceneNode): void {
    if (node.isPlaying()) {
      node.endPlay();
    }
    const reset = (obj: THREE.Object3D): void => {
      if (obj instanceof ENGINE.SceneNode && obj.isPlayEnded()) {
        obj.resetPlayStateForWorldTransition();
      }
      for (const child of obj.children) {
        reset(child);
      }
    };
    reset(node);
    node.beginPlay();
  }

  /**
   * Follow the live hand socket in world space while keeping the ModelMeshNode under this component.
   * Grip: socket* properties live on the bone socket; local* on the weapon relative to the socket.
   */
  private applyAttachmentTransforms(): void {
    if (!this.weaponMesh) return;

    this.ensureWeaponOwnedBySelf();

    const socket = this.host?.getSocket(this.socketName) ?? null;
    if (socket) {
      socket.position.copy(this.socketOffset);
      socket.rotation.copy(this.socketRotation);
      socket.scale.copy(this.socketScale);
      // Ancestors via updateWorldMatrix, then the socket via updateMatrixWorld — ModelMeshNode
      // overrides socket.updateMatrixWorld to strip Mixamo bone scale. updateWorldMatrix on the
      // socket itself bypasses that override and collapses the weapon to near-zero scale.
      socket.parent?.updateWorldMatrix(true, false);
      socket.updateMatrixWorld(true);

      const desiredWorld = new THREE.Matrix4()
        .copy(socket.matrixWorld)
        .multiply(
          new THREE.Matrix4().compose(
            this.localOffset,
            new THREE.Quaternion().setFromEuler(this.localRotation),
            this.localScale,
          ),
        );

      this.updateWorldMatrix(true, false);
      const localMat = new THREE.Matrix4().copy(this.matrixWorld).invert().multiply(desiredWorld);
      localMat.decompose(this.weaponMesh.position, this.weaponMesh.quaternion, this.weaponMesh.scale);
    } else {
      // Model / sockets not ready — park at local grip offsets under this component.
      this.weaponMesh.position.copy(this.localOffset);
      this.weaponMesh.rotation.copy(this.localRotation);
      this.weaponMesh.scale.copy(this.localScale);
    }

    this.weaponMesh.visible = this.renderVisible;
  }

  public override getEditorClassIcon(): string | null {
    return 'Icon_Weapon';
  }
}
