# Issue #99 complete-diff review before release preparation

Review provenance: implementer self-review, not independent approval.
Base: `75754343c0c6f7031afc282e2b7c1e28ac52333a`; branch checkpoints through
M3 `6049d42`, followed by the reviewed 0.27.0 preparation changes.

Reviewed package moves/aliases/source-root bridges, API/settings/archive transport,
launcher/native/test configuration readers, UI state, migration/dependency/version
sources, tests and current versus historical documentation. The reproducible
runtime comparison records all90 original implementation/resource files after
explicit namespace/private-marker/version normalization. No unreviewed logic
change remains. Eight transport/configuration/registry/native-config files have
intentional reviewed differences; no numerical/chemistry algorithm changes.

Consequential findings resolved:

- Delegated legacy demo package exports could become a module after leaf import.
  Reproduced identity failure, corrected both entry points, and added both-order/
  old-source-root package-singleton regressions.21 alias/job cases pass.
- A launcher-injected data default would bypass old-store discovery. It is removed;
  all Python consumers use the shared resolver. Invalid/ambiguous/broken paths fail
  without replacing data; migration/reopen tests preserve an existing project.
- Explicit broken directory links needed validation before `resolve()`; covered by
  a regression. Canonical invalid values never fall back; conflict logs omit values.
- Current setup commands must not force `.neistra` over a legacy default store.
  Documentation now delegates defaults to the shared resolver; explicit isolation
  is retained for qualification. Historical tagged-reader procedures stay intact.
- Initial archive disclosure needed compact text and larger touch targets. Native
  keyboard/axe/theme/layout checks now cover the expanded disclosure and44px mobile
  targets; screenshots were visually inspected. Legacy naming remains secondary.

Compatibility review confirms unchanged route/payload behavior except an additive
literal archive filename option, defaulting to legacy for old clients. New UI
requests the new suffix; integration tests prove exact archive-byte equality.
MIME/job/plugin/model IDs, discovery group and workspace key remain. Old configured
plugin targets resolve to the same singleton; independent conflicting registrations
still fail. Original uploads, author data, scientific warnings and historical
provenance are not rewritten. Migration files are byte-identical to base; schema
versions remain2/1 and head0014. Dependency records excluding the renamed/versioned
virtual root are identical. All five application version sources agree on0.27.0.

Actual v0.26.2 and final0.27.0 reader preflight passes both ways with verified
module roots. It proves original/coordinate/history/scene/selection/surface/job
preservation and archive remapping. The actual preceding HTTP handler rejects the
new suffix but accepts identical content under the legacy filename, exactly as
represented by the compatibility option. The preflight uses uncommitted preparation
and does not substitute for clean final-candidate or exact-master qualification.

702 local documentation links resolve. The residual-name audit reports no
unexpected canonical implementation token; retained references have compatibility,
historical or user/scientific-fixture dispositions. No speculative alias removal,
public packaging, physical data migration or scientific expansion was introduced.
No unresolved consequential finding at this review. Required remote checks/reviews/
conversations and the full clean final-version gate still block merge/publication.


## Complete-gate correction review

Candidate1 stops after1330 Python passes and one missing-log failure. A separate
fail-first test proves migration bootstrap disables the already-created config
logger. `fileConfig(..., disable_existing_loggers=False)` preserves application
warnings; historical migration files, root levels/format and schemas stay intact.
184 focused cases and static/type checks pass; no assertion was reduced. Explicit
legacy configured plugin-target execution also passes the existing real spawned
completion/provenance/result-import/Undo workflow. The initial ad-hoc fixture-schema
omission is documented separately. Candidate2 must repeat the entire clean gate.


## Native instrumentation correction review

Candidate2's first styled-ammonia failure is a stale private-marker lookup in two
harness readers and two exact-tag assertion files. The observed layer is undefined;
the underlying requested H edit succeeds. Correct those strings to the actual
renamed runtime marker, without changing exact membership/color/mesh assertions.
Strengthen the audit against retired private markers in all live code/tests.
24 focused hydrogen/surface/branding native workflows pass on both layouts, plus
374 frontend/static/build checks. Known-failure trace and intentional interruption
summary are retained; candidate2 is not a complete passing gate. Product runtime
is unchanged fromdfde33f. Candidate3 must qualify the corrected tests completely.
