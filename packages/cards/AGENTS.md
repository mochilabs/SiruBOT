# cards agent instructions (`packages/cards`)

Repo-wide rules live in the root `AGENTS.md`. Paths are relative to `packages/cards/src/`.

- Runtime-independent pieces of the satori cards: element helpers (`h`, `img`), design tokens (`tokens.ts`), pure artwork helpers (`artwork.ts`: letterbox detection, dominant color, color mixing, image header size) and `greetingCard`. data-api renders PNG from these nodes; the dashboard renders SVG from the same nodes.
- **The root export must never import a node-only module** (`node:*`, `Buffer`, resvg, `fs`). The dashboard bundles it. Font file reading, resvg rasterizing, remote image downloads and icon paths stay in data-api `renderers/satori/satoriKit.ts` and are passed in as data (fonts and image data URIs are the caller's job).
- `greetingCard(image, vars)` is a pure function that interprets the contract in `@sirubot/utils/memberGreeting` (1200x675 card, layer x/y in %, sizes in px, center anchor) and `greetingCardDesign` (preset gradients). Import utils through subpaths only. It uses font weights 600 (regular) and 900 (bold) so both runtimes can share the same static subsets. Colored emoji are stripped because satori cannot draw them.
- Changing a layout number in `greetingCard.ts` changes both the Discord image and the dashboard preview. `greetingCard.test.ts` pins the coordinate contract.
- Tests import this package from **source** through the root `vitest.config.ts` alias; apps' typecheck and build use `dist`, so run `yarn typecheck` after changing an export.
