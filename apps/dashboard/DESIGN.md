# SiruBOT Dashboard Design Notes

## Visual Direction

- Concept: **Sophisticated Audio-Visual Flow**
- Theme: premium dark, music control room mood
- Avoid glassmorphism and frosted cards
- Prefer layered solid surfaces with soft primary glow
- Keep rounded corners at `16px` or above for UI blocks

## Color System

- `bg-main`: `#302328`
- `bg-panel`: `#3A272D`
- `bg-dashboard`: `#2A2322`
- `primary`: `#FCD6E5`
- `secondary`: `#FCE6A3`
- `discord`: `#5865F2`
- `text-main`: `#F5F5F7`

## Motion System (Framer Motion)

- Global route transitions use `AnimatePresence` + fade/slide variants
- Ranking rows use staggered slide-up animation
- Interactive controls use subtle hover scale (`1.02~1.04`)
- Status indicators include soft pulse to imply live system telemetry

## Surface & Depth Rules

- Surfaces are opaque/near-opaque, not translucent glass
- Use gentle texture/noise and waveform overlays for dashboard panels
- Replace black shadows with tinted soft glow from `primary` and dark rose tones
- Keep contrast high enough for readability on data-heavy screens

## Iconography

- Prefer `lucide-react` for system and navigation semantics
- Remove decorative emoji from status, stats, and ranking labels
- Use `Crown` icon with `secondary` color for top ranking signal

