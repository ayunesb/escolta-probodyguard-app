# Public Escolta Pro demo

https://escolta-pro-demo.vercel.app

Anyone can explore the client, protector, company and admin views without an account. English and
Spanish are available from the language switch. Profiles, ratings, bookings and locations are
fictional examples. Changes stay in browser memory and reset on a page reload.

This is an interactive preview, not a live booking service. Payments, emergency calls/alerts,
account creation, document uploads and cloud functions are disabled. It does not access the live
Firebase project. The production backend setup in HANDOFF.md is still pending.

## Build and publish

From `expo/` with Node 22 and dependencies installed:

```sh
npm install --legacy-peer-deps
npm run build:demo
vercel link --project escolta-pro-demo
vercel deploy --prebuilt --prod
```

Use the `escolta-pro-demo` Vercel project for the demo. The normal app export is for the separate live
service; do not use `vercel deploy` without `--prebuilt` for this demo project.

`build:demo` ignores local environment files, strips inherited EXPO_PUBLIC settings, enables the
web-only demo flag, and produces `.vercel/output` containing static files only. The build-time Metro
resolver replaces Firebase SDK imports with the in-memory adapter in `expo/demo/`. Without the flag,
normal builds retain the real SDK. No API functions or secrets are uploaded by the prebuilt deployment.

The exported response headers restrict connections to the same origin and map tiles, deny forms and
frames, and disable browser location/camera/microphone/payment permissions. Map imagery is fetched
from OpenStreetMap; the sample marker coordinates are fictional demonstration locations.

## Verified on 24 September 2026

- App TypeScript and Cloud Functions compilation pass.
- Existing 98 tests and 3 new demo-isolation tests pass (101 total).
- Production demo web export succeeds.
- Browser checks: all four roles, role switching, English/Spanish, client bookings and tracking.
- Anonymous HTTP 200 responses on the public root and app routes.
- Public client entry works with no browser console errors.

The link is for review. For real customers and payments, follow the separate deployment and migration
requirements in HANDOFF.md.
