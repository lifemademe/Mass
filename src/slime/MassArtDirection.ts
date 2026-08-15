import * as ENGINE from '@gnsx/genesys.js';

/**
 * Production art bible distilled from the approved Mass reference boards.
 * Keep runtime art within this palette and use broad illustrated shapes rather
 * than photographic texture, realistic PBR, or high-frequency background noise.
 */
export const MASS_ART_BIBLE = {
  medium: 'hand-painted illustrated 2D',
  shapeLanguage: 'chunky irregular masonry, bold curling roots, large graphic foliage',
  rendering: 'restrained outlines, broad painted shading, deliberate highlights',
  readability: 'strong silhouettes with quiet low-detail gameplay corridors',
  avoid: 'photorealism, realistic depth of field, tiny noisy detail, fake gameplay objects',
  palette: {
    void: 0x020605,
    deepTeal: 0x071714,
    greenhouseTeal: 0x173b36,
    moss: 0x5f7836,
    bioGreen: 0xb8e35c,
    brass: 0xa68a49,
    violet: 0x8f72ba,
    amber: 0xd89a43,
    warningRed: 0xb83c3d,
  },
} as const;

export const MASS_VISUAL_ASSETS = {
  stage1Far: '@project/assets/textures/overgrown/stage1-far-greenhouse.png',
  stage1Mid: '@project/assets/textures/overgrown/stage1-mid-framing.png',
  stage1Foreground: '@project/assets/textures/overgrown/stage1-foreground-framing.png',
  stage2Far: '@project/assets/textures/overgrown/stage2-far-shaft.png',
  stage2Mid: '@project/assets/textures/overgrown/stage2-mid-framing.png',
  stage2Foreground: '@project/assets/textures/overgrown/stage2-foreground-framing.png',
  masonryTile: '@project/assets/textures/overgrown/moss-lab-masonry-tile.png',
  growthBush: '@project/assets/textures/overgrown/growth-bush-tintable.png',
  horizontalPlatform: '@project/assets/textures/overgrown/platform-facade-horizontal.png',
  verticalWall: '@project/assets/textures/overgrown/wall-facade-vertical.png',
} as const;

export async function preloadMassVisualAssets(): Promise<void> {
  await Promise.all(Object.values(MASS_VISUAL_ASSETS).map(async (path) => {
    await ENGINE.resourceManager.loadTexture(ENGINE.AssetPath.fromString(path));
  }));
}
