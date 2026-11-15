import type { ApplySelectionEdit } from "../api/types";
import type { SelectionTargetCapture } from "../selection/capture";
import type { EditAttemptSnapshot } from "./attempt";

/** Shared composition contract from the App owner through the workspace to Edit. */
export interface MolecularEditingPorts {
  onEdit?: ApplySelectionEdit;
  editAttempt?: EditAttemptSnapshot;
  onCheckEdit?: () => Promise<void>;
  onReviewEdit?: () => Promise<void>;
  onContinueEdit?: () => Promise<void>;
  editReviewCurrent?: boolean;
  onGeometry?: (kind: "move" | "quick" | "advanced", capture: SelectionTargetCapture) => Promise<boolean>;
  onRecoverResidue?: (capture: SelectionTargetCapture) => void;
}

/** Require every bridge key, while allowing an unavailable optional capability. */
export type MolecularEditingBindings = { [Port in keyof Required<MolecularEditingPorts>]: Required<MolecularEditingPorts>[Port] | undefined };
