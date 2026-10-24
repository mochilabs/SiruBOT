---
name: dashboard-ui
description: >
  Implementation reference for SiruBOT dashboard visual work (tokens, primitives,
  Discord-style UI, scroll/motion). For any dashboard visual work, load antislop-ui
  first as the filter, then this skill.
---

# Dashboard UI

Routing: any dashboard visual work → load `antislop-ui` first (filter), then this skill. Related: `dashboard-conventions` skill; `apps/dashboard/DESIGN.md` (token tables); `apps/dashboard/MEMO.md` historical — code wins.

## Design tokens

Single source: `apps/dashboard/src/app/globals.css` (Tailwind v4, `@theme inline`, 9 numbered sections — `.dark` overrides propagate via runtime vars). Token utilities only; no hardcoded hex/rgb. shadcn: `components.json` (`style: "base-nova"`), `cn()` in `src/lib/utils.ts`. NEVER install the `cn` npm pkg; NEVER run `shadcn init`; after `shadcn add` fix the cn import and install `@base-ui/react` manually. Full token tables (semantic, `--surface-1/2/3`, Discord `--discord-*`, radius, shadows, status, typography, motion): `apps/dashboard/DESIGN.md` §3 — consume tokens, do not copy values.

- Key consumption rules: accent text = `text-primary-text` (NEVER `text-primary`, too light); solid CTA = `bg-primary-control` + `text-primary-control-text` (`--brand` is source-only); `--card`/`--popover`/`--secondary`/`--muted`/`--input` alias `--surface-*`/`--border` — edit originals only; `bg-discord-embed` only for mock frames; `bg-secondary → hover:bg-surface-3` is the official neutral hover step.
- Controls are borderless: `shadow-control-boundary` (inset 1px `var(--border-strong)`), inputs `border-0 bg-input shadow-control-boundary` + `focus-visible:ring-2 ring-ring`; invalid → `shadow-control-boundary-invalid`. Shadows = elevation only (sm hairline / md card / lg floating / 2xl menu-modal).
- Dark mode: next-themes `attribute="class"`, `defaultTheme="dark"`, `enableSystem={false}` (`src/components/Providers.tsx`); CSS var overrides only, no new `dark:` variants (exception: raw status colors like `text-emerald-600 dark:text-emerald-400`). Toggle via View Transitions API (`navbar.tsx`).
- Radius tokens only: `rounded-control` (0.625rem, buttons/inputs), `rounded-menu` (0.75rem), `rounded-card` (1rem), `rounded-dialog`. No `rounded-lg` in new code; `rounded-full` only badges/chips/status dots/pills.
- Type: `font-sans` = Pretendard → Pretendard JP → Twemoji → system. `text-2xs`=11px, `text-3xs`=8px only. Page title `text-4xl sm:text-5xl font-black tracking-tighter text-foreground truncate` (no gradient); numbers `font-black tabular-nums text-primary-text`; descriptions `text-sm font-medium text-muted-foreground/80`; section labels via `SectionLabel` only.
- Utilities: `transition-control`, `duration-fast/base/slow` (200/300/500ms; numeric durations forbidden), `ease-standard`, `animate-page-in`, `animate-marquee`, `scrollbar-none`. Removed — do not recreate: `glass-panel`, `glass-overlay`, `InteractiveGlow`, `panel`, `text-title-gradient`, `animate-shimmer-sweep`. No blur/transparent/gradient surfaces except dialog/sheet backdrop `bg-black/60 backdrop-blur-sm`; `custom-scrollbar` is an undefined no-op.
- After token changes run `python3 apps/dashboard/scripts/wcag-contrast-audit.py` → `Unexpected failures: 0`. Hardcode exceptions: Discord `#5865F2`, `EmbedPreview`'s `embed.color` (user input), Discord avatar/role colors (`roleColorHex`).

## Primitives / overlays / layout

`apps/dashboard/src/components/`: `ui/` — shadcn base-nova on **`@base-ui/react`** + `cva` (button, card, input, input-group, textarea, label, badge, tabs, avatar, skeleton, slider, switch, select, dialog, sheet, dropdown-menu, command, table, toast); `primitives/` — only empty-state, field, section-label, status-dot; `overlay/` — `Portal` + `usePopoverCoords` (`overlay/portal`), global-command-palette (⌘K, in `app/layout.tsx`); `discord/` — embed-preview, channel-message, permission-list, role-select; `layout`/`data`/`feedback/` — page-header, data-table, stat-card, tag-input, notification; root — container, navbar, footer, error-panel (page chrome). Showcase: `src/app/design/page.tsx` (`/design`).

Compose these; never reinvent same-role components, never write one-off style strings (add variants instead), never overwrite `ui/*` classNames (kills cva) or replace whole shadcn files. Most are `"use client"` + `lucide-react` + framer-motion `m`/`AnimatePresence` (**`m` only, never `motion`**).

- `Button` (`ui/button`): variants `default|primary|secondary|ghost|danger|destructive|outline|link|icon|state-toggle|cta`; sizes `default|sm|md|lg|xs|icon|icon-xs|icon-sm|icon-lg` (md h-9, sm h-8, lg h-10, xs h-6); `loading`, `active` (state-toggle), `icon`, `type` (default "button"). `danger`≡`destructive`; new code uses `danger`. No new variants/primitives.
- Raw `<button>`: classify-then-convert only — action→`Button`, icon→`variant="icon"` (aria-label required), toggle→`state-toggle`; keep raw for selectors/menus (`role="option|combobox|menuitem|radio"`), route links, Discord mocks. No bulk sed. Raw `<input>`: plain text inputs → `Input`/`Field`; popover/palette/chip search fields stay raw.
- `Card` (`ui/card`): variant `default|muted|raised|interactive`, padding `none|sm|md|lg` (md=p-5); CardHeader/CardTitle/CardDescription/CardAction/CardContent/CardFooter; borderless `rounded-card`.
- `Input`/`Textarea` (`ui/input`, `ui/textarea`): icons via `InputGroup`/`InputGroupAddon` (`ui/input-group`), not `pl-9` hacks.
- `Field` (`primitives/field`): `label`, `description`, `error` (role="alert"), `required`, `htmlFor`, children or render-prop `({ id, describedBy, invalid })` for label↔control wiring. `hint`→`description`; plain `<label>`→`ui/label`'s `Label`.
- `Badge` (`ui/badge`): variants `default|primary|secondary|success|warning|danger|destructive|info|discord|outline|ghost|link`; sizes `sm|md`; `dot`. Colors `text-*` on `bg-*/10`. No StatusBadge — use `StatusDot`.
- `StatusDot` (`primitives/status-dot`): `status ready|idle|connecting|disconnected|errored`, `size sm|md|lg`, `pulse` (default only connecting/errored), `label`. Owns `toneStyles` map (`neutral|primary|success|warning|destructive|info|discord` → `{badge,dot,text}`) — don't define these colors elsewhere.
- `EmptyState` (`primitives/empty-state`): `icon`, `title`, `description`, `action`, `secondaryAction`, `size sm|md`.
- `Tabs` (`ui/tabs`): `Tabs > TabsList(variant "line"|default) > TabsTrigger` + `TabsContent`; `value`/`onValueChange`. In-page panels only — not routes/filters/radios.
- `Avatar` (`ui/avatar`): `src`, `alt`, `fallback`, `size xs|sm|md|lg` (32/40/56/80px), `ring`, `status online|idle|dnd|offline`. CDN: `discordAvatarUrl`/`discordGuildIconUrl` in `@/lib/discord-cdn` (server-safe; `a_`→gif else webp).
- `Skeleton` (`ui/skeleton`): `Skeleton`/`SkeletonLine`/`SkeletonCircle`/`SkeletonCard`; `bg-muted animate-pulse`.
- `Slider` (`ui/slider`): `value`/`defaultValue`/`min`/`max`/`step`/`onChange`/`disabled`/`label`/`showValue`/`formatValue` — all range inputs.
- `Switch` (`ui/switch`): `checked`/`defaultChecked`/`onChange`/`disabled`/`label`/`labelPosition left|right`/`size sm|md`; off `bg-secondary`+`shadow-control-boundary`, on `bg-primary-control`.
- `Select` (`ui/select`): Trigger(h-9, sm h-7)+`SelectValue` > Content > Group/Label/Item. Base UI `SelectValue` shows raw value unless `items` on Root or render-function children.
- `Dialog`/`Sheet`/`DropdownMenu`/`Command` (`ui/*`): standard compound; `Command` uses cmdk.
- `Toast` (`ui/toast`): `toast.success/error/warning/info(message, description?)`; `<Toaster/>` mounted once in `Providers.tsx`.
- `SearchableSelect` (`components/servers/searchable-select`): `SearchableOption { value, label, icon?, group?, disabled? }`; `options, value, onChange, multiple?, searchable?, placeholder, searchPlaceholder, disabled`.
- `Container` (default export, `@/components/container`, max-w-7xl) + `PageHeader` (`title`, `description`, children action slot, borderless).
- `DataTable<T>` (`data/data-table.tsx`): `columns: Column<T>[]` (`key, header, sortable?, align?, width?, render?`), `data`, `keyExtractor`. `StatCard`: `icon?, label, value, sub?, trend? up|down|neutral, trendValue?`. `TagInput`: `value: string[]`/`onChange`/`maxTags`. `NotificationStack`: `items`/`onDismiss`.
- No shared Sidebar — build per-domain (`playlists/playlist-sidebar.tsx`, `servers/server-feature-sidebar.tsx`). Removed: `overlay/modal·drawer·dropdown·select·command-palette·date-picker`, `feedback/toast`, `SelectOption`. `rounded-full` only for badges/chips/status dots/pills. Icon buttons need aria-label; toggles need labels.

## Discord-style UI (`src/components/discord/`)

Discord colors only via `--discord-*` tokens; accept raw Discord API shapes (bitmasks, role color ints); `next/image` only with hosts in `next.config.ts` `remotePatterns`: `cdn.discordapp.com`, `i.ytimg.com`, `i.scdn.co`, `*.sndcloud.com`, `api.dicebear.com` (add host before new CDN); URL builders in `@/lib/discord-cdn`; GIF avatars (`a_` hash) use `.gif` + `?size=`. Never `dangerouslySetInnerHTML` or HTML conversion for `**bold**` (JSX split or regex replace as text nodes).

- `EmbedPreview` (`embed-preview.tsx`): exports `EmbedData { color? (default "#5865F2"), author?{name,iconUrl?,url?}, title?, titleUrl?, description?, fields?[{name,value,inline?}], image?, thumbnail?, footer?{text,iconUrl?,timestamp?} }`. Shell `flex max-w-[520px] bg-discord-embed rounded-md overflow-hidden`; bar `w-1 shrink-0 rounded-l-md` + `style={{ backgroundColor: embed.color }}`; inline fields `repeat(3,1fr)`; text `text-discord-text`, muted `text-discord-text-muted`, links `text-discord-blue`; footer `border-t border-white/5`.
- `ChannelMessage` (`channel-message.tsx`): parent wraps `bg-discord-bg rounded-xl overflow-hidden py-2`. Imports from `@/components/ui/*`, not primitives.
- Channel mock frame (class convention, not a component; only current use `home/features-section.tsx`; hero uses `DiscordCommandAnimation` from `home/discord-command-animation.tsx`): `rounded-card border border-border-subtle bg-discord-embed`; rows `border-discord-btn-active px-4 py-2.5` + `text-2xs text-discord-text-muted`. `bg-discord-embed` ONLY for mock frames — inner panels use `bg-surface-2`+`rounded-control` (no card-in-card). Bubbles `flex gap-2.5` + 36px avatar; top-aligned always. Cursors: `TypingText` (`-ml-px`, `fit` reserves widest width) / `StreamingTypeText` (inline `marginLeft: "1px"`); shape `inline-block h-[0.9em] w-[2px] align-baseline`.
- `GuildCard` (`servers/guild-card.tsx` + `guild-card.types.ts`): `EnrichedGuild extends DiscordGuild { isManageable, isInstalled }`, `{ guild, inviteUrl }`. Icon `cdn.discordapp.com/icons/${id}/${icon}.png` (no size param), fallback initial in `bg-surface-2`. `ShieldCheck` installed indicator (hidden mobile). Actions branch on `isInstalled`/`isManageable` (Settings2/Play/ExternalLink/UserPlus). Responsive classes only; `pointer-coarse:min-h-11`.
- `SearchableSelect` channels via `buildChannelOptions` (category exclusion, `SELECTABLE_CHANNEL_TYPES`, `parentName` grouping); user avatars `discordAvatarUrl(id, avatar, 32)`.
- `RoleSelect` (`role-select.tsx`): `DiscordRole { id, name, color: number, position }`; multi-select via `Portal`+`usePopoverCoords` (backdrop `z-[190]`, panel `z-[200]`). Color int → `#rrggbb` (`color.toString(16).padStart(6,"0")`, 0=none); `position` desc; chips/options inline style with `15`/`40` alpha hex suffixes.
- `PermissionList` (`permission-list.tsx`): exports `DISCORD_PERMISSIONS`; check `(value & flag) === flag`; toggle `value | flag` / `value & ~flag`; `dangerous` → `text-destructive` + `AlertTriangle`. Server re-validates same bit logic (BigInt, `src/lib/guild-permissions.ts`).

## Scroll & motion effects

Tools (installed; GSAP/Lenis/locomotive forbidden): CSS first (sticky/snap/keyframes); framer-motion `m` + LazyMotion + `MotionConfig reducedMotion="user"` (`Providers.tsx`); `react-intersection-observer` `useInView`. Token classes + `duration-fast/base/slow` only. JS timers check `useReducedMotion()`.

Existing helpers — reuse: `src/components/motion/reveal.tsx` (`RevealGroup` stagger 0.08 + `RevealItem`); `@/components/typing-text.tsx` (`TypingText`, jamo via `@/lib/hangul`), `@/components/streaming-type-text.tsx` (`StreamingTypeText`); `src/hooks/use-count-up.ts` (`useCountUp({ end, start?, durationMs? })` → `{ ref, value, inView }`; used in `data/stat-card.tsx`, `home/hero-section.tsx`, `app/profile/profile-view.tsx`); `globals.css` `@utility animate-marquee` (hover pause `group-hover:[animation-play-state:paused]`, see `components/home/command-marquee.tsx`); scrollspy in `src/app/design/page.tsx` (active when `rect.top <= 160`).

Effect recipes (grouped; compose from these — never new packages):
- On-enter (fade/slide/blur-in): `m.div whileInView={{opacity:1}} viewport={{once:true, margin:"-80px"}}` (+`x`/`y` offset, or `filter: blur(8px)→0`). Lists: `RevealGroup`/`RevealItem` (stagger 0.08). Headlines: per-word `m.span` (inline-block) stagger. Images: mask reveal `clipPath: inset(0 100% 0 0)→0 0 0 0`, ease `[0.16,1,0.3,1]`.
- Text/motion specials: typewriter → `TypingText`/`StreamingTypeText`; count-up → `useCountUp`; SVG draw → `pathLength` 0→1; long-copy fill → per-word `useTransform(progress, [start,end], [0.15,1])` with memoized word array.
- Scroll-linked (`useScroll({target, offset:["start end","end start"]})` + `useTransform`): parallax (y % speeds), scroll zoom (`scale`), background transition (`backgroundColor`, token classes only), text fill.
- Sticky/scroll patterns: sticky nav `sticky top-24` (navbar h-16) + `scroll-mt-*`; pin+scrub without GSAP = sticky inner + `useScroll` x-translate over `h-[300vh]`; scrollytelling = sticky visual + steps, active index `useInView({threshold: 0.5, onChange})`; stacking cards = sticky per card `top: calc(4rem + i*1.5rem)` height `calc(100vh - 8rem)`; scroll snap `snap-x snap-mandatory overflow-x-auto scrollbar-none` (carousels only, no page-wide snap-y); hide-on-scroll header = direction listener → `-translate-y-full` + `duration-base` (passive); scrollspy = active when `getBoundingClientRect().top <= 160`; marquee = CSS `animate-marquee`.
- Heavy/rare (agree spec first): image sequence from `public/images/scroll-sequence/`; horizontal-scroll panels (pin+scrub variant).

Forbidden: hardcoded colors/spacing/durations, `custom-scrollbar`, `motion` import, new animation packages.