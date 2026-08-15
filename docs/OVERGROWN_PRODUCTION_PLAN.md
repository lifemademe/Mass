# Mass — Overgrown Production Plan

Last updated: 2026-08-15  
Target: The Sandbox Beta Creators Game Jam — Desktop  
Submission deadline: 2026-09-11

## Product target

Mass is a movement-first atmospheric platform game about a living slime whose body is both character and resource. The finished slice should feel like a hand-painted, overgrown greenhouse laboratory: readable silhouettes, mossy masonry, large graphic foliage, teal depth, biological green light, aged brass, muted violet, and restrained warning red.

The current gameplay loop remains authoritative:

1. Move through the overgrown laboratory.
2. Stretch and swing from organic growths.
3. Absorb biomass and increase Mass.
4. Split to pass obstacles or leave controlled biomass behind.
5. Activate routes and awaken dormant growths.
6. Sense and reunite with shed biomass.
7. Reach exits with the required restored mass.

Do not add enemies, combat, currencies, quests, multiplayer, or unrelated mechanics during this production pass. Preserve collision geometry, traversal routes, mass conservation, and swing balance unless a separate playtest explicitly identifies a gameplay problem.

## Current baseline

The following systems exist, but items marked “review” are not considered visually signed off:

- Two playable stages with a complete Stage 1-to-Stage 2 flow.
- Stretch, swing, release focus-time, momentum challenges, checkpoints, fall recovery, biomass, splitting, sense, reunion, mass gates, switches, goals, restart, and completion logic.
- Main menu, controls panel, black boot screen, rotating biohazard treatment, and three-card intro sequence.
- Initial Stage 1 and Stage 2 parallax systems and generated illustrated backgrounds.
- Initial atmosphere, lighting, Mass glow, slime deformation, horizontal face treatment, particles, and feedback.
- Initial illustrated platform, wall, masonry, and tintable growth-bush assets.
- Styled gameplay HUD and objective prompts.
- Clean TypeScript lint/build and successful Genesys editor build as of this plan.

## Unfinished work carried forward from the previous plan

These items remain open even where a first implementation exists:

- The loading icon is an inline illustrated SVG, not a final generated UI-family asset.
- Intro skipping needs a final input/lifecycle review, including LMB and immediate valid-state behavior.
- The new `Background1.png`, `Background2.png`, and `Background_element.png` assets are not yet integrated into the production layer stack.
- Stage 1 camera composition still needs to match the approved mockup and remove excessive space beneath Mass.
- Parallax strength, coverage, aspect handling, and seams have not been verified across every valid camera position.
- Stage 2 needs the same art quality, modular platform coverage, growth treatment, and parallax discipline as Stage 1.
- Platform artwork is still an early façade treatment rather than a complete modular top/edge/corner/wall/underside kit.
- Growth bushes need a single dependable render path and clearly readable available, aimed, invalid, and dormant states.
- Environmental dressing is sparse: grass, fungi, roots, rubble, laboratory props, hanging vegetation, and foreground silhouettes still need a deliberate density pass.
- Lighting has a strong starting palette but has not been reviewed across all Stage 2 height bands or against every gameplay target.
- Slime deformation is improved but still needs a final “body becomes the stretch” pass and release/recovery inspection.
- HUD/menu styling exists, but the full coherent UI asset family, small-window behavior, keyboard focus, and gameplay-state reduction are not signed off.
- Cold start, menu, intro, intro skip, stage transition, checkpoints, fall recovery, completion, restart, and every critical route still require a complete runtime QA matrix.
- Audio/ambience and final submission capture/presentation remain outstanding.

## Approved Stage 1 composition

The supplied mockup is the target framing for the first playable area.

- Mass should normally sit in the lower third of the viewport, approximately 72–78% down the visible game area.
- Only a narrow readable strip should exist below the current walkable surface; avoid a large empty void beneath the player.
- Preserve useful space above Mass for growth targeting and swing planning.
- Use a smooth camera dead zone so normal rolling does not create constant vertical motion.
- When tethered, blend toward the Mass–growth midpoint and add restrained velocity/look-ahead so high targets remain visible.
- Return smoothly to the grounded framing after release or landing; never snap.
- Camera framing must not reveal background edges or platform-art seams.
- Stage 2 may use a more centered vertical composition, but it must follow the same rules for target visibility and wasted space.

### New background assignment

- `@project/assets/textures/Background1.png`: distant/far layer; lowest contrast and slowest motion.
- `@project/assets/textures/Background2.png`: structural midground; moderate motion and contrast.
- `@project/assets/textures/Background_element.png`: nearer framing/prop layer; strongest motion, sparse enough to preserve aiming.

The older generated layers remain available as alternates or extension panels. Select layers by visual fit after direct inspection; do not stack every image simply because it exists.

### Surface and growth construction

- Use the generated horizontal platform as the illustrated top/cap.
- Tile or segment the masonry texture beneath the cap to fill the collision block without stretching the cap artwork.
- Add dedicated left/right ends, corners, undersides, narrow ledges, and tall-wall treatments.
- Keep collider ownership separate from visual artwork.
- Treat the bush PNG as the visible growth, with the attachment point centered in its open pocket.
- Available growth: biological green rim/highlight.
- Aimed and valid: brighter green pulse with clear cursor response.
- Locked/dormant: warning-red rim/highlight.
- Invalid due to range or aim: restrained red feedback without looking permanently locked.
- The bush should remain a world-space gameplay object, not a parallax decoration.

## Milestone 1 — Camera and background composition

- [ ] `[Code]` Add stage-aware camera framing settings: grounded vertical offset, tether midpoint blend, look-ahead, dead zone, and smooth recovery.
- [ ] `[Code]` Keep camera framing independent of gameplay physics.
- [ ] `[Asset]` Inspect dimensions, alpha, edge continuity, and intended roles of the three new background textures.
- [ ] `[Code]` Replace the current Stage 1 layer selection with the approved far/mid/near composition.
- [ ] `[Code]` Add overscan, aspect-aware cover/crop, and coordinated extension panels where one image cannot cover the complete route.
- [ ] `[Verify]` Compare start, pit, biomass, gate, reunion, high-growth, and exit framing against the approved mockup.
- [ ] `[Verify]` Confirm no upside-down textures, black seams, uncovered edges, or excessive empty space beneath Mass.

Acceptance gate: the starting area reads like the mockup, Mass remains in the intended lower-third framing while grounded, and every Stage 1 growth remains targetable during traversal.

## Milestone 2 — Modular gameplay-surface kit

- [ ] `[Asset]` Derive or generate compatible platform top, repeating underside, left/right end, inside/outside corner, narrow ledge, and vertical wall modules.
- [ ] `[Code]` Build a reusable surface compositor that sizes/tile-fills art from collision-block dimensions without changing collision.
- [ ] `[Code]` Prevent cap stretching on long floors and prevent obvious repetition in tiled undersides.
- [ ] `[Code]` Ensure platform art cannot cover Mass except for intentional foreground lip overlap at the feet.
- [ ] `[Code]` Establish a dependable bush-growth node with dynamic green/red state styling.
- [ ] `[Verify]` Inspect every Stage 1 floor, wall, header, ledge, switch, gate, and goal.

Acceptance gate: no prototype-black collision block is visually exposed in Stage 1, walkable edges are unmistakable, and every growth state can be identified without reading UI text.

## Milestone 3 — Stage 1 environmental-art pass

- [ ] `[Asset]` Create/reuse a coordinated set of grass tufts, mushrooms, ferns, roots, stones, moss drips, brass brackets, pipes, bottles, and broken greenhouse details.
- [ ] `[Code]` Add reusable non-colliding decoration placement helpers with consistent depth/render ordering.
- [ ] `[MCP]` Place hero decorations around growths, transitions, switches, gates, and the exit while preserving authored gameplay state.
- [ ] `[MCP]` Add sparse foreground silhouettes that frame the screen without covering aim paths or UI.
- [ ] `[Code]` Add subtle ambient motion to selected grass, spores, hanging roots, and fungi without creating visual noise.
- [ ] `[Verify]` Review density at every Stage 1 gameplay beat and keep central traversal corridors quieter than edges.

Acceptance gate: Stage 1 feels inhabited and overgrown in still screenshots, yet Mass, platforms, growths, biomass, switches, gates, and goals remain the first readable elements.

## Milestone 4 — Stage 2 visual parity

- [ ] `[Code]` Apply aspect-aware vertical parallax using coordinated panels rather than one stretched background.
- [ ] `[Code]` Cover Stage 2 floor, shaft boundaries, rest ledges, momentum wall, crown, and goal with the modular surface kit.
- [ ] `[Code]` Apply growth bushes and state highlights to every active and dormant Stage 2 growth.
- [ ] `[Asset]` Add vertical-specific roots, hanging foliage, wall fungi, greenhouse ribs, distant machinery, and crown framing.
- [ ] `[MCP]` Tune visual density by height band so the ascent develops without obscuring the next catch.
- [ ] `[Verify]` Inspect spawn, first momentum route, switch, all checkpoints, middle chain, upper chain, crown, and final goal.

Acceptance gate: Stage 2 looks like the same world and production quality as Stage 1, has no uncovered shaft edges, and communicates the complete growth route at a glance.

## Milestone 5 — Slime, tether, lighting, and movement readability

- [ ] `[Code]` Refine the body-to-neck transition so the visible slime mass clearly becomes the stretched strand.
- [ ] `[Code]` Preserve a tapered attachment, restrained wobble, horizontal face, and smooth recoil without adding release impulse.
- [ ] `[Code]` Reset deformation correctly on reattachment, fall recovery, restart, stage transition, and completion.
- [ ] `[Code]` Tune Mass glow, anchor highlights, dormant warning red, goal violet, machinery amber, and ambient teal as one hierarchy.
- [ ] `[MCP]` Tune scene/editor light instances only where the authored scene owns their final placement.
- [ ] `[Verify]` Check readability at rest, during a 360-degree orbit, release focus-time, rapid reattachment, and recovery.

Acceptance gate: the stretch looks organic rather than rope-like, the face remains readable, and lighting identifies gameplay state without washing the whole scene green.

## Milestone 6 — UI, boot, intro, and completion polish

- [ ] `[Asset]` Finish a coherent UI asset family: portrait frame, mass bar, objective/hint frames, buttons, separators, ornaments, and final biohazard icon.
- [ ] `[Code]` Retain only information relevant to the current mechanic and phase.
- [ ] `[Code]` Verify loading remains tied to initialization promises and behaves correctly on restart/reload.
- [ ] `[Code]` Verify Play starts the intro exactly once per fresh run and all supported skip inputs end in a valid gameplay state.
- [ ] `[Code]` Add or refine the completion presentation and clear restart/menu affordances.
- [ ] `[Verify]` Test keyboard/mouse focus, common desktop aspect ratios, small windows, safe margins, and HUD overlap.

Acceptance gate: menu, boot, intro, HUD, completion, and restart look like one product and never block or contradict gameplay state.

## Milestone 7 — Audio and game-feel pass

- [ ] `[Asset]` Add a restrained greenhouse-laboratory ambience bed.
- [ ] `[Asset]` Add distinct feedback for attach, tension, release, high-momentum orbit, biomass, split, reunion, switch, dormant denial, checkpoint, fall recovery, stage transition, and completion.
- [ ] `[Code]` Scale or layer feedback from existing gameplay events rather than duplicating game-state logic.
- [ ] `[Verify]` Balance sound so repeated swinging remains pleasant and critical state cues remain clear.

Acceptance gate: the game communicates actions with sound even when the HUD is ignored, without becoming tiring during repeated attempts.

## Milestone 8 — Full runtime QA and submission preparation

- [ ] `[Verify]` Cold start and real loading completion.
- [ ] `[Verify]` Main menu, controls, intro, every skip path, and gameplay activation.
- [ ] `[Verify]` Complete Stage 1 using the intended loop, including split, sense, reunion, high growth, and exit.
- [ ] `[Verify]` Complete Stage 2 through switch, checkpoints, growth chain, crown, and goal.
- [ ] `[Verify]` Test missed swings, every major pit, edge recovery, restart, stage transition, and completion.
- [ ] `[Verify]` Inspect every valid camera position for seams, exposed collision meshes, parallax edges, foreground obstruction, and UI overlap.
- [ ] `[Verify]` Record frame-rate behavior and remove avoidable transparent overdraw or excessive lights.
- [ ] `[Verify]` Run `pnpm lint`, `pnpm build`, and Genesys `buildProject`; confirm no relevant runtime console errors.
- [ ] `[Asset]` Capture final screenshots/video and prepare the desktop-platform submission materials.
- [ ] `[Verify]` Confirm current official jam eligibility and submission requirements before final upload.

Acceptance gate: two clean end-to-end completions, no progression blockers, no visible art seams in critical routes, stable performance, and submission materials ready before 2026-09-09 to preserve a two-day buffer.

## Production schedule

- 2026-08-16 to 2026-08-18: Milestone 1 — camera and backgrounds.
- 2026-08-19 to 2026-08-21: Milestone 2 — modular surfaces and growths.
- 2026-08-22 to 2026-08-25: Milestone 3 — Stage 1 dressing.
- 2026-08-26 to 2026-08-29: Milestone 4 — Stage 2 parity.
- 2026-08-30 to 2026-09-01: Milestone 5 — slime and lighting.
- 2026-09-02 to 2026-09-03: Milestone 6 — UI and flow.
- 2026-09-04 to 2026-09-05: Milestone 7 — audio and feel.
- 2026-09-06 to 2026-09-09: Milestone 8 — QA and submission capture.
- 2026-09-10 to 2026-09-11: contingency only.

## Working rules

- Use TypeScript for reusable runtime behavior and MCP for persistent editor/scene state.
- Query editor readiness before mutations and save/re-query scene changes.
- Never manually edit `src/auto-imports.ts`; allow the build pipeline to maintain it.
- Keep generated assets in stable `@project/assets/...` paths and do not ship rejected drafts.
- Use actual transparent modular art rather than flattened screenshots for gameplay surfaces and growths.
- Do not spend Spriterrific credits until a use case materially benefits the shipped game and the art kit is approved.
- After source changes, run `pnpm lint`, `pnpm build`, and Genesys `action_build(action="buildProject")`.
- Require a short human playtest after each acceptance gate before expanding the next milestone.

## Final definition of done

- Camera framing matches the approved composition and wastes little space below grounded Mass.
- Both stages use intentional, seamless multi-layer parallax.
- Every collision surface is covered by coherent illustrated art.
- Growth bushes clearly communicate available and dormant states.
- Environmental decoration makes scenes rich without harming aiming or traversal readability.
- Mass glows and deforms organically while its face remains readable.
- Boot, menu, intro, HUD, completion, and restart form one coherent UI language.
- Both stages can be completed reliably from a cold start.
- Fall recovery, checkpoints, restart, stage transition, and completion are robust.
- Desktop performance is stable and no relevant runtime errors remain.
- The final build, screenshots/video, platform declaration, and jam submission are ready before the deadline.
