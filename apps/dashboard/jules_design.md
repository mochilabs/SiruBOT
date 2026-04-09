# SiruBOT Dashboard Design System & Progress

## 1. Color Palette (Dark Mode Base)

| Usage | Color Name | HEX Code | Description | CSS Variable / Tailwind |
| :--- | :--- | :--- | :--- | :--- |
| **Main Background** | Muted Dark Mauve | `#302328` | Dreamy dark pink theme background | `bg-siru-bg` |
| **Panel Background** | Soft Dark Rose | `#3A272D` | Cards, menus, component background | `bg-siru-panel` |
| **Dashboard Base** | Warm Dark Cocoa | `#2A2322` | Secondary background for data readability | `bg-siru-base` |
| **Primary Point** | Soft Pink | `#FCD6E5` | Primary CTA buttons, key icons | `bg-siru-primary` |
| **Secondary Point** | Pastel Yellow | `#FCE6A3` | Highlights, leaderboard crowns, points | `bg-siru-secondary` |
| **Text (Primary)** | Off-White | `#F5F5F7` | Default body and title text | `text-siru-text` |

## 2. Assets & Placeholders

| File Name | Size | Usage |
| :--- | :--- | :--- |
| `sd_portrait_bot_profile_picture_with_hand` | 671x671px | Landing CTA, Welcome Message, 404 Page |
| `sd_portrait_bot_profile_picture` | 671x671px | Logo, Footer, Profile Icon |
| `full body shot_rough_sketch` | 1098x1840px | Main Hero Section, Ranking Background Watermark |

## 3. UI Guidelines
* **Theme Vibe:** "Cute", "Dreamy", "Subculture", "Clean", "Subtle Dark Pink"
* **Shapes:** Rounded corners (16px+ for main components).
* **Effects:** Soft glow effects for highlights.
* **Component Library:** Radix UI (`@radix-ui/themes` and primitives where necessary).
* **Styling:** Tailwind CSS combined with Radix Themes.

## 4. Progress Tracking

- [x] Setup Development & Documentation Context (Tailwind Config, CSS variables)
- [x] Page 1: Landing Page (Home)
- [x] Page 2: Ranking Page (Track)
- [x] Page 3: Web Dashboard (Servers)
- [x] Page 4: System Status (Shard Dashboard)