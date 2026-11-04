# Detached molecular presentation

Status: issue #97 implementation and focused C3 qualification complete; final
version/release gates are tracked under the
[approved contract](plans/issue-97-detached-presentation-viewer.md).

Open **Detach viewer** in the viewer quick actions to show the molecular canvas
in a separate read-only window. Activate it again to focus the existing window.
Move or maximize that window using the browser/OS. Use **F** or its fullscreen
button to enter/leave native fullscreen; browser exit controls remain available.
If opening is blocked, allow pop-ups for the local application.

Fullscreen access fades when idle and stays visible while focused. A subtle ring
shows the leader's pointer over the molecular view; it clears on leaving the view,
loss of source ownership or two seconds of inactivity. Letterboxing preserves its
position within the source image. Pointer feedback does not change selection.

Operate camera, selection, appearance and molecular tools in the main workspace.
The presentation displays the main canvas without toolbars, workspace panels or
editing controls. Its drag, wheel and molecular clicks cannot edit or navigate the
workspace. Existing molecular annotations and previews come from the same renderer;
it is not an independent molecular model or scientific result.
Uncommitted movement, placement and minimization output is identified by a compact
**Preview** badge. Measurements and interaction markers follow the main viewer's
existing pause/visibility rules during coordinate previews. Scientific warnings
and editing/calculation controls remain in the main workspace.

Output detail follows the main canvas. Different window shapes preserve the
complete source image with letterboxing; enlarging the window does not add detail.
Keep the main workspace visible and rendering. Hidden, unavailable or disconnected
sources obscure stale output with an explicit status. A stationary scene is valid;
it need not emit new frames. Child reload reconnects to its current owner. Reloading
or closing the main workspace ends the session; reopen from the workspace. Closing
the presentation releases its capture resources without changing the project.
Separate workspace tabs own separate presentation sessions. A copied presentation
URL without its owner cannot reconnect by discovering another workspace.
No remote sharing, recording, automatic monitor placement or independent
high-resolution rendering is included. Image export remains separate issue #128.

Qualification uses pinned desktop Chromium with real WebGL, including actual
context loss, project changes and responsive renderer remounts. See the
[evidence index](assets/detached-presentation/README.md) for completed gates and
remaining work; browser-family certification and reference-host throughput are
separate claims. Output requests at most 30 frames/second; actual delivery depends
on browser, rendering load and hardware. Large-scene tests measure work/resource
bounds, not a universal throughput guarantee.

The user-approved desktop check covers ordinary window movement/resizing,
maximization/fullscreen and different viewports. Moving to another monitor does
not require a separate physical-monitor test. No schema, migration, API,
chemistry, original-file or archive behavior changes.
