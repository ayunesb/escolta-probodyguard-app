# Escolta Pro — premium overhaul (branch `premium-overhaul`)

A full audit and rebuild of the app: security fixes on the backend, the booking loop made to work end
to end, and a new design system applied to every live screen. The `premium-overhaul` branch is the
GitHub handoff for review. Production deployment is still pending.
The overhaul was tested against local emulators; it has not been deployed to the live Firebase project.

> **Deploy in the order below.** The new security rules and the new app depend on each other. Deploying
> rules without the app (or the reverse) breaks sign-up, booking and payments.

## Public preview

[Open the interactive demo](https://escolta-pro-demo.vercel.app). No account is required.
It uses fictional data in browser memory, separate from the live Firebase backend.
See [PUBLIC_DEMO.md](PUBLIC_DEMO.md) for the build commands, scope and verification.

## Handoff verification - 24 September 2026

The English/Spanish app, brand assets, booking changes, security rules, emulator setup and deployment
instructions are included in this branch. Review and merge it into `main` before deploying, following
the deployment order below.

Fresh checks for this handoff:
- App TypeScript: `cd expo && npx tsc --noEmit` - passed.
- Cloud Functions TypeScript: `cd expo/functions && npx tsc --noEmit` - passed.
- App Jest suite: `cd expo && npm test -- --runInBand` - 10 suites, 98 tests passed.
- Production web export: `npx expo export --platform web` - passed.

The earlier security-rule and browser-flow checks are recorded in Verification done below; they were
not rerun during the GitHub handoff. Real payments, native device builds and push delivery remain
unverified. The local preview URL is not a public deployment.

## What was wrong (and is now fixed)

**Security (critical)**
- Any signed-up user could make themselves **admin** or approve their own KYC. The sign-up screen even
  offered "Admin" as a choice. Profiles are now locked field by field in `firestore.rules`.
- Any signed-in user could **rewrite any booking**: set their own price, mark it paid without paying, or
  read a stranger's address and start code. `database.rules.json` now enforces a strict status machine
  per role, freezes amounts after payment, and only the server can mark a booking paid.
- The payment server trusted prices written by the phone. It now recomputes the price from the guard's
  rate (`api/stripe/*`, shared `utils/pricing.ts`) and confirms bookings only after Stripe reports success.
- Every guard's government ID and license were readable by any signed-in account. KYC documents now live
  in `users/{uid}/private/kyc` (owner, their company, admins only).
- Unauthenticated Braintree endpoints could charge any amount, refund anything, or edit anyone's saved
  cards. All now require a Firebase ID token; refunds are admin-only.
- Two Cloud Functions let anyone grant themselves admin. Deleted.
- Braintree sandbox keys were committed in logs, scripts and docs. Files deleted / values redacted —
  **the keys must still be rotated** (they remain in git history).

**The core loop never worked end to end**
- Clients could never see their guard on the tracking map (nothing published locations; rules blocked reads).
- No notification was ever sent (stubs on the client; server triggers watched the wrong database).
- Booking lists and detail screens never updated when a status changed.
- Guards were shown unpaid bookings as jobs and could accept them; paying could move a booking backwards.
- Reject/Cancel crashed on web and did nothing on Android (`Alert.prompt`).
- Evening bookings were saved on the wrong day (UTC date + local time).
- Prices had float rounding errors (e.g. $255.525) that Braintree rejects.
- The rating screen was unreachable; the start code was checked on the guard's own phone.

**Auth**
- Sign-up failed in production for everyone (the profile write raced an auto sign-out), so every guard
  and company that registered silently became a nameless "client".
- iOS/Android sessions weren't persisted (users re-logged on every launch).
- Everyone was force-signed-out 30 minutes after login regardless of activity.
- "Forgot password" did nothing; "Resend verification" always failed.

Full list of fixes by area: see the commit message.

## Deploy order

1. **Rotate the Braintree sandbox keys** in the Braintree dashboard. Put the new ones only in the
   Functions environment (`BRAINTREE_MERCHANT_ID`, `BRAINTREE_PUBLIC_KEY`, `BRAINTREE_PRIVATE_KEY`,
   plus the new `BRAINTREE_MERCHANT_ACCOUNT_ID` for the MXN account).
2. **Vercel environment variables** (project root `expo`, build `npx expo export --platform web`, output `dist`):
   - `FIREBASE_SERVICE_ACCOUNT` — the service-account JSON (server only)
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (server only)
   - `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (client)
   - optional: `ALLOWED_ORIGINS` (comma-separated), `FIREBASE_DATABASE_URL`,
     `EXPO_PUBLIC_MAP_TILE_URL` + `EXPO_PUBLIC_MAP_TILE_ATTRIBUTION` (a commercial tile provider for production;
     the default OpenStreetMap tiles are fine for testing but not for production traffic)
   - In Stripe, add a webhook to `https://<your-domain>/api/stripe/webhook` for `payment_intent.succeeded`.
3. **Deploy the app and the rules together** (Vercel deploy, then):
   ```bash
   firebase deploy --only firestore:indexes
   firebase deploy --only firestore:rules,database,storage
   ```
   Accept the prompt that lets Storage read Firestore (the storage rules need it).
4. **Migrate existing data** (role mirrors, KYC documents off public profiles, push tokens off profiles):
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/migrate-security-model.mjs --project escolta-pro-fe90e
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/migrate-security-model.mjs --project escolta-pro-fe90e --apply
   ```
   The first run is a dry run. It also lists guards hidden from clients (no rate, or `availability`
   not a boolean) — they fix that themselves under Account → Protector profile.
5. **Cloud Functions** once Firebase is on the Blaze plan: `firebase deploy --only functions`
   (confirm deleting the two removed demo functions).

## English / Español

The whole app is bilingual. The **EN | ES** switch is on the sign-in screen (top right) and under
Account → Language. The choice is remembered on the device and saved to the user's profile
(`users/{uid}.language`). On first launch the app follows the phone's language.

- Engine: i18next + react-i18next in `expo/i18n/`. English is the source of truth
  (`i18n/locales/en/*.ts`). Spanish (`i18n/locales/es/*.ts`) is type-checked against it, so a missing or
  extra key fails `tsc`.
- Spanish copy is Mexican Spanish with formal "usted". Dates use `es-MX`. Money stays MXN.
- Push notifications (Cloud Functions, `functions/src/notificaciones.ts`) are sent in each recipient's profile
  language, Spanish when unknown. Profiles created before this change carry `language: "en"` by default. If
  real Mexican users signed up earlier, set theirs to `"es"`, or they will get English pushes until they
  pick a language in the app.
- To add text: put the English string in the right namespace file, add the Spanish one with the same key,
  and use `const { t } = useTranslation('<namespace>')`.

## Test mode: one-tap login for every role

```bash
brew install openjdk@21      # once
npm run dev:emulated         # from expo/: emulators + seed data + web app on :8081
```
The sign-in screen shows a **Test mode** panel with Client, Protector, Company and Admin. It only exists
in development builds with `EXPO_PUBLIC_USE_EMULATORS=1`, and runs against a `demo-` Firebase project
that cannot reach the real one. Details: `expo/scripts/emulator/README.md`.

## Design system — "Midnight & Ice"

`expo/DESIGN.md` — tokens, typefaces (Encode Sans Expanded for display, Geist for UI), components in
`expo/components/ui`, and screen recipes. New screens should be built from it.

- Midnight-navy atmosphere with blue glows, frosted-glass surfaces, white pill primary buttons,
  ice-blue accent, a floating glass tab dock.
- Photography and video generated for the brand (Higgsfield): `expo/assets/brand/img` (hero, service
  moments, vehicles, ops room, city, 3D glass shield) and `expo/assets/brand/video/login-loop.mp4`
  (7-second seamless B-roll behind the sign-in screen). 2K originals are kept locally in
  `expo/assets/brand/raw/` (gitignored). Demo guard portraits for test mode: `expo/public/demo/guards`.
- **Native builds**: the sign-in video uses `expo-video`, a native module — the next iOS/Android dev
  build (EAS) must be rebuilt to include it. Web needs nothing.

## Verification done

- TypeScript: 0 errors (a shim that typed every context hook as `any` was removed, so this is now real).
- App tests: 98/98. Security-rules tests: 89/89 against the emulators (`tests/rules`).
- Production web build (`expo export`) succeeds. Lint: clean.
- Every role walked through in the browser against the emulators with the final rules: browse → book
  (price verified to the centavo) → guard accepts → wrong start code rejected by the rules → right code
  starts the service → complete; live tracking map; company and admin dashboards.
- Not verified: real Stripe/Braintree charges (needs keys), iOS/Android device builds, push delivery
  (needs Blaze).

## Known gaps / next steps

- **Refunds** are recorded, not executed — money moves in the Stripe dashboard. A server refund endpoint
  is the next payments task.
- **Background location** only shares while the guard's app is open (the background task still targets
  the old path).
- A guard could brute-force the 6-digit start code with repeated writes; move the check to a Cloud
  Function with attempt limits once on Blaze.
- Guard email and phone are still readable by any signed-in user (they live on the public profile).
- Several finished-but-unwired services remain (guard matching, payouts, geofencing, incidents, referrals).
- Admins can't reassign a guard themselves; only the client can pick a replacement after a decline.
