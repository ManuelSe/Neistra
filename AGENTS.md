# MolWeave repository instructions

Before making architectural or implementation decisions, read:

- `docs/PRODUCT_SPEC.md`
- `docs/PLAN.md`, when it exists
- `docs/PROGRESS.md`, when it exists
- `docs/DECISIONS.md`, when it exists

## Working principles

- Build a working vertical slice rather than disconnected placeholder features.
- Do not claim that an unimplemented feature works.
- Keep molecular state independent from the 3D viewer's internal state.
- Keep docking-specific logic outside the core application.
- Preserve original uploaded molecular files.
- Surface parsing, conversion, chemistry, and validation warnings.
- Keep changes scoped to the current milestone.
- Prefer maintainable, typed interfaces over quick one-off integrations.
- Add tests for significant domain logic and user workflows.
- Run the relevant lint, type-check, test, build, and end-to-end commands after each milestone.
- Fix validation failures before proceeding.
- Do not silently reduce requirements from `docs/PRODUCT_SPEC.md`.

## Progress tracking

Maintain `docs/PROGRESS.md` with:

- Current milestone
- Completed work
- Verification performed
- Known limitations
- Blockers
- Next action

Record important architectural decisions and their rationale in
`docs/DECISIONS.md`.

When a requirement is ambiguous, make the safest reasonable assumption, record
it in `docs/DECISIONS.md`, and continue unless the decision is irreversible or
materially changes the product.