# Plumber Uber

An on-demand plumbing marketplace, built incrementally around a server-authoritative API. The first implementation stage establishes identity, role enforcement, and the data-model boundaries; later stages add provider onboarding, dispatch, bookings, payments, and clients.

## Architecture

```text
apps/web        Next.js App Router customer, provider, company, and admin web experiences
apps/mobile     Expo Router customer and provider mobile experiences
services/api    FastAPI REST API, WebSockets, authorization, domain services, and provider adapters
services/worker Background work for offer expiry, notifications, and eligible payouts
infra           Deployment and local infrastructure configuration
```

The API is the authority for authentication, resource access, dispatch selection, booking state transitions, payment confirmation, and settlement eligibility. PostgreSQL is the durable source of truth. WebSockets and push notifications deliver events but cannot assign work or authorize actions. External map, messaging, and payment integrations are behind replaceable interfaces. Production database access uses Neon PostgreSQL; local tests use isolated SQLite databases.

### Core schema

All primary keys are UUIDs and timestamps are UTC. Money is stored as integer KES minor units (never floating point); coordinates use an indexed geographic representation. Access to precise locations and verification documents is restricted by resource-level authorization.

| Domain | Tables |
| --- | --- |
| Identity and organizations | `users`, `customer_profiles`, `plumber_profiles`, `profile_posts`, `companies`, `company_members` |
| Provider eligibility | `provider_documents`, `verification_reviews`, `service_categories`, `provider_services`, `service_areas`, `provider_availability`, `provider_locations` |
| Customer and work | `addresses`, `bookings`, `booking_offers`, `booking_status_history`, `booking_attachments`, `quotes`, `quotation_items` |
| Money | `payments`, `refunds`, `provider_earnings`, `platform_commissions`, `payout_accounts`, `payouts`, `idempotency_keys` |
| Trust and communication | `reviews`, `notifications`, `conversations`, `messages`, `disputes`, `audit_logs` |

The schema now creates `users`, `customer_profiles`, `plumber_profiles`, `profile_posts`, `companies`, `company_members`, `provider_availability`, `bookings`, `booking_offers`, `booking_status_history`, and `quotes`. Plumber identity documents are encrypted in storage and retrievable only through the administrator verification endpoint. Further domain tables are added alongside their owning service in subsequent stages, with foreign keys, uniqueness constraints, and query indexes in Alembic migrations.

### Booking state machine

Normal path: `REQUESTED -> SEARCHING -> OFFERED -> ACCEPTED -> EN_ROUTE -> ARRIVED -> INSPECTION -> QUOTE_PENDING -> QUOTE_APPROVED -> IN_PROGRESS -> COMPLETION_PENDING -> COMPLETED -> SETTLEMENT_PENDING -> SETTLED`.

`INSPECTION` and quote states are conditional; fixed-scope work may proceed to `IN_PROGRESS` without a quote. Additional work always requires a newly approved quote. Alternative terminal or exception states include `REJECTED`, `EXPIRED`, `CANCELLED`, `NO_PROVIDER_FOUND`, `PAYMENT_FAILED`, `DISPUTED`, `REFUND_PENDING`, and `REFUNDED`. The API validates every transition, records the acting user and timestamp, and uses database transactions/locking for provider claims.

### Payment trust model

Customer authorization/collection, provider earnings, and provider payout are separate records and state machines. Only a verified provider webhook (or a server-side provider status query where supported), checked for signature and idempotency, can confirm payment. Provider verification can alter the configured deposit or milestone policy; it never guarantees immediate transfer. Payout eligibility requires the applicable completion evidence, customer confirmation, reconciliation, and dispute checks. No escrow claim is made: settlement uses only payment-provider capabilities approved for the merchant account and jurisdiction.

## Stage 1: local API

Requirements: Python 3.11+.

```powershell
cd services/api
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[test]"
uvicorn app.main:app --reload
```

The API uses SQLite by default for local development. For a local PostgreSQL connection, put `DATABASE_URL` in `services/api/.env` (this ignored file is loaded automatically) or set it in the process environment; plain `postgresql://` URLs use the installed psycopg 3 driver. Set `SECRET_KEY` to a strong random secret outside local development. Apply schema migrations from `services/api` with `alembic upgrade head`; production startup does not create tables. Interactive API documentation is available at `/docs`. Public registration creates customer accounts only; provider, company, and administrator privileges are not self-selected.

Run the focused API tests from `services/api` with `python -m pytest`.

Payment initiation currently uses a development-only mock adapter. A payment remains pending until `POST /api/v1/payments/webhooks/mock` receives a valid HMAC-SHA256 signature in `X-Payment-Signature`; frontend redirects never mark it paid. Set `PAYMENT_WEBHOOK_SECRET` to a random secret of at least 32 characters in production. The mock adapter is disabled in production until a real provider adapter is configured. Confirmed customer funds remain separate from provider earnings; completion creates a held earning and commission ledger entry, with no automatic transfer or escrow claim.

## Stage 2: customer web booking

Start the API as described above, then run the web app from `apps/web`:

```powershell
cd apps/web
Copy-Item .env.example .env.local
npm run dev
```

The web app is available at `http://localhost:3000`. After sign-up or sign-in, customers and plumbers land on their profile dashboard. Customers can edit their name, bio, and photo; plumbers can add their legal name, bio, photo, service county and area, services, and experience. Plumbers activate when their required profile details are complete; ID upload is not required. Both account types can share photo posts. Profile photos and posts are limited to JPEG, PNG, or WebP images up to 4 MB. Apply the Alembic migrations before deploying profile changes. The web app proxies API requests server-side and stores the short-lived bearer token in an HttpOnly, SameSite cookie; it does not expose the token to browser JavaScript. Set `API_BASE_URL` in `apps/web/.env.local` when the API is not listening at `http://127.0.0.1:8000`.

## Stage 3: Expo mobile app

From `apps/mobile`, install the dependencies and start Expo:

```powershell
cd apps/mobile
Copy-Item .env.example .env.local
# Set EXPO_PUBLIC_API_BASE_URL in .env.local to your computer's LAN address.
npm install
npx expo start
```

Set `EXPO_PUBLIC_API_BASE_URL` to an API address reachable from the device before starting Expo. Use the computer's LAN address for a physical device; `127.0.0.1` refers to the device itself. The mobile app includes the Pipego homepage, customer/plumber dashboard views, customer and plumber profile editing, image posts, location-based plumbing requests, request status refresh, plumber application, provider availability, and job offer acceptance. The admin dashboard is a clearly labelled sample-data preview, not live analytics. Sign-in tokens are stored in Expo SecureStore. Foreground location permission is requested only when sharing a customer location or going online as a provider.

## Production deployment

The web app is a Next.js frontend for Vercel, the API is a FastAPI service for Railway, and the Expo app is built separately as an Android APK. Deploying the frontend does not build or host an Android app automatically.

### Railway API

Create a Railway service with its root directory set to `services/api`. The included `railway.toml` runs Alembic migrations before each deployment, starts Uvicorn on Railway's assigned port, and checks `/health`. Add a Railway PostgreSQL service and configure these variables on the API service:

- `DATABASE_URL`: Railway PostgreSQL connection URL.
- `ENVIRONMENT`: `production`.
- `SECRET_KEY`: a randomly generated secret of at least 32 characters.
- `PAYMENT_WEBHOOK_SECRET`: a randomly generated secret of at least 32 characters.
- `CORS_ORIGINS`: the exact production Vercel site origin, such as `https://your-site.vercel.app` (no trailing slash). Add any other trusted web origins as comma-separated values.

After deployment, confirm `https://<your-railway-domain>/health` returns `{"status":"ok"}`. The migrations must complete successfully before the API starts serving traffic.

### Vercel web frontend and APK download page

Import the repository into Vercel and set the project root directory to `apps/web`. Vercel detects the Next.js build automatically. Configure:

- `API_BASE_URL`: the Railway API origin, such as `https://your-api.up.railway.app`.
- `NEXT_PUBLIC_ANDROID_APK_URL`: `/downloads/pipego.apk` when hosting the APK from this Vercel project, or a permanent public HTTPS download URL.

The homepage links to `/download`. The download button appears when `NEXT_PUBLIC_ANDROID_APK_URL` is valid; otherwise, the page explains that the Android build is not yet published. After creating the APK as described below, for Vercel static hosting, put it at `apps/web/public/downloads/pipego.apk`, include it in the deployment, and redeploy. Configure the environment variable in Vercel for each environment where the download should be available. The app is not included in the repository as a binary.

### Android development build and APK

Create or sign in to an Expo account and initialize EAS for this app once from `apps/mobile`:

```powershell
npx eas-cli login
npx eas-cli init
```

Set `EXPO_PUBLIC_API_BASE_URL` to the public HTTPS Railway API origin and `GOOGLE_MAPS_API_KEY` to the Android Maps key in the EAS `development` environment. Build the custom development APK:

```powershell
npx eas-cli build --platform android --profile development
```

Install the finished build using its EAS install link or QR code. On the development computer, start Metro from `apps/mobile`:

```powershell
npx expo start --dev-client
```

Open the Pipego development app and connect to the running Metro server. The installed development build includes Pipego's native Google Maps integration and does not require Expo Go. The computer and device must be able to reach Metro; allow it through the firewall or use `npx expo start --dev-client --tunnel` if the network blocks LAN discovery. The API URL embedded in the build must also be reachable from the device; use Railway HTTPS for a cloud development build.

For Google Maps, enable billing and Maps SDK for Android in Google Cloud, then restrict the key to the `com.pipego.mobile` Android application and the SHA-1 certificate of the EAS development build. Use separate keys for development and production when practical. Keep the key out of committed files; an app-embedded Maps key is visible in the installed app and must be protected with platform/API restrictions.

For a standalone downloadable APK, set `EXPO_PUBLIC_API_BASE_URL` and `GOOGLE_MAPS_API_KEY` in the EAS `production` environment and build:

```powershell
npx eas-cli build --platform android --profile apk
```

Download the finished APK from EAS and host it at the URL configured as `NEXT_PUBLIC_ANDROID_APK_URL` (or copy it to `apps/web/public/downloads/pipego.apk` and redeploy Vercel). EAS account setup, Railway/Vercel project creation, production secrets, and the actual cloud deployments require account access and are not performed by this repository configuration.

## Delivery status

- Implemented API slice: identity and API-side role enforcement; plumber application/admin verification; availability and nearby dispatch; offers, booking transitions, quote approval; signed mock payment confirmation and held earnings.
- Implemented web slice: customer registration/sign-in, role-aware profile dashboards with profile editing and image posts, and a responsive plumbing request flow with location sharing and booking status refresh.
- Implemented mobile slice: homepage and customer registration/sign-in; customer booking/status flow and dashboard; plumber profile, provider availability, nearby offers and acceptance; profile editing and image posts for customers and plumbers; admin sample-dashboard preview.
- Remaining: live admin analytics and management workflows, company workflows, background offer expiry/retries, production maps/SMS/push/realtime, real payment and payout provider integration, refunds/disputes/notifications/chat, and deployment/security hardening.

Implemented API routes currently include profile read/update and image posts, administrator-only identity-document retrieval, provider application and verification, provider availability and offers, customer booking creation and participant access, offer acceptance, booking transitions, quote submission/approval, signed payment webhooks, and earnings statements. Dispatch currently offers each booking to the closest eligible verified provider within their configured radius; production push/realtime delivery, offer-expiry workers, multi-provider retries, and richer ranking are still pending.

External integrations and later-stage features are not represented as complete until their backend flow and tests exist.