# YeneEta API v1

Base URL: `http://localhost:3435`

All JSON responses include an `X-Request-Id` header. Send `Accept-Language: en` or `Accept-Language: am` (or `?lang=am`) for localized messages. Validation and application errors include stable `code` and `requestId` fields.

## Authentication

- `POST /auth/otp/request` — `{ "phone": "+251911234567" }`
- `POST /auth/otp/verify` — `{ "phone": "+251911234567", "code": "123456" }`
- `POST /auth/refresh` — refresh-token cookie to a new access token
- `POST /auth/logout` — clear the refresh session
- `POST /admin/auth/login` — `{ "phone": "+251911000001", "password": "..." }`

Access tokens are sent as `Authorization: Bearer <token>`. OTP values are cryptographically generated, bcrypt-hashed, attempt-limited and persisted in PostgreSQL. `DEMO_OTP_ENABLED=true` permits code `123456` only outside production.

## Participant profile

- `GET /users/me`
- `PATCH /users/me` — `{ "fullName": "Abel Tadesse", "preferredLanguage": "am" }`
- `GET /tickets`
- `GET /payments/mine`
- `GET /payments/:id`

## Public raffles

- `GET /raffles?status=open&limit=20&offset=0`
- `GET /raffles/:id`
- `POST /raffles/:id/tickets` — `{ "quantity": 1, "paymentGateway": "chapa" }`

Purchases allow 1–5 tickets. Pending checkout capacity is reserved for 15 minutes under a raffle row lock. Payment confirmation and ticket-number issuance occur in one database transaction, preventing duplicate tickets and overselling under concurrent requests.

## Super Admin raffles

- `GET /admin/raffles`
- `GET /admin/raffles/:id`
- `POST /admin/raffles`
- `PATCH /admin/raffles/:id` — update editable prize and ticket data
- `PATCH /admin/raffles/:id/status` — owner-only lifecycle transition
- `PATCH /admin/raffles/:id/deadline` — owner-only, reasoned deadline extension

Lifecycle transitions are server-controlled:

`draft → open → locked → awaiting_trigger → drawing → completed`

Active stages may be cancelled by the Platform Owner. Ticket price, quota and per-participant limit cannot change after the first ticket is sold. Deadline extensions are written to `raffle_extensions`.

## Super Admin operations

- `GET /admin/dashboard`
- `GET /admin/users`
- `PATCH /admin/users/:id/suspend`
- `GET /admin/payouts`
- `PATCH /admin/payouts/:id`

## Database setup

Run migrations in numeric order. Existing databases must apply `003_user_language.sql` and `004_seed_admin_password_fix.sql`. Fresh databases may run all migrations safely; migration 004 is a no-op when the corrected seed hash is already present.
