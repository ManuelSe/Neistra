import type { InteractionLigandCandidate } from "./target";
import type { InteractionAppearance, InteractionChoices, InteractionKind } from "./types";

export type InteractionTargetMode = "all" | "ligand" | "selection";
export interface InteractionTargetView {
  mode: InteractionTargetMode;
  label: string;
  message: string | null;
  ligandKey: string;
  candidates: readonly InteractionLigandCandidate[];
  canCaptureSelection: boolean;
  captureUnavailable: string | null;
  selectionChanged: boolean;
  needsUpdate: boolean;
}
export interface InteractionCategoryView {
  detected: number | null;
  shown: number | null;
  coverage: "complete" | "partial" | "unavailable" | null;
}
export interface InteractionContactView {
  key: string;
  kind: InteractionKind;
  summary: string;
  primaryMetric: string;
}
export interface InteractionContactDetails {
  key: string;
  participants: readonly string[];
  metrics: readonly { label: string; value: number; unit: "Å" | "°" | "e" }[];
  scope: "inter" | "intra";
  focusUnavailable: string | null;
  selectUnavailable: string | null;
}
export interface InteractionWarningView {
  key: string;
  entryLabel: string;
  message: string;
  code: string;
  knownAtomCount: number;
  occurrences: number;
  selectUnavailable: string | null;
}
export interface InteractionStatusView {
  message: string;
  phase: "hidden" | "off" | "target" | "loading" | "rendering" | "ready" | "paused" | "error";
  partial: boolean;
}
export interface InteractionPanelProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  restoreFocus?: boolean;
  collapsed: boolean;
  onCollapsedChange(collapsed: boolean): void;
  show: boolean;
  onShowChange(show: boolean): void;
  choices: InteractionChoices;
  onToggleType(kind: InteractionKind): void;
  onToggleScope(scope: "inter" | "intra"): void;
  target: InteractionTargetView;
  onTargetModeChange(mode: InteractionTargetMode): void;
  onLigandChange(key: string): void;
  onCaptureSelection(): void;
  categories: Readonly<Record<InteractionKind, InteractionCategoryView>>;
  status: InteractionStatusView;
  contacts: readonly InteractionContactView[];
  resultIdentity: string | null;
  inspectedKey: string | null;
  onInspectContact(key: string | null): void;
  inspected: InteractionContactDetails | null;
  warnings: readonly InteractionWarningView[];
  onFocusContact(key: string): void;
  onSelectContact(key: string): void;
  onSelectWarning(key: string): void;
  appearance: InteractionAppearance;
  onAppearanceChange(kind: InteractionKind, patch: Partial<InteractionAppearance[InteractionKind]>): void;
  onResetAppearance(kind?: InteractionKind): void;
  onRetry?(): void;
  retryLabel?: string;
}
