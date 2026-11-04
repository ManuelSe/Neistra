import { createContext, useContext } from "react";
import type { PresentationController } from "./controller";

export const PresentationContext = createContext<PresentationController | null>(null);
export const usePresentation = () => useContext(PresentationContext);
