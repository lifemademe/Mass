import * as ENGINE from '@gnsx/genesys.js';

export type MassRecordState = 'controlled' | 'detached';

export interface MassRecord {
  id: string;
  originalMass: number;
  consumedMass: number;
  state: MassRecordState;
  node: ENGINE.SceneNode | null;
}

export interface MassSnapshot {
  controlledMass: number;
  ownedMass: number;
  separatedMass: number;
  detachedCount: number;
  originalMass: number;
  consumedMass: number;
}

const EPSILON = 0.001;

export class MassLedger {
  public readonly onMassChanged = new ENGINE.Delegate<[MassSnapshot]>();

  private readonly records = new Map<string, MassRecord>();
  private controlledId = 'controlled';
  private nextDetachedId = 1;
  private expectedOriginalMass = 0;
  private expectedConsumedMass = 0;

  public reset(originalMass: number, controlledNode: ENGINE.SceneNode): MassRecord {
    this.records.clear();
    this.controlledId = 'controlled';
    this.nextDetachedId = 1;
    this.expectedOriginalMass = originalMass;
    this.expectedConsumedMass = 0;
    const record: MassRecord = {
      id: this.controlledId,
      originalMass,
      consumedMass: 0,
      state: 'controlled',
      node: controlledNode,
    };
    this.records.set(record.id, record);
    this.emitChanged();
    return record;
  }

  public getControlled(): MassRecord | null {
    return this.records.get(this.controlledId) ?? null;
  }

  public getDetached(): MassRecord[] {
    return [...this.records.values()].filter((record) => record.state === 'detached');
  }

  public getRecord(id: string): MassRecord | null {
    return this.records.get(id) ?? null;
  }

  public setNode(id: string, node: ENGINE.SceneNode | null): void {
    const record = this.records.get(id);
    if (record) record.node = node;
  }

  public split(recordId: string, amount: number): MassRecord | null {
    const source = this.records.get(recordId);
    if (!source || source.state !== 'controlled') return null;
    const total = source.originalMass + source.consumedMass;
    if (amount <= 0 || amount >= total) return null;

    const ratio = amount / total;
    const detached: MassRecord = {
      id: `detached-${this.nextDetachedId++}`,
      originalMass: source.originalMass * ratio,
      consumedMass: source.consumedMass * ratio,
      state: 'detached',
      node: null,
    };
    source.originalMass -= detached.originalMass;
    source.consumedMass -= detached.consumedMass;
    this.records.set(detached.id, detached);
    this.emitChanged();
    return detached;
  }

  public consume(recordId: string, amount: number): boolean {
    const record = this.records.get(recordId);
    if (!record || amount <= 0) return false;
    record.consumedMass += amount;
    this.expectedConsumedMass += amount;
    this.emitChanged();
    return true;
  }

  public reunite(controlledId: string, detachedId: string): boolean {
    const controlled = this.records.get(controlledId);
    const detached = this.records.get(detachedId);
    if (!controlled || !detached || controlled.state !== 'controlled' || detached.state !== 'detached') {
      return false;
    }
    controlled.originalMass += detached.originalMass;
    controlled.consumedMass += detached.consumedMass;
    this.records.delete(detachedId);
    this.emitChanged();
    return true;
  }

  public snapshot(): MassSnapshot {
    const controlled = this.getControlled();
    let ownedMass = 0;
    let originalMass = 0;
    let consumedMass = 0;
    for (const record of this.records.values()) {
      ownedMass += record.originalMass + record.consumedMass;
      originalMass += record.originalMass;
      consumedMass += record.consumedMass;
    }
    const controlledMass = controlled ? controlled.originalMass + controlled.consumedMass : 0;
    return {
      controlledMass,
      ownedMass,
      separatedMass: ownedMass - controlledMass,
      detachedCount: this.getDetached().length,
      originalMass,
      consumedMass,
    };
  }

  private emitChanged(): void {
    const snapshot = this.snapshot();
    if (Math.abs(snapshot.originalMass - this.expectedOriginalMass) > EPSILON
      || Math.abs(snapshot.consumedMass - this.expectedConsumedMass) > EPSILON) {
      throw new Error('MassLedger conservation invariant failed.');
    }
    this.onMassChanged.invoke(snapshot);
  }
}
