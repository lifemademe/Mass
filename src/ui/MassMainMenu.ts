import * as ENGINE from '@gnsx/genesys.js';

export interface MassMainMenuOptions extends ENGINE.BaseUIComponentOptions {
  onPlay?: () => void;
  onQuit?: () => void;
}

export class MassMainMenu extends ENGINE.BaseUIComponent<MassMainMenuOptions> {
  public static metadata: ENGINE.UIComponentMetadata = {
    displayName: 'Mass Main Menu',
    category: 'menu',
    summary: 'Full-screen illustrated main menu for Mass.',
    useCases: ['main menu', 'title screen'],
    optionsType: 'MassMainMenuOptions',
    assetPaths: {
      template: '@project/assets/ui/mass-main-menu.html',
      styles: '@project/assets/ui/mass-main-menu.css',
    },
  };

  private rootElement: HTMLElement | null = null;
  private playSlot: HTMLElement | null = null;
  private controlsSlot: HTMLElement | null = null;
  private quitSlot: HTMLElement | null = null;
  private controlsButton: ENGINE.Button | null = null;
  private controlsOpen = false;

  protected override getAssetPaths(): { templatePath: string; stylesPath: string } {
    return {
      templatePath: MassMainMenu.metadata.assetPaths.template,
      stylesPath: MassMainMenu.metadata.assetPaths.styles,
    };
  }

  protected override getDefaultOptions(): Required<MassMainMenuOptions> {
    return {
      position: 'none',
      visible: true,
      customClasses: [],
      customStyles: {},
      onPlay: () => { /* no-op */ },
      onQuit: () => { /* no-op */ },
    };
  }

  protected override getInitialData(): Record<string, unknown> {
    return {};
  }

  protected override cacheElements(): void {
    if (!this.layout) return;
    this.rootElement = this.layout.querySelector('.mass-main-menu') as HTMLElement | null;
    this.playSlot = this.layout.querySelector('[data-play-slot]') as HTMLElement | null;
    this.controlsSlot = this.layout.querySelector('[data-controls-slot]') as HTMLElement | null;
    this.quitSlot = this.layout.querySelector('[data-quit-slot]') as HTMLElement | null;
  }

  protected override async onInitialize(): Promise<void> {
    if (!this.playSlot || !this.controlsSlot || !this.quitSlot) return;
    await this.mountChild(ENGINE.Button, {
      ...ENGINE.Button.presets.outlineLarge,
      label: 'Play',
      onClick: () => this.options.onPlay(),
    }, this.playSlot);
    this.controlsButton = await this.mountChild(ENGINE.Button, {
      ...ENGINE.Button.presets.ghostLarge,
      label: 'Controls',
      onClick: () => this.toggleControls(),
    }, this.controlsSlot);
    await this.mountChild(ENGINE.Button, {
      ...ENGINE.Button.presets.ghostLarge,
      label: 'Quit',
      onClick: () => this.options.onQuit(),
    }, this.quitSlot);
  }

  public showMainMenu(): void {
    this.controlsOpen = false;
    this.rootElement?.setAttribute('data-controls-open', 'false');
    this.controlsButton?.setLabel('Controls');
    this.show();
  }

  private toggleControls(): void {
    this.controlsOpen = !this.controlsOpen;
    this.rootElement?.setAttribute('data-controls-open', String(this.controlsOpen));
    this.controlsButton?.setLabel(this.controlsOpen ? 'Back' : 'Controls');
  }

  protected override onDestroy(): void {
    this.rootElement = null;
    this.playSlot = null;
    this.controlsSlot = null;
    this.quitSlot = null;
    this.controlsButton = null;
  }
}
