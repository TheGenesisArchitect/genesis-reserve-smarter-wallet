## Summary

<!-- What does this PR do? 2-3 bullets max. -->

- 
- 

## Type of Change

- `[ ] Bug fix`
- `[ ] New feature`
- `[ ] Refactor / cleanup`
- `[ ] Infrastructure / DevOps`
- `[ ] Documentation`

## Checklist

- `[ ]` TypeScript strict check passes (`npx tsc --noEmit` in apps/api and apps/web)
- `[ ]` No new `any` types without justification
- `[ ]` State-changing API endpoints include `Idempotency-Key` enforcement
- `[ ]` No private keys, `.env` files, or secrets committed
- `[ ]` If touching on-chain logic — tested against Arbitrum Sepolia first

## Testing

<!-- How did you verify this change? Screenshots, curl commands, test output. -->

## Deployment Notes

<!-- Anything the operator needs to do after merging (migrations, env vars, contract upgrades)? -->
