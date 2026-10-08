# Contributing to Agentkey

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new capability
- `fix:` bug fix
- `docs:` documentation only
- `chore:` tooling / scaffold / deps
- `test:` tests only
- `refactor:` no behavior change

Examples:

```
feat(api): add stub issue and resolve routes
fix(crypto): fail closed when proof is empty
docs: document register → verify example
```

## Branches & PRs

1. Branch from `development`
2. Open a PR **into `development`**
3. Keep secrets out of git (use `.env.example` placeholders only)

## Local checks

```bash
pnpm install
pnpm typecheck
pnpm test
```
