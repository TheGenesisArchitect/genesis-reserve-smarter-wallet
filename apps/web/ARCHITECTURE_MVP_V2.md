# Genesis Reserve MVP v2 — Interactive Architecture Diagram

This diagram reflects the validated engineering corrections from `genesis-mvp-scope-v2.docx` and aligns with `LAUNCH_MVP_SCOPE.md`.

## Architecture Sign-Off Status

**Decision**: Conditional approval (target-state accurate; launch sign-off pending closure of listed gates).

**Pre-launch sign-off gates (must be resolved):**
- `BFF /api/gr/*` aggregate layer + feature flags + account ownership guard are Week 1 build targets and not fully implemented yet.
- `MoneyGram` remains a stub in remittance flow and must stay blocked from real users until live provider wiring is complete.
- `Euler eVault` requires on-chain address verification in contracts + deploy pipeline before final launch stamp.
- Expanded MVP features promoted from backlog (analytics, scheduled sends, batch operations, invoicing, mobile apps, partner API, white-labeling, yield strategy selection, audit logs) must be launch-ready and approved in launch gates.

Execution checklists: `GO_NO_GO_CHECKLIST.md` and `GO_NO_GO_CHECKLIST_CANARY.md`

```mermaid
flowchart LR
  EU[End User\n10k users]:::client
  PA[Partner Admin\n10 partners]:::client
  OPS[Genesis Ops]:::client

  subgraph FE[Next.js Frontend]
    DASH[Dashboard plus Yield UI]
    SEND[Send and Deposit Flows]
    HIST[History plus CSV]
    BELL[Notification Bell]
    ADMINUI[Admin Console - admin routes]
    PC[PartnerContext\nfeature aware]
  end

  subgraph BFF[Next.js BFF - API GR routes - WEEK 1 BUILD TARGET]
    AUTH[Auth Delegation\nPrivy JWT to partner and user claims]
    FLAGS[Feature Flag Middleware\npartner flags TTL 5m]
    RL[Rate Limit\n100 req per min per partner]
    D1[GET dashboard\nTTL 30s]
    D2[GET yield\nTTL 60s]
    D3[GET history\nTTL 10s]
    D4[POST send\nquote to screen to reserve]
    D5[POST deposit\nscreen to on chain deposit]
    D6[GET notifications\nTTL 10s]
    D7[GET accounts\nuser owned PTAs]
  end

  subgraph API[Genesis API Express]
    T[treasury service]
    R[remittance service\nMoneyGram or CCTP adapter STUB]
    L[ledger service]
    C[compliance service]
    Y[yield service plus harvest cron]
    N[notifications service\nEventBus subscriber]
  end

  subgraph DATA[Data and Infra]
    PG[(PostgreSQL)]
    PGB[PgBouncer\npool mode transaction\nmax client conn 500]
    RED[(Redis Cache)]
    KAF[(Kafka EventBus)]
  end

  subgraph EXT[External Integrations]
    MG[MoneyGram Ramps API STUB]
    CCTP[Circle CCTP fallback]
    OFD[Onfido and Chainalysis]
    ARB[Arbitrum One\nGenesisVault StrategyRouter ComplianceRegistry\nEuler eVault verification pending]
  end

  subgraph OBS[Observability]
    DD[Datadog\n4 error metrics]
    PD[PagerDuty]
    SL[Slack]
  end

  EU --> DASH
  EU --> SEND
  EU --> HIST
  EU --> BELL
  PA --> ADMINUI
  OPS --> ADMINUI

  DASH --> D1
  DASH --> D2
  SEND --> D4
  SEND --> D5
  HIST --> D3
  BELL --> D6
  ADMINUI --> D7
  PC --> FLAGS

  D1 --> AUTH
  D2 --> AUTH
  D3 --> AUTH
  D4 --> AUTH
  D5 --> AUTH
  D6 --> AUTH
  D7 --> AUTH

  AUTH --> FLAGS
  FLAGS --> RL

  D1 --> T
  D1 --> C
  D1 --> Y
  D1 --> L
  D2 --> Y
  D2 --> L
  D3 --> L
  D4 --> R
  D4 --> C
  D4 --> T
  D5 --> C
  D5 --> T
  D6 --> N
  D7 --> T

  T --> PGB --> PG
  R --> PGB
  L --> PGB
  C --> PGB
  Y --> PGB
  N --> PGB

  T --> RED
  R --> RED
  C --> RED
  Y --> RED

  Y <--> KAF
  N <--> KAF

  R --> MG
  R --> CCTP
  C --> OFD
  T --> ARB
  Y --> ARB

  API --> DD
  DD --> PD
  DD --> SL

  OWN[Account Ownership Guard\naccount id plus privy did match]:::control
  AUD[Audit Gate\nAUM cap less than or equal to 10M until audit complete]:::control
  DEMO[Demo Guard\nNo real users on stub corridor]:::control

  D7 --> OWN
  R --> DEMO
  ARB --> AUD

  classDef client fill:#0f172a,color:#fff,stroke:#334155,stroke-width:1px;
  classDef control fill:#1f2937,color:#fff,stroke:#64748b,stroke-width:1px;
```

## Read This Diagram as an Implementation Contract

- **BFF is aggregate-first**: one UI request composes multiple backend calls in parallel.
- **Partner-aware UX**: feature flags are resolved in BFF and surfaced through `PartnerContext`.
- **Send flow is provider-safe**: MoneyGram/CCTP must be real integration or explicit DEMO mode (never exposed to real users).
- **Scale path is explicit**: PgBouncer + Redis + indexes are mandatory before 1,000-concurrency load testing.
- **Security + governance gates**: account ownership middleware and audit AUM cap are launch controls, not backlog items.

## Expanded MVP Scope (Now Launch-Day In Scope)

- `Advanced Analytics`: ROI tracking, yield breakdowns by strategy, risk heatmaps.
- `Scheduled Sends`: recurring remittance create/edit/cancel flows.
- `Batch Operations`: multi-recipient sends with correct ledger handling.
- `Invoicing`: payment request generation and lifecycle tracking.
- `Mobile Apps`: native iOS/Android launch support.
- `API for Partners`: authenticated, rate-limited programmatic access.
- `White-Labeling`: partner branding configuration at runtime.
- `Yield Strategy Selection`: Conservative/Balanced/Growth selection and persistence.
- `Audit Logs`: detailed admin action logs with actor/time/action/resource metadata.

## Endpoint-to-Cache Matrix (from reviewed specs)

| BFF Endpoint | Aggregate Calls | TTL |
|---|---|---|
| `GET /api/gr/dashboard` | balance + yield snapshot + compliance + epoch + recent tx | `30s` |
| `GET /api/gr/yield` | yield snapshot + allocations + epoch + harvest history | `60s` |
| `GET /api/gr/history` | ledger entries (paginated) | `10s` |
| `POST /api/gr/send` | quote -> compliance screen -> reserve/finalize | no cache |
| `POST /api/gr/deposit` | compliance screen -> on-chain deposit | no cache |
| `GET /api/gr/notifications` | notifications feed query | `10s` |
| `GET /api/gr/accounts` | user-owned treasury accounts for account switcher | `30s` |

## Critical Data Model Additions

- `partner_feature_flags(partner_id, feature, enabled, config, updated_at)`
- `notifications(notification_id, user_id, type, payload, read, created_at)`
- `api_idempotency_keys(key, partner_id, response, expires_at)`
- `partner_rate_cards(partner_id, corridor, tx_fee_bps, fx_spread_bps, min_amount, max_amount)`
- `admin_sessions(session_id, partner_id, created_at, expires_at, ip)`
