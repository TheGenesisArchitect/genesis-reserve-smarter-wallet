# Institutional Workspace Setup

## Purpose

This workspace layout keeps the frontend, its colocated backend, and the infrastructure reference visible in a single VS Code session while preserving the BFF-first architecture.

## Workspace file

Open:

[GenesisReserve-Institutional.code-workspace](../GenesisReserve-Institutional.code-workspace)

## Included roots

- `frontend` → [genesis-privy-integration/genesis-privy](.)
- `backend` → [genesis-privy-integration/genesis-privy/gr/gr](gr/gr)
- `infrastructure-reference` → [genesis-infrastructure](../genesis-infrastructure)

## Why this is the recommended topology

- Frontend hooks and BFF routes can be validated against the real backend source.
- Backend handlers, migrations, and docker files are available without leaving the workspace.
- The infrastructure reference remains visible for contract addresses, deployment context, and architecture review.
- The frontend still consumes only `/api/gr/*` BFF routes; direct backend coupling is not introduced.

## Operating rules

### Keep this boundary
- Frontend components call hooks.
- Hooks call BFF routes under `src/app/api/gr/*`.
- BFF routes call backend services over HTTP or transform backend payloads.

### Do not do this
- Import backend service code into frontend app code.
- Share runtime-only backend modules directly into Next.js components.
- Bypass BFF contracts just because backend source is visible.

## Immediate benefits

- No more fallback guessing on backend response shapes.
- Easier contract lock and route implementation for:
  - compliance view
  - admin console
  - settings
- Faster end-to-end debugging from UI -> BFF -> backend handler.

## Suggested workflow

1. Open the multi-root workspace.
2. Run frontend from `frontend`.
3. Run backend/docker from `backend`.
4. Implement or adjust BFF routes in `frontend/src/app/api/gr/*` using visible backend handlers as the source of truth.
5. Keep shared response contracts aligned in:
   - [src/lib/bff.types.ts](src/lib/bff.types.ts)
   - [src/lib/validation.ts](src/lib/validation.ts)
   - [PHASE1_CONTRACT_LOCK.md](PHASE1_CONTRACT_LOCK.md)

## Phase 1 alignment

This setup is specifically intended to support the locked contracts documented in [PHASE1_CONTRACT_LOCK.md](PHASE1_CONTRACT_LOCK.md), especially the next slices:

- `ComplianceViewResponse`
- `AdminConsoleResponse`
- `SettingsResponse`

## Notes

- The workspace hides heavy generated folders like `.next`, `coverage`, `artifacts`, and `cache` to keep search and symbol navigation clean.
- The colocated backend under `gr/gr` is the preferred integration target because current local dev and docker commands already point to it.
