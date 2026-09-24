# Escolta Pro — Design System

**Midnight & Ice.** Executive protection with the finish of a premium airline or private-jet app:
deep midnight-navy atmosphere lit by cool blue glows, frosted-glass surfaces, cinematic photography
everywhere, and a single white pill for the main action. Calm, precise, expensive. Nothing shouts.

## Principles

1. **Photography first.** Screens lead with real imagery (`constants/brandMedia.ts`: hero, service
   moments, vehicles, ops room, city) and people are shown as photos, not initials. Use `PhotoCard`
   for image tiles and `Scrim` whenever text sits on a photo. The sign-in screen runs looping B-roll
   (`BackgroundVideo`). The 3D `GlassShield` marks trust moments (start code, verification, empty states).
2. **One action, one accent.** The primary action is a white pill (`Button variant="primary"`).
   Ice blue (`Colors.accent*`) marks active/selected states, links and key numbers. Everything else is
   white, blue-grey, or a muted status color.
3. **Glass, not boxes.** Surfaces are frosted glass (`Colors.glass`/`glassStrong` + `glassBorder`)
   over the ambient glow that `Screen` paints by default. Big radii (cards 24, sheets 30), pills for
   buttons, chips and segmented controls. Hierarchy through type: Display titles (`title1`/`title2`) in Encode Sans Expanded
   give each screen presence; everything operational is Geist. Don't wrap every block in a bordered card: use spacing
   and `SectionTitle` first, cards only when grouping or elevation means something.
4. **Honest data.** Never show invented numbers (fake ratings, fake distances, "726 jobs"). If a
   value doesn't exist, hide the element or show an em dash. Show "Verified" only when
   `kycStatus === 'approved'`.
5. **Every state designed.** Loading = `SkeletonCard` shaped like the content (not a lone spinner).
   Empty = `EmptyState` with a next step. Error = inline message + retry. Never a spinner forever.
6. **Touch feels physical.** Every tappable thing goes through `PressableScale` (via `Button`, `Card
   onPress`, `ListRow`, `Chip`, `IconButton`). No bare `TouchableOpacity` in redesigned screens.

## Tokens

Import `Colors` from `@/constants/colors` and `{ Type, Space, Radius, Shadow, Fonts, ICON_STROKE }`
from `@/constants/design`.

| Token | Use |
|---|---|
| `Colors.background` `#05080F` | midnight base (Screen adds the blue ambient glow on top) |
| `Colors.glass` / `glassStrong` / `glassBorder` | frosted surfaces and their 1px edge — the default for cards, inputs, chips |
| `Colors.surface` / `surfaceLight` / `elevated` | solid navy surfaces when glass isn't wanted (modals, sheets) |
| `Colors.border` / `borderStrong` / `hairline` | lines; `StyleSheet.hairlineWidth` for dividers |
| `Colors.textPrimary` (ice white) / `textSecondary` / `textTertiary` | text hierarchy; `textPrimary` is also the white-pill fill |
| `Colors.accent` / `accentLight` / `accentDark` / `accentSoft` / `accentLine` | ice blue: active, selected, links, money; light variant for text on dark |
| `Colors.textOnAccent` | midnight text/icons on white pills and ice fills |
| `success` / `warning` / `error` / `info` (+ `…Soft`) | status only |

Hex tokens accept an alpha suffix (`Colors.accent + '20'`); the `…Soft`, `accentLine`, `glass*`, `hairline`,
`overlay` tokens are already rgba — never concatenate onto them. Never use raw hex in screens (no
`#007AFF`, `#fff`, light-theme greys); map to a token.

**Typefaces.** Display: **Encode Sans Expanded** — an expanded grotesk, the lettering of authority
(agency jackets, armored-vehicle livery, automotive badges): strong without shouting, rarely seen in
apps. ExtraBold for hero lines (`display`), Bold for titles, **Light in `accentLight` for an accent line**
(`Fonts.displayLight` — the brand's signature: "Discreet protection," heavy ivory + "on your schedule."
light ice blue), SemiBold uppercase for `overline` labels so the brand voice repeats everywhere. It is wide:
keep display sizes at or below the scale and prefer short titles. UI/body: **Geist**.

**Type** (`Type.x` styles or `<AppText variant="x">`): `display`, `title1`, `title2` (Encode Sans Expanded) ·
`title3`, `headline`, `body`, `bodyMedium`, `callout`, `footnote`, `caption`, `overline` (small caps
label, use sparingly) · `numeric`, `numericLarge` (tabular figures — use for all money, counts, codes).
Never set `fontWeight` together with a custom font: pick the family (`Fonts.medium`, `Fonts.semibold`,
`Fonts.bold`) instead. Sentence case for titles and buttons ("Book protection", not "Book Protection").

**Spacing** 4-pt scale: `Space.xs 4 · sm 8 · md 12 · lg 16 · xl 20 · xxl 24 · xxxl 32 · huge 48`,
screen gutter `Space.gutter` (20). **Radius**: `xs 8` · `sm 12` · `md 16` inputs · `lg 24` cards/photos · `xl 30`
sheets · `pill` buttons, chips, badges. **Shadow**: `Shadow.sm/md/lg` (navy-tinted), `Shadow.accent` only on
the white primary pill. **Icons**: lucide, `strokeWidth={ICON_STROKE}` (1.75), sizes 16/18/20/24.

## Components — `import { … } from '@/components/ui'`

| Component | Notes |
|---|---|
| `Screen` | Root of every screen. `scroll` (default), `glow` (ambient midnight light, ON by default), `padTop={false}` when a `NavBar` sits above, `keyboard` for forms, `refreshControl`, `footer` for an `ActionBar`. Centers content at max 560px on web. |
| `ScreenHeader` | Tab-root screens: `eyebrow` (optional, ice-blue small caps — e.g. date or role), display `title`, `subtitle`, `right` (IconButton/SegmentedControl). |
| `NavBar` | Pushed/detail screens: back button + centered title + `right`. Place it ABOVE `<Screen padTop={false}>`. |
| `ActionBar` | Sticky bottom bar holding the screen's primary `Button` (booking, payment, accept job). |
| `Button` | `variant`: `primary` (white pill, ONE per screen) · `secondary` (glass pill) · `outline` · `ghost` · `danger`; `size` sm/md/lg; `icon`/`iconRight` (lucide component, not element); `loading`; `fullWidth` (default true). |
| `Input` | `label`, `hint`, `error`, `icon`, `trailing`; password eye toggle is automatic with `secureTextEntry`. |
| `Card` | glass; `tone` default/raised/accent, `onPress` makes it pressable, `padded`. |
| `ListGroup` + `ListRow` | Settings/profile/menus. Row: `icon`, `title`, `subtitle`, `value`, `onPress`, `destructive`, `trailing`. |
| `StatTile` | Dashboard numbers: `label`, `value`, `hint`, `icon`, `accent`. Put 2 per row (`flexDirection:'row', gap: Space.md`). |
| `InfoRow` | Label/value pairs in summaries and receipts; `emphasis` for totals. |
| `Badge` / `StatusBadge` | `tone` neutral/accent/success/warning/error/info. `StatusBadge status={booking.status}` has the canonical booking status labels & colors — use it everywhere a booking status is shown. |
| `Chip`, `SegmentedControl` | Pill filters and toggles; the selected one turns white. |
| `Avatar` | Rounded-square photo with display-face initials fallback; `verified` only when KYC approved. Replaces `SafeImage` for people. |
| `EmptyState` | `icon`, `title`, `message`, `actionLabel`/`onAction`. |
| `SkeletonCard`, `Skeleton` | Loading placeholders. |
| `SectionTitle` | Small caps section label with optional right action. |
| `IconButton` | Round hairline icon button, `dot` for unread. |
| `BrandMark`, `Wordmark` | Logo. |
| `PhotoCard` | Rounded photo tile with scrim + `eyebrow`/`title`/`caption`/children; `onPress` optional. |
| `Scrim` | Gradient over a photo so text reads (`from="top"` fades to dark at the bottom). |
| `GlassShield` | 3D frosted shield with a breathing glow — trust moments only. |
| `BackgroundVideo` | Looping muted B-roll (`BrandVideo.loginLoop`) with poster; respects reduced motion. |
| `AppText` | Text with `variant`, `color`, `weight`, `align`, `tabular`. |

Money: always `formatMXN(n)` from `@/utils/pricing` (never `$${n}` or `toFixed` by hand).

## Screen recipes

Tab root:
```tsx
<Screen glow refreshControl={…}>
  <ScreenHeader eyebrow="Tuesday, 24 September" title="Your bookings" subtitle="…" right={…} />
  <SectionTitle title="Upcoming" />
  {loading ? <><SkeletonCard media /><SkeletonCard media /></> : items.length === 0 ? <EmptyState … /> : items.map(…)}
</Screen>
```

Detail / flow:
```tsx
<View style={{ flex: 1, backgroundColor: Colors.background }}>
  <NavBar title="Booking" right={<StatusBadge status={b.status} />} />
  <Screen padTop={false} contentStyle={{ paddingTop: Space.xl }} footer={<ActionBar><Button title="Accept job" … /></ActionBar>}>
    …
  </Screen>
</View>
```

Forms: `Screen keyboard`, stacked `Input`s with `gap: Space.lg`, validation errors inline via `error`,
the submit `Button` at the end (or in an `ActionBar`). No `Alert.alert` for validation.

## Web
`Alert.alert` works on web: `<AlertHost/>` (mounted in `app/_layout.tsx`) renders it as a branded
dialog with every button. For text input use a `Modal` with our components — `Alert.prompt` is
iOS-only (it throws on web and does nothing on Android): never use it.
