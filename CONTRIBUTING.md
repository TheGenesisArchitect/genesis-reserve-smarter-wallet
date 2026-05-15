# Contributing to Genesis Reserve

## Getting Started

1. Fork the repo and clone locally
2. Follow the [Quick Start](README.md#quick-start) in the README
3. Create a feature branch: `git checkout -b feat/your-feature`

## Development Workflow

### TypeScript — strict throughout

Both apps run with `"strict": true`. Before any PR:

```bash
# API
cd apps/api && npx tsc --noEmit

# Web
cd apps/web && npm run typecheck
```

Zero errors required. No `@ts-ignore` without a comment explaining why.

### API Conventions

| Rule | Detail |
|---|---|
| Idempotency | Every `POST`/`PATCH`/`DELETE` must check `Idempotency-Key` header |
| Auth | Use existing `authenticateApiKey` / `authenticateAdmin` / `authenticateUser` middleware |
| Errors | Use `ApiError` class — never send raw `500` with stack traces to clients |
| Logging | Use `logger.info / .warn / .error` — never `console.log` |
| DB | Use parameterized queries via `query()` helper — no string interpolation |

### Database Migrations

Migrations live in `apps/api/db/migrations/` and are numbered sequentially (`013_...sql`).  
Migrations are **irreversible** in production — design accordingly (add columns, don't rename; new table, don't drop old).

### Smart Contracts

Contract changes are separate from this repo. The ABIs in `apps/api/src/contracts/` and `apps/web/src/abis/` are generated artifacts — do not edit by hand.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add gasless withdrawal via paymaster
fix: correct idempotency key lookup race condition
chore: update zod to 3.23.0
docs: add CCTP flow to README
```

## Pull Request Process

1. Open a PR against `master`
2. Fill out the PR template completely
3. CI must pass (TypeScript + lint + build)
4. One approval required from @TheGenesisArchitect
5. Squash merge preferred for feature branches
