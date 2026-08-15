const MINIMUM_BOOT_MS = 650;

class MassBootScreen {
  private readonly element: HTMLDivElement;
  private shownAt = performance.now();

  public constructor(private readonly container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'mass-boot-screen';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-label', 'Loading Mass');
    this.element.innerHTML = `
      <style>
        .mass-boot-screen{position:absolute;inset:0;z-index:100000;background:#000;opacity:1;pointer-events:auto;transition:opacity .48s ease;overflow:hidden}
        .mass-boot-screen[data-leaving="true"]{opacity:0;pointer-events:none}
        .mass-boot-mark{position:absolute;right:clamp(22px,3.2vw,52px);bottom:clamp(22px,3.2vw,48px);width:clamp(42px,4vw,64px);aspect-ratio:1;filter:drop-shadow(0 0 10px rgba(173,224,83,.38));animation:mass-boot-spin 2.2s linear infinite}
        .mass-boot-mark svg{width:100%;height:100%;overflow:visible}
        .mass-boot-ring{fill:none;stroke:#9b874c;stroke-width:2.2;stroke-dasharray:5 4;opacity:.72}
        .mass-boot-glyph{fill:#b7d95a;stroke:#574d2c;stroke-width:1.7;paint-order:stroke fill}
        .mass-boot-core{fill:#07120c;stroke:#c6e86b;stroke-width:1.8}
        @keyframes mass-boot-spin{to{transform:rotate(360deg)}}
        @media (prefers-reduced-motion:reduce){.mass-boot-mark{animation-duration:5s}}
      </style>
      <div class="mass-boot-mark" aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <circle class="mass-boot-ring" cx="50" cy="50" r="45"/>
          <path class="mass-boot-glyph" d="M50 43c-7-13-4-27 4-36 15 2 25 13 27 27-9-3-19 0-25 10l-6-1Zm7 11c15-1 26 8 31 19-9 12-24 16-37 10 8-6 11-15 8-27l-2-2Zm-14 2c-7 13-20 18-32 16-6-14-1-28 10-36 1 10 8 18 19 20h3Z"/>
          <circle class="mass-boot-core" cx="50" cy="51" r="10"/>
        </svg>
      </div>`;
    this.show();
  }

  public show(): void {
    this.shownAt = performance.now();
    this.element.dataset.leaving = 'false';
    if (!this.element.isConnected) this.container.appendChild(this.element);
  }

  public async hideWhenReady(): Promise<void> {
    const remaining = Math.max(0, MINIMUM_BOOT_MS - (performance.now() - this.shownAt));
    if (remaining > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
    this.element.dataset.leaving = 'true';
    await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
    this.element.remove();
  }
}

let activeBootScreen: MassBootScreen | null = null;

export function initializeMassBootScreen(container: HTMLElement): void {
  activeBootScreen = new MassBootScreen(container);
}

export function showMassBootScreen(): void {
  activeBootScreen?.show();
}

export async function hideMassBootScreenWhenReady(): Promise<void> {
  await activeBootScreen?.hideWhenReady();
}
