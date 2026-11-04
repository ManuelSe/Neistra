// Select the presentation shell before loading any workspace/API/renderer code.
const session = /^#presentation=([\w-]+)$/.exec(window.location.hash)?.[1];
if (session) {
  void import("./presentation/entry").then(({ mountPresentation }) => mountPresentation(session));
} else {
  void import("./workspace");
}
