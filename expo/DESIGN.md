# Escolta Pro — Design System

Quiet luxury for executive protection. The reference points are a private bank, a watchmaker's
boutique, and a black-car service: dark, calm, precise. Nothing shouts. Gold is a signature, not a
paint bucket.

## Principles

1. **One accent.** Champagne gold (`Colors.gold`) marks the single primary action on a screen, the
   active state, and money. Everything else is ivory, stone grey, or a muted status color.
2. **Hierarchy through type, not boxes.** Display titles (`title1`/`title2`) in Encode Sans Expanded
   give each screen presence; everything operational is Geist. Don't wrap every block in a bordered card: use spacing
   and `SectionTitle` first, cards only when grouping or elevation means something.
3. **Honest data.** Never show invented numbers (fake ratings, fake distances, "726 jobs"). If a
   value doesn't exist, hide the element or show an em dash. Show "Verified" only when
   `kycStatus === 'approved'`.
4. **Every state designed.** Loading = `SkeletonCard` shaped like the content (not a lone spinner).
   Empty = `EmptyState` with a next step. Error = inline message + retry. Never a spinner forever.
5. **Touch feels physical.** Every tappable thing goes through `PressableScale` (via `Button`, `Card
   onPress`, `ListRow`, `Chip`, `IconButton`). No bare `TouchableOpacity` in redesigned screens.

## Tokens

Import `Colors` from `@/constants/colors` and `{ Type, Space, Radius, Shadow, Fonts, ICON_STROKE }`
from `@/constants/design`.

| Token | Use |
|---|---|
| `Colors.background` `#0A0A09` | screen background |
| `Colors.surface` / `surfaceLight` / `elevated` | cards, inputs, raised elements (in that order) |
| `Colors.border` / `borderStrong` / `hairline` | 1px lines; `StyleSheet.hairlineWidth` for dividers |
| `Colors.textPrimary` (ivory) / `textSecondary` / `textTertiary` | text hierarchy |
| `Colors.gold` / `goldLight` / `goldDark` / `goldSoft` / `goldLine` | accent, accent text on dark, pressed, tinted bg, accent border |
| `Colors.textOnGold` | text/icons on gold fills |
| `success` / `warning` / `error` / `info` (+ `…Soft`) | status only |

Hex tokens accept an alpha suffix (`Colors.gold + '20'`); the `…Soft`, `goldLine`, `hairline`,
`overlay` tokens are already rgba — never concatenate onto them. Never use raw hex in screens (no
`#007AFF`, `#fff`, light-theme greys); map to a token.

**Typefaces.** Display: **Encode Sans Expanded** — an expanded grotesk, the lettering of authority
(agency jackets, armored-vehicle livery, automotive badges): strong without shouting, rarely seen in
apps. ExtraBold for hero lines (`display`), Bold for titles, **Light in `goldLight` for an accent line**
(`Fonts.displayLight` — the brand's signature: "Discreet protection," heavy ivory + "on your schedule."
light gold), SemiBold uppercase for `overline` labels so the brand voice repeats everywhere. It is wide:
keep display sizes at or below the scale and prefer short titles. UI/body: **Geist**.

**Type** (`Type.x` styles or `<AppText variant="x">`): `display`, `title1`, `title2` (Encode Sans Expanded) ·
`title3`, `headline`, `body`, `bodyMedium`, `callout`, `footnote`, `caption`, `overline` (small caps
label, use sparingly) · `numeric`, `numericLarge` (tabular figures — use for all money, counts, codes).
Never set `fontWeight` together with a custom font: pick the family (`Fonts.medium`, `Fonts.semibold`,
`Fonts.bold`) instead. Sentence case for titles and buttons ("Book protection", not "Book Protection").

**Spacing** 4-pt scale: `Space.xs 4 · sm 8 · md 12 · lg 16 · xl 20 · xxl 24 · xxxl 32 · huge 48`,
screen gutter `Space.gutter` (20). **Radius**: `xs 6` badges · `sm 10` small controls · `md 14`
buttons/inputs · `lg 18` cards · `xl 24` sheets. **Shadow**: `Shadow.sm/md/lg` (warm-tinted), `Shadow.gold`
only on the primary button. **Icons**: lucide, `strokeWidth={ICON_STROKE}` (1.75), sizes 16/18/20/24.

## Components — `import { … } from '@/components/ui'`

| Component | Notes |
|---|---|
| `Screen` | Root of every screen. `scroll` (default), `glow` (ambient gold light — hero screens only: sign-in, home, dashboards), `padTop={false}` when a `NavBar` sits above, `keyboard` for forms, `refreshControl`, `footer` for an `ActionBar`. Centers content at max 560px on web. |
| `ScreenHeader` | Tab-root screens: `eyebrow` (optional, gold small caps — e.g. date or role), display `title`, `subtitle`, `right` (IconButton/SegmentedControl). |
| `NavBar` | Pushed/detail screens: back button + centered title + `right`. Place it ABOVE `<Screen padTop={false}>`. |
| `ActionBar` | Sticky bottom bar holding the screen's primary `Button` (booking, payment, accept job). |
| `Button` | `variant`: `primary` (gold, ONE per screen) · `secondary` · `outline` · `ghost` · `danger`; `size` sm/md/lg; `icon`/`iconRight` (lucide component, not element); `loading`; `fullWidth` (default true). |
| `Input` | `label`, `hint`, `error`, `icon`, `trailing`; password eye toggle is automatic with `secureTextEntry`. |
| `Card` | `tone` default/raised/gold, `onPress` makes it pressable, `padded`. |
| `ListGroup` + `ListRow` | Settings/profile/menus. Row: `icon`, `title`, `subtitle`, `value`, `onPress`, `destructive`, `trailing`. |
| `StatTile` | Dashboard numbers: `label`, `value`, `hint`, `icon`, `accent`. Put 2 per row (`flexDirection:'row', gap: Space.md`). |
| `InfoRow` | Label/value pairs in summaries and receipts; `emphasis` for totals. |
| `Badge` / `StatusBadge` | `tone` neutral/gold/success/warning/error/info. `StatusBadge status={booking.status}` has the canonical booking status labels & colors — use it everywhere a booking status is shown. |
| `Chip`, `SegmentedControl` | Filters and view toggles. |
| `Avatar` | Rounded-square photo with display-face initials fallback; `verified` only when KYC approved. Replaces `SafeImage` for people. |
| `EmptyState` | `icon`, `title`, `message`, `actionLabel`/`onAction`. |
| `SkeletonCard`, `Skeleton` | Loading placeholders. |
| `SectionTitle` | Small caps section label with optional right action. |
| `IconButton` | Round hairline icon button, `dot` for unread. |
| `BrandMark`, `Wordmark` | Logo. |
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
