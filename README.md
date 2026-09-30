# SybilBuster

SybilBuster is an early-stage, real-time loan application relationship-risk demo. It surfaces shared-identifier evidence between applications so a reviewer can decide whether additional verification is appropriate. A risk band is not a finding that an applicant committed fraud.

This foundation uses synthetic inputs, configurable demo rules, and process-local storage. It is not a production fraud system and must not be used to make lending decisions.

## Architecture

- `frontend`: React, TypeScript, Vite, Tailwind CSS, and Socket.IO client. The dashboard contains the application form, evidence-based risk result, and live event stream.
- `backend`: strict TypeScript, Express, Zod validation, Helmet, configurable CORS, Socket.IO events, optional PostgreSQL persistence, CSV-seeded in-memory fallback, and optional Neo4j graph traversal.
- Investigation workflow: an interactive per-application graph with 3D and accessible list views, an Advanced Dashboard, chronological Timeline Replay, isolated What-if simulation, and deterministic Evidence Explanation.
- Risk and memory boundary: the existing risk engine calculates current scores from current signals; optional Hindsight adds historical context only and cannot change current assessments.
- `data/raw/`: fictional demo applicant and loan-application CSVs; no public or customer data is included.
- `data/synthetic/`: clearly labeled demo relationship identifiers, including reserved documentation-only IP addresses.
- `data/processed/`: reserved for future reproducible transformations; not populated or consumed by the application.
- `scripts/validate-dataset.mjs`: offline CSV structure, ID, required-field, and relationship-reference validator (`npm run validate:data`).
- `database/schema.sql`: PostgreSQL-ready relational schema; no database connection is required to run the demo or validate CSVs.
- `data/README.md`: dataset provenance, synthetic-data policy, validation, and limitations.
PostgreSQL persistence remains available when configured and reachable. Without it, the API runs with the checked-in synthetic fixture and process-local application storage. Neo4j is optional; without a working connection, graph queries use the same synthetic fixture and current session data.

## Local setup

Requirements: Node.js 20.19+ or 22.12+ and npm 10+. PostgreSQL and Neo4j are optional integrations.

```powershell
npm install
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
npm run dev
```

Open the Vite URL printed by the frontend (normally `http://localhost:5173`). The API defaults to `http://localhost:4000`. To build both workspaces, run `npm run build` from the project root.

The API starts without PostgreSQL and uses the synthetic dataset plus in-memory storage; new records and assessments in this mode last only until process restart. To enable PostgreSQL persistence, configure `DATABASE_URL` or all five `PG*` variables in `backend/.env`. Never commit credentials. `DATABASE_URL` takes precedence when non-empty.

`npm run db:init` and `npm run db:seed` remain available for configured PostgreSQL installations. `db:seed` validates the STEP 2 CSV fixtures before importing them. These commands are not needed for the default in-memory demo.

Use synthetic values only. The application reads the checked-in fixtures for database-free graph lookup and optional Neo4j import; PostgreSQL seeding remains explicit. No public or customer dataset is bundled.

Validate the fixture structure independently with `npm run validate:data`.

## Backend setup

```powershell
Copy-Item backend/.env.example backend/.env
npm run dev --workspace backend
```

The server listens on `PORT` (default `4000`) even if PostgreSQL or Neo4j is unavailable. It uses in-memory storage and synthetic graph lookup as needed, and only reports Neo4j active after connectivity, schema setup, and fixture import succeed. `CORS_ORIGIN` accepts comma-separated allowed origins. Configure `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, and optionally `NEO4J_DATABASE` to enable graph persistence. Demo thresholds and weights remain in `backend/.env.example`; default-history settings are synthetic and unverified.

Database commands from the project root:

```powershell
npm run db:init
npm run db:seed
npm run validate:data
```

## Frontend setup

```powershell
Copy-Item frontend/.env.example frontend/.env
npm run dev --workspace frontend
```

Vite serves the dashboard on port `5173` by default. In development, an empty `VITE_API_URL` uses `http://localhost:4000`; the root `npm run dev` command starts both workspaces.

## Deployment Preparation (Vercel + Render)

This deployment keeps the current synthetic/in-memory architecture. PostgreSQL and Neo4j are not required. Applications and assessments created at runtime are process-local and are lost when the Render service restarts or scales to another instance.

### Vercel frontend

Create a Vercel project for the `frontend` workspace and use Vite with `dist` as the output directory. Set these project environment variables for each environment you deploy:

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | Required. The public Render backend origin, such as `https://sybilbuster-api.onrender.com`, without a trailing slash. |
| `VITE_SOCKET_URL` | Optional. The Socket.IO server origin. Leave unset when Socket.IO uses the same Render origin as the API. |

Vite embeds `VITE_*` values into public client assets. Use only public URLs here; never set `HINDSIGHT_API_KEY` or other secrets in Vercel. `VITE_API_URL` must be set for production; localhost is only the development fallback. Rebuild/redeploy the frontend after changing these values.

### Render backend

Create a Render Web Service with the repository root as its root directory. Use:

```text
Build command: npm ci && npm run build --workspace backend
Start command: npm run start --workspace backend
```

The backend binds to `0.0.0.0` and uses Render's assigned `PORT`. Configure these service environment variables:

| Variable | Required | Value |
| --- | --- | --- |
| `FRONTEND_URL` | Yes | Exact deployed Vercel origin, for example `https://sybilbuster.vercel.app`; comma-separate additional trusted origins if needed. |
| `HINDSIGHT_ENABLED` | No | `false` for the first deployment. |
| `HINDSIGHT_API_URL` | No | Only needed if Hindsight is later enabled. |
| `HINDSIGHT_API_KEY` | No | Only needed if Hindsight is later enabled; keep it in Render only. |
| `HINDSIGHT_BANK_ID` | No | Only needed if Hindsight is later enabled. |

Render supplies `PORT`; `FRONTEND_URL` replaces the development default. If `FRONTEND_URL` is unset locally, CORS allows `http://localhost:5173`. The older `CORS_ORIGIN` variable remains a compatibility fallback. Do not configure `DATABASE_URL`, `PG*`, or `NEO4J_*` for this deployment.

The Vercel client connects directly to the Render Web Service for HTTP and Socket.IO; `VITE_SOCKET_URL` can point elsewhere if the socket endpoint is separated later. Socket.IO requires a long-running backend that supports WebSocket upgrades, not a serverless function. Clients should reconnect after service restarts; in-memory data is not shared across instances. Check `/api/health` after deployment.

No `vercel.json` or `render.yaml` is required for this workspace setup. Vercel's Vite project settings and Render's service settings provide the needed build, start, and environment configuration.

## API endpoints

All request and response bodies use JSON.

### `GET /api/health`

Returns `{ "status": "ok", "service": "SybilBuster API" }`.

### `POST /api/applications`

Accepts `applicantId`, `name`, numeric `loanAmount`, `income`, `employmentLength`, `deviceId`, valid `ipAddress`, `upiId`, and `bankAccountId`. Returns the created application, including its generated `id` and `createdAt`, with status `201`. Invalid input returns `400` with validation details.

### `POST /api/risk/analyze`

Accepts `{ "applicationId": "<application UUID>" }`. Returns `applicationId`, `riskLevel` (`LOW`, `MEDIUM`, or `HIGH`), `riskScore` (0–100), `signals`, `evidence`, and `timestamp`. The score is the capped sum of enabled demo weights; thresholds and weights are configurable. Unknown applications return `404`.

### `POST /api/risk/investigate`

Accepts the same application ID and returns `{ "assessment": <current assessment>, "historicalContext": <context status and memories> }`. Historical context is additive and does not affect the risk assessment.

### `POST /api/risk/simulate`

Accepts an application ID and a detected `signalType`. Returns an original assessment and a separately recalculated simulation; neither simulation result is persisted.

### `GET /api/graph`

There is no graph collection endpoint at the root path; it returns `404`. Use the per-application endpoint below. A global graph response contract is not currently defined.

### `GET /api/graph/:applicationId`

Returns the application, connected applicants, shared devices/IPs/UPI/bank-account identifiers, relationship paths, and grouped evidence. It queries Neo4j when available and otherwise uses the synthetic fixture plus applications in the current process.

Socket.IO broadcasts `application.created` when an application is stored and `risk.updated` after an assessment completes.

## Hindsight Historical Investigation Memory

Hindsight provides historical investigation context; the existing risk engine remains responsible for the current risk assessment. Hindsight is an optional memory layer and never calculates or changes current scores, signals, graph evidence, assessments, or the deterministic Evidence Explanation.

The investigation workflow calls `POST /api/risk/investigate`. SybilBuster first runs its existing risk engine, then recalls prior synthetic investigation memories using only signal types and shared-identifier relationship types. It returns `{ assessment, historicalContext }`; the assessment is unchanged. After recall, SybilBuster asynchronously retains a normalized summary in Hindsight. Retain content contains only the assessment timestamp and risk level, signal/identifier/relationship types, and evidence/relationship counts. Applicant names, financial values, raw device/IP/UPI/bank identifiers, and connected application IDs are not sent. The UI labels recalled items as historical context and explains that similarity does not determine the current assessment.

Hindsight is disabled by default. To enable Hindsight Cloud, configure these values in `backend/.env`:

```dotenv
HINDSIGHT_ENABLED=true
HINDSIGHT_API_URL=https://api.hindsight.vectorize.io
HINDSIGHT_API_KEY=your-server-side-api-key
HINDSIGHT_BANK_ID=sybilbuster-demo
```

The backend uses the official `@vectorize-io/hindsight-client`. Keep the API key server-side and use only synthetic/demo investigation data. When Hindsight is disabled, the API returns historical context status `disabled` without making a Hindsight request. When recall or retain is unavailable, current risk analysis continues; recall status is `unavailable`, not an empty result. PostgreSQL remains optional for SybilBuster and the existing synthetic/in-memory fallback is unchanged.

## Current limitations

- In-memory applications and assessments are cleared when the backend restarts. PostgreSQL persistence is optional and must be configured separately.
- PostgreSQL history is not yet production-hardened with retention policy, authentication/authorization, or operational backup configuration.
- Neo4j integration is optional; graph queries fall back to the fixture and current in-memory session when it is not configured or reachable.
- Risk weights and thresholds are illustrative configuration, not calibrated predictors. Scores are not probabilities.
- Optional default-history signals are manually configured demo IDs only. No credit history, real applicant, or financial records are queried.
- No authentication, authorization, rate limiting, production observability, retention controls, or lending-decision workflow is included.
- The dashboard, 3D graph, timeline, simulation, and historical memory are demo implementations; they have no production availability or real-time guarantees.

## Future roadmap

1. Public dataset ingestion, subject to license and permitted-use review.
2. PostgreSQL operational hardening and managed migrations.
3. Neo4j graph operations and resilience hardening.
4. Clearly labeled synthetic relationship generator.
5. Expand graph analysis with traceable evidence and reviewable paths.
6. Expanded real-time dashboard.
7. Production hardening for the graph, dashboard, timeline, simulations, and historical-memory lifecycle.
8. Authentication, authorization, retention/deletion controls, monitoring, and operational backups.
9. Secure deployment and operational runbooks.