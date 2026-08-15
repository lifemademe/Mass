import * as ENGINE from '@gnsx/genesys.js';

const INTRO_CARDS = [
  { text: '2067', alarm: false },
  { text: 'EMERGENCY ALARM', alarm: true },
  { text: 'Sample M4SS has escaped', alarm: false },
] as const;

export class MassIntroSequence extends ENGINE.BaseUIComponent {
  public static metadata: ENGINE.UIComponentMetadata = {
    displayName: 'Mass Intro Sequence',
    category: 'menu',
    summary: 'Skippable three-card narrative intro.',
    useCases: ['intro', 'title cards'],
    optionsType: 'BaseUIComponentOptions',
    assetPaths: {
      template: '@project/assets/ui/mass-intro.html',
      styles: '@project/assets/ui/mass-intro.css',
    },
  };

  private rootElement: HTMLElement | null = null;
  private cardElement: HTMLElement | null = null;
  private runId = 0;
  private finishRun: (() => void) | null = null;
  private acceptSkipAt = 0;
  private readonly handleSkipKey = (event: KeyboardEvent): void => {
    if (!['Space', 'Enter', 'Escape'].includes(event.code)) return;
    event.preventDefault();
    this.skip();
  };

  protected override getAssetPaths(): { templatePath: string; stylesPath: string } {
    return {
      templatePath: MassIntroSequence.metadata.assetPaths.template,
      stylesPath: MassIntroSequence.metadata.assetPaths.styles,
    };
  }

  protected override getDefaultOptions(): Required<ENGINE.BaseUIComponentOptions> {
    return { position: 'none', visible: false, customClasses: [], customStyles: {} };
  }

  protected override getInitialData(): Record<string, unknown> {
    return {};
  }

  protected override cacheElements(): void {
    if (!this.layout) return;
    this.rootElement = this.layout.querySelector('.mass-intro');
    this.cardElement = this.layout.querySelector('.mass-intro-card');
  }

  public async runSequence(): Promise<void> {
    const id = ++this.runId;
    this.acceptSkipAt = performance.now() + 2000;
    this.show();
    this.rootElement?.setAttribute('data-leaving', 'false');
    window.addEventListener('keydown', this.handleSkipKey);
    return new Promise<void>((resolve) => {
      this.finishRun = resolve;
      void this.runCards(id);
    });
  }

  public skip(): void {
    if (!this.finishRun || performance.now() < this.acceptSkipAt) return;
    this.runId += 1;
    void this.finish(180);
  }

  private async runCards(id: number): Promise<void> {
    for (const card of INTRO_CARDS) {
      if (id !== this.runId) return;
      if (this.cardElement) this.cardElement.textContent = card.text;
      this.rootElement?.setAttribute('data-alarm', String(card.alarm));
      await this.delay(90);
      if (id !== this.runId) return;
      this.cardElement?.setAttribute('data-visible', 'true');
      await this.delay(card.alarm ? 1450 : 1250);
      if (id !== this.runId) return;
      this.cardElement?.setAttribute('data-visible', 'false');
      await this.delay(620);
    }
    if (id === this.runId) await this.finish(560);
  }

  private async finish(fadeDuration: number): Promise<void> {
    window.removeEventListener('keydown', this.handleSkipKey);
    this.cardElement?.setAttribute('data-visible', 'false');
    this.rootElement?.setAttribute('data-leaving', 'true');
    await this.delay(fadeDuration);
    this.hide();
    const resolve = this.finishRun;
    this.finishRun = null;
    resolve?.();
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
  }

  protected override onDestroy(): void {
    window.removeEventListener('keydown', this.handleSkipKey);
    this.runId += 1;
    this.finishRun?.();
    this.finishRun = null;
    this.rootElement = null;
    this.cardElement = null;
  }
}
