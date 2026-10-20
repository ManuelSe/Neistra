# Issue89 C3 local review

Implementer self-review, not independent approval. Reviewed preparation/optimization
separation, native force reconstruction, chemical/geometry keys, cache lifecycle and
quotas, source authority, artifact independence, cancellation and scoped documentation.

Consequential findings fixed: count manifest bytes in quota; trim on budget shrink;
handle malformed regular-file entries; check per-file/entry bounds before reading
native files for hashing; include prepared receptor libraries and charge provenance
in per-job model archives. Final nine cache/native-force checks and Ruff/mypy pass
after the last bound fix. The broader native gate passed232 Python cases; static/
frontend/build and16 browser cases/2 intentional mobile performance exclusions pass.

Real native energy/forces agree for cold/warm/moved-protein/corrupt-cache recovery;
changed ligand geometry and protonation reparameterize while compatible receptor
preparation is reused. Fixed model settings have distinct cache identity. Actual
three-pair prepared1STP preparation medians are5.468665s cold and0.385609s warm,
14.1819x; warm runs execute zero native preparation programs. Startup medians are
roughly6.38s cold and1.30s warm. These are compatible-input measurements, not a
promise for changed organic charge geometry or time-to-live-frame qualification.

One cooperative preparation lock serializes cold preparation across local workers;
optimization is outside it. Metadata/verified job-local copies survive cache eviction.
No pickle, cached molecular coordinates or force-field substitution. Native inpcrd
never supplies optimizer start coordinates. Known bundle/Vite disconnect advisories
are retained; no required workflow assertion failed. No structural migration/schema,
application dependency/version or physical-model change. Later live/acceptance and
actual0.20 reader/final release qualification remain pending.
