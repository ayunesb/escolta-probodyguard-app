# Escolta Pro functional demo

[Open the shareable test version](https://escolta-pro-demo.vercel.app).

The normal sign-in form remains at the top, with test-role access at the bottom. Choose Client,
Protector, Company or Admin to explore. English and Spanish are available.

This is a local simulation of the app, with no production backend connection. Each browser gets its
own fictional data. Bookings, chats, test accounts, uploads and changes persist in IndexedDB through
refreshes. Tabs in the same browser share data; sign-in sessions are kept per tab. Different people
opening the public link have independent sandboxes.

## Working flows

- **Booking:** browse and filter verified guards, view profiles, choose protection/vehicle options,
  team size, duration, local calendar date, hour/minute, pickup, destination and stops. Pin pickup on
  the map. Dates and overnight end times use local time.
- **Payment:** choose the successful or declined test card. Retry declines without creating another
  charge. The local payment handler recomputes the price from the protector's rate and confirms once.
  Paid bookings appear in the assigned protector's job list and the company/admin views.
- **Service:** accept, decline, reassign, cancel, go en route, validate the client's six-digit code,
  follow a simulated moving map marker, send two-way chat, complete and rate the job. Wrong codes
  cannot start a service. Ratings retain category scores; job counts and dashboards update.
- **Accounts:** local signup, verification and password-reset flows; company-created guard accounts
  and CSV import. Open **Demo controls** for verification/reset links instead of checking real email.
  Sample accounts initially use `EscoltaDev!2026`; newly created accounts use the password you set.
- **Operations:** edit protector rates, profile and availability; upload, preview and remove local
  test images; review/approve/reject KYC; inspect the audit trail; search/edit/suspend/reinstate users;
  review analytics; simulate full refunds of cancelled/declined paid bookings; export CSV/JSON.
- **Safety:** SOS creates a local admin alert that can be resolved or marked a false alarm. Calls,
  emails and other contact actions are recorded in the local inbox. Nobody is contacted.
- **Reset:** Demo controls can switch to any test person or restore the original fixture, clearing
  test records, files, notifications and local rate-limit counters.

Use fictional information and test files. GPS, geocoding, payments, notifications and document review
are simulations. Address lookup recognizes demo cities and otherwise supplies the Playa del Carmen
sample point; the map pin can be placed manually. The demo is not evidence that production payment
processors, identity checks, email, push notifications or mobile devices have been integrated.

## Isolation and deployment

`expo/constants/demo.ts` gates the web-only simulator. In demo exports, Metro replaces Firebase SDK
imports with `expo/demo/firebase.js`. Normal exports retain the real SDK and do not open the sandbox
storage. Runtime code does not send demo activity to Firebase, Stripe or messaging providers.

From `expo/`, with Node 22 and dependencies installed:

```sh
npm run build:demo
vercel deploy --prebuilt --prod
```

Deploy only the prebuilt static output to the `escolta-pro-demo` Vercel project. Do not use plain
`vercel deploy` for this project: the normal application build expects the real backend.

The export script ignores environment files, strips inherited `EXPO_PUBLIC_*` settings and generates
`.vercel/output` with static files only. No server functions or environment files are uploaded.
CSP permits same-origin assets, local data/blob files and OpenStreetMap tiles, while blocking remote
backend calls. Browser location, camera, microphone and payment permissions remain disabled.
Map tiles are the only external data used by the demo. No device GPS is requested.

For a real launch, follow the separate backend deployment requirements in `HANDOFF.md`.

## Verification - 24 September 2026

- 118 automated tests in 12 suites pass, including real booking-service transitions against the local
  adapter with network access forbidden. Coverage includes all four roles, wrong credentials,
  verification and reset links, secondary company auth, payment decline/retry/idempotence, canonical
  repricing, wrong/right start codes, completion/rating, reassignment, cancellation/refund, queries,
  timestamps and reset. Refunds preserve rejection/cancellation history and prevent reusing a refunded
  booking; those records appear under Past bookings. Calendar cases cover leap
  years, month/year boundaries and overnight dates.
- App TypeScript, changed-file ESLint, Cloud Functions compilation, normal web export and demo web
  export pass. Normal backend credentials and deployments are unchanged.
- Browser-tested: future-month scheduling, armored booking, payment decline/retry, confirmation,
  refresh persistence, two-way chat, protector acceptance/en-route, wrong/right start code, tracking,
  SOS/admin resolution, completion, rating, roster creation/CSV import, local upload persistence,
  KYC approval/audit trail, rate/profile/availability edits, suspension/reinstatement, analytics,
  simulated refund and explicit hour/minute selection. Calendar layout checked at 375px width.
- Public release smoke checks verify the deployed sign-in/test panel, role access, scheduling controls
  and static route availability. Production services and native device behavior are outside this
  browser-demo verification.
