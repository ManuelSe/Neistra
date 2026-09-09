# Neistra repository instructions

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

## Issue delivery workflow

GitHub issues are product and engineering inputs, not automatically binding implementation specifications.

For substantial issues and feature requests:

* Create an approved feature plan under `docs/plans/issue-<number>-<slug>.md`.
* Do not replace the global `docs/PLAN.md` with an issue-specific plan.
* Treat the approved feature plan as the implementation contract.
* Record project-level progress in `docs/PROGRESS.md`.
* Append material architectural decisions to `docs/DECISIONS.md`; do not silently rewrite accepted decisions.
* Work on a dedicated `feat/issue-<number>-<slug>` or `fix/issue-<number>-<slug>` branch.
* Never implement directly on `master`.
* Complete coherent, independently verifiable checkpoints.
* Commit passing checkpoint states using Conventional Commits.
* Do not create empty checkpoint or milestone commits.
* Run focused validation after each checkpoint and the complete release gate before opening or merging a pull request.
* Open a pull request that documents implemented, simplified, deferred, and rejected issue requirements.
* Review the complete diff and address consequential findings before merge.
* Do not bypass branch protection, required reviews, status checks, or unresolved review conversations.
* Determine the SemVer impact from actual compatibility and user-visible behavior, not only from issue labels.
* Update all authoritative version sources in the pull request.
* Create an annotated `v<version>` tag and GitHub release only from the verified merged commit on `master`.
* Publish release notes and a final issue reply that clearly explain scope decisions and remaining follow-up work.
* Never claim that a branch, pull request, issue comment, tag, merge, or release exists unless it has been verified remotely.
