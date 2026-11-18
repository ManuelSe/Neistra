# Historical project migration fixture

`v2-rich-project-0014.zip` was produced by actual annotated v0.33.0 source at
`d8636064263f6221c402665da52a4a1738570845`, using the locked dependencies and its
`build_rich_project` helper. The executed source is retained as
`v2-rich-generation.py.txt`; absolute paths describe the isolated generation run.
Only synthetic fixtures are included. The unused failed generation directories
were preserved; no development or live user store was copied.

ZIP SHA-256: `0168e5256b44b1334262bb0f62f31ad3527d66e83cc369832e67c23e4f2acab4`.
Its internal manifest records every database/artifact byte hash and size, the
actual source identity and table counts. It contains one project, two entries,
four original/current artifacts, ten commands with checkpoint/redo state, a group,
saved selection, measurement and scene. The migration head is0014 and no camera
preference exists. The restore helper validates all members before use.

Historical0015tests retain their original0014→0015→0014→0015camera operations,
reflected row equality and independent original/current byte comparisons. They
use this real historical fixture because the current project ORM intentionally
requires the explicit0016storage boundary. Other old migration fixtures use the
separate frozen pre-0016mapper registry. These are migration test fixtures, not
current application implementations or a completed release qualification.
