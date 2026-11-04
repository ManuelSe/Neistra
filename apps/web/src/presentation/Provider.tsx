import { useEffect, useState, type ReactNode } from "react";
import { PresentationController } from "./controller";
import { PresentationContext } from "./context";

export function PresentationProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => new PresentationController(window));
  useEffect(() => { controller.start(); return () => controller.dispose(); }, [controller]);
  return <PresentationContext value={controller}>{children}</PresentationContext>;
}
