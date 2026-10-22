# Interrupted candidate diagnostics

Both interrupted candidate attempts are preserved byte-for-byte in
[c5-interrupted-candidates.zip](c5-interrupted-candidates.zip), with59 files,
ZIP CRC checks and an internal SHA256.json manifest. Archive SHA256:
`48a9d315f5f2b89f6d7477823d65ef39986f1ffccd3a4fbb9aca0832897780fe`.

These are **not passing release evidence**. Candidate1 stopped after the C/N
mirror-stereo counterexample; candidate2 stopped at obsolete release-journey
counts. The full passing qualification is the separate c5-candidate-3 gate.
Archive member names retain their original c5-candidate-1/2 prefixes, and gate
records retain exact commands/log hashes/source identities. Extract into this
asset directory to reconstruct original diagnostic paths, or inspect with a ZIP
reader. No production/test source or recorded diagnostic bytes were changed.

Bundling these diagnostics keeps the final PR below GitHub's300-file diff limit;
final passing evidence and source remain individually reviewable. The original
individual assets also remain in earlier checkpoint history.
