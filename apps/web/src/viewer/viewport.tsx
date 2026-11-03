import { ViewportCanvas } from "molstar/lib/mol-plugin-ui/viewport/canvas";

// Mount failures are reported by StructureViewer's application-owned alert.
const MissingCanvas = () => null;

export function NeistraViewport() {
  return <ViewportCanvas noWebGl={MissingCanvas} />;
}
