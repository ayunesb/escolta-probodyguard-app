# Local test mode (Firebase emulators + quick login)

Runs the whole app against **local** Firebase emulators seeded with realistic data, and adds
one-tap sign-in buttons for each role on the sign-in screen. Nothing here can reach the real
Firebase project: emulator mode switches the app to the `demo-escolta` project, and Firebase
guarantees `demo-` projects never talk to real ones.

```bash
brew install openjdk@21        # once (the emulators need Java 21+)
npm run dev:emulated           # emulators + seed + web app on http://localhost:8081
```

On the sign-in screen, a **Test mode** panel lists Client, Protector, Company and Admin. Tap one to
enter as that role. The accounts (in `constants/devAccounts.ts`) only exist inside the emulator.

Seeded data: a client, a company ("Sentinela Protección Ejecutiva") with four guards (one with
verification pending), an admin, and bookings in every status — unpaid, paid awaiting the guard,
accepted, live in progress (with a guard location), completed (one rated, one waiting for a rating)
and cancelled. Start codes are printed nowhere on purpose: the client sees theirs in the booking.

- Re-seed without restarting: `npm run emulators:seed`
- The quick-login panel never appears in production builds (`__DEV__` is false) or without
  `EXPO_PUBLIC_USE_EMULATORS=1`.
- Payments go through Stripe via `api/stripe/*` on Vercel, which the emulator doesn't run; test the
  payment step on a Vercel preview with Stripe test keys. Everything after payment is seeded.
