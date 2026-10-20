# Camera-publication checkpoint review

Local implementer self-review, no independent-review claim. Native negative
control proves8 duplicate camera callbacks on stationary hover; the correction
filters the existing application snapshot while preserving actual camera changes
and initial subscriber publication. No new public interface/store field.

Expanded gate:305 frontend/29 focused,83 native browser cases /11 intentional
exclusions, static/build/diff and unchanged1STP budgets pass, no retries/failures.
Both-theme hover now asserts zero extra camera callbacks. Added blur assertion
passes3 native hover cases /3 fine-pointer exclusions with lint/types/diff; fresh
trusted native hover and viewer exit remain separately checked.

Reviewed diff for ownership/disposal, stale pose caching, navigation/movement/
remount regressions, scope/dead paths, scientific and migration implications.
Publication snapshot uses existing exact CameraState fields, retains only one
current pose and releases with its subscription. No remaining consequential
checkpoint finding. Fresh complete candidate and exact-master gates are required.
