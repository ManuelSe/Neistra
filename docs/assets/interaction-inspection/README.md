# Interaction inspection qualification

Issue #152's source-bound tools prepare fresh candidate and exact-merged-commit
qualification. This directory currently contains tooling, not completed release
evidence. Historical observations elsewhere do not qualify the new implementation.

## Full release gate

The recipe preserves all 35 current release steps: frozen dependency installs;
disposable migration upgrade/downgrade/re-upgrade; Python/static/frontend/supervisor/
build/browser checks; version, dependency, persisted-schema, license and production
audits; legacy CLI; actual rich and connectivity readers in both directions and
both archive suffixes; and the three-process editing-state retention qualification.
Browser inventory and exact existing exclusions are checked against the actual
v0.32.0 qualification report. New tests execute; no new exclusion is implied.

Before generating a recipe, extract actual annotated-tag source `v0.32.0` into
`/tmp/neistra152-reader-0320`, verify its dereferenced commit is
`b8ecfdea49610d2d9ab611d4d68d86afc0c277c5`, and write the source receipt at
`/tmp/neistra152-reader-0320-source.json`. The receipt contains `tag`, `commit`,
and the `files` identity map from `qualification.py.txt::tagged_identities`.
The runner independently compares all selected extracted bytes with actual Git
tag blobs before execution and checks that both implementations stay unchanged.
The editing wrapper additionally checks five version sources, actual imported
module paths and hashes, the expected receipt, and exact preceding-writer versions.

From the owned issue worktree, after final version preparation:

```bash
.venv/bin/python docs/assets/interaction-inspection/release-recipe.py.txt c4-candidate1
```

Inspect and commit that new recipe before running the clean candidate gate:

```bash
.venv/bin/python docs/assets/interaction-inspection/qualification.py.txt \
  docs/assets/interaction-inspection/c4-candidate1-recipe.json
.venv/bin/python docs/assets/interaction-inspection/qualification-summary.py.txt \
  c4-candidate1
```

Use a new label for every diagnostic or retry and for exact merged qualification.
Never reuse a partial run as release qualification. The recipe defaults to current
0.33.0 and supports an explicit `--current-version` if release preparation resolves
a compatible version collision; the version audit still checks all five sources.
Its preceding release remains explicitly bound to verified v0.32.0.

## Isolation and interpretation

The recipe uses the owned virtual environment, ports 8230/8231/5393, fresh external
`/tmp/neistra152-<label>` stores, the existing read-only browser installation and
locked native toolchain. The runner refuses occupied browser ports and requires
a clean committed start. It records exact commands, environment, current/tagged
source identities, recipe/runner hashes and lossless compressed logs, stopping on
failure or source drift. It does not operate another session's server or data.

`NEISTRA_PERFORMANCE=0` retains every portable workflow and mandatory correctness,
resource and production-deadline assertion. A portable pass is not strict
reference-host timing qualification. New display measurements and specialist
review are separate evidence; neither may be inferred from recipe preparation.

The editing retention wrapper keeps historical 0.32.0/0.31.0 defaults for existing
callers. This recipe supplies explicit current/preceding versions, tag and full
commit for the actual 0.33.0/0.32.0 run. It retains all fifteen scientific state
cases, both archive suffixes, deep history/allocator checks, corruption controls,
and stale-publication refusals. It executes actual implementations in separate
processes; older re-export is not a claim of older new-operation authoring.

## Source-bound packaging and public readback

`release-evidence.py.txt` is the sixth frozen qualification tool. It must appear
in `qualification.py.txt::TOOLS` before both complete gates. It is not an
implementation pass, a publisher, or a substitute for the gate summary.

After a complete gate and its independently checked summary, package that exact
run using a fresh label. Preserve its external workspace until verification:

```bash
.venv/bin/python docs/assets/interaction-inspection/release-evidence.py.txt gate \
  --root "$PWD" --label c4-candidate1 \
  --output-dir "$PWD/docs/assets/interaction-inspection"
```

Each gate package includes all browser observations, external scientific native
observations, exact source/log/reader receipts, and the **entire synthetic editing
reader workspace**. That includes produced/retained/reopened live databases,
history and artifact stores, both exported archive families, expectations and
every process report/log. Only bytecode and named interpreter/tool caches are
excluded, with explicit paths in the packaged context. No ordinary user store,
API performance database, dependency installation or browser installation is
included. Source symlinks and path escapes are refused.

Gate parts target 80 MiB compressed and must remain below 95 MiB for repository
file limits. Every part uses sorted entries, fixed ZIP timestamps and a size/
SHA-256 manifest. Packaging independently verifies full current source, all
lossless gate logs, reader evidence hashes and every nested ZIP CRC/manifest.
Existing outputs and failed partial files are never overwritten. Determinism
applies to identical input bytes under the same compression implementation.

After protected merge, exact-master qualification and all seven final same-head
assessments, build the external public asset from both completed gate packages:

```bash
.venv/bin/python docs/assets/interaction-inspection/release-evidence.py.txt release \
  --root "$PWD" --version 0.33.0 --runtime MERGED_SHA --reviewed-head REVIEWED_SHA \
  --reviews /tmp/neistra152-final-reviews.json \
  --premerge-audit /tmp/neistra152-premerge-audit.json \
  --merge-receipt /tmp/neistra152-merge-verification.json \
  --candidate-package docs/assets/interaction-inspection/c4-candidate1-packaging.json \
  --master-package docs/assets/interaction-inspection/c5-master1-packaging.json \
  --output /tmp/neistra152-release/neistra-v0.33.0-qualification.zip
```

The review receipt names `candidate` and all seven `assessments`, each with that
candidate and PASS or justified NOT_APPLICABLE. The premerge receipt binds `head`,
`pr`, `base`, `all_seven_same_head`, and `review_receipt_sha256`. The merge receipt
binds `reviewed_feature_head`, the same `pr`/`comparison_base`, `merge_commit`,
`merged`, `reachable_on_remote_master`, and
`complete_reviewed_and_merged_trees_identical`. Obtain these facts through actual
review/remote readback; the packager checks their consistency without creating
or claiming the remote actions.

The release archive retains both complete gate packages, C1/C2/C3 checkpoint and
diagnostic evidence, current frozen tools, required documents and operation
receipts. Optional explicit supplemental evidence uses
`--evidence ARCHIVE-NAME=PATH`. Qualified candidate/master source digests must
match and reviewed/merged Git trees must be identical. No future release or
anonymous download is claimed by packaging.

Verify an existing local asset against its generated `.package.json` receipt:

```bash
.venv/bin/python docs/assets/interaction-inspection/release-evidence.py.txt verify \
  --archive /tmp/neistra152-release/neistra-v0.33.0-qualification.zip \
  --receipt /tmp/neistra152-release/neistra-v0.33.0-qualification.zip.package.json
```

After authorized publication, use a fresh destination for anonymous readback:

```bash
.venv/bin/python docs/assets/interaction-inspection/release-evidence.py.txt download \
  --url https://github.com/ManuelSe/Neistra/releases/download/v0.33.0/neistra-v0.33.0-qualification.zip \
  --receipt /tmp/neistra152-release/neistra-v0.33.0-qualification.zip.package.json \
  --output /tmp/neistra152-public/neistra-v0.33.0-qualification.zip
```

The request carries no Authorization header. The verifier requires the exact
repository/version/asset URL and checks downloaded size/SHA-256, every ZIP CRC,
all evidence/project manifests and verification counts before publishing the
local verification receipt. Retain all original workspaces until these checks
and the delivery closeout are complete.
