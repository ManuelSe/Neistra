# Detached molecular presentation

Status: issue #97 C1 native capture slice qualified; lifecycle, pointer and final
release qualification remain pending under the
[approved contract](plans/issue-97-detached-presentation-viewer.md).

Open **Detach viewer** in the viewer quick actions to show the molecular canvas
in a separate read-only window. Activate it again to focus the existing window.
Move or maximize that window using the browser/OS. Use **F** or its fullscreen
button to enter/leave native fullscreen; browser exit controls remain available.
If opening is blocked, allow pop-ups for the local application.

Operate camera, selection, appearance and molecular tools in the main workspace.
The presentation displays the main canvas without toolbars, workspace panels or
editing controls. Its drag, wheel and molecular clicks cannot edit or navigate the
workspace. Existing molecular annotations and previews come from the same renderer;
it is not an independent molecular model or scientific result.

Output detail follows the main canvas. Different window shapes preserve the
complete source image with letterboxing; enlarging the window does not add detail.
Keep the main workspace visible and rendering. The final feature will explicitly
report paused/disconnected sources; that lifecycle qualification is still pending
at C1. No remote sharing, recording, automatic monitor placement or independent
high-resolution rendering is included. Image export remains separate issue #128.

C1 is qualified on pinned desktop Chromium with real WebGL. It does not establish
browser-family certification or reference-host throughput. No schema, migration,
API, chemistry, original-file or archive behavior changes.
