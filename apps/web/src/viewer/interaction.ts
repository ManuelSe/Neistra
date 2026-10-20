import { PluginBehaviors } from "molstar/lib/mol-plugin/behavior";
import {
  DefaultFocusLociBindings as DefaultCameraFocusLociBindings,
} from "molstar/lib/mol-plugin/behavior/dynamic/camera";
import {
  DefaultFocusLociBindings as DefaultRepresentationFocusLociBindings,
} from "molstar/lib/mol-plugin/behavior/dynamic/representation";
import type { PluginSpec } from "molstar/lib/mol-plugin/spec";
import { Binding } from "molstar/lib/mol-util/binding";
import {
  ButtonsType,
  type ModifiersKeys,
} from "molstar/lib/mol-util/input/input-observer";
import type { SelectionMode } from "../api/types";
import { selectionMode } from "../selection/selection";

const isPrimaryTrigger = (trigger: Binding.Trigger): boolean => {
  const buttons = trigger.buttons ?? ButtonsType.Flag.None;
  return (
    ButtonsType.has(buttons, ButtonsType.Flag.Primary) ||
    ButtonsType.has(buttons, ButtonsType.Flag.Trigger)
  );
};

const withoutPrimaryTriggers = (binding: Binding): Binding =>
  Binding.create(
    binding.triggers.filter((trigger) => !isPrimaryTrigger(trigger)),
    binding.action,
    binding.description,
  );

export const cameraNeutralFocusBindings = {
  camera: {
    clickCenterFocus: withoutPrimaryTriggers(
      DefaultCameraFocusLociBindings.clickCenterFocus,
    ),
    clickCenterFocusSelectMode: withoutPrimaryTriggers(
      DefaultCameraFocusLociBindings.clickCenterFocusSelectMode,
    ),
    clickResetCameraOnEmpty: withoutPrimaryTriggers(
      DefaultCameraFocusLociBindings.clickResetCameraOnEmpty ?? Binding.Empty,
    ),
    clickResetCameraOnEmptySelectMode: withoutPrimaryTriggers(
      DefaultCameraFocusLociBindings.clickResetCameraOnEmptySelectMode ??
        Binding.Empty,
    ),
  },
  representation: {
    clickFocus: withoutPrimaryTriggers(
      DefaultRepresentationFocusLociBindings.clickFocus,
    ),
    clickFocusAdd: withoutPrimaryTriggers(
      DefaultRepresentationFocusLociBindings.clickFocusAdd,
    ),
    clickFocusExtend: withoutPrimaryTriggers(
      DefaultRepresentationFocusLociBindings.clickFocusExtend,
    ),
    clickFocusSelectMode: withoutPrimaryTriggers(
      DefaultRepresentationFocusLociBindings.clickFocusSelectMode,
    ),
    clickFocusAddSelectMode: withoutPrimaryTriggers(
      DefaultRepresentationFocusLociBindings.clickFocusAddSelectMode,
    ),
    clickFocusExtendSelectMode: withoutPrimaryTriggers(
      DefaultRepresentationFocusLociBindings.clickFocusExtendSelectMode,
    ),
  },
} as const;

export function withCameraNeutralPrimarySelection(
  behaviors: PluginSpec.Behavior[],
  allowFocus?: () => boolean,
): PluginSpec.Behavior[] {
  // Public Binding values retain their identity in Mol* PD.Value parameters.
  // Evaluate ownership at event time, avoiding asynchronous behavior updates
  // that could leave a focus-click window during a navigation transition.
  const guarded = <T extends Record<string, Binding>>(bindings: T): T =>
    allowFocus ? Object.fromEntries(Object.entries(bindings).map(([key, binding]) => [key, {
      action: binding.action, description: binding.description,
      get triggers() { return allowFocus() ? binding.triggers : []; },
    }])) as T : bindings;
  const cameraBindings = guarded(cameraNeutralFocusBindings.camera);
  const representationBindings = guarded(cameraNeutralFocusBindings.representation);
  return behaviors.map((behavior) => {
    const existingParams: unknown = behavior.defaultParams;
    const defaultParams =
      typeof existingParams === "object" && existingParams !== null
        ? existingParams
        : {};
    if (behavior.transformer === PluginBehaviors.Camera.FocusLoci) {
      return {
        ...behavior,
        defaultParams: {
          ...defaultParams,
          bindings: cameraBindings,
        },
      };
    }
    if (behavior.transformer === PluginBehaviors.Representation.FocusLoci) {
      return {
        ...behavior,
        defaultParams: {
          ...defaultParams,
          bindings: representationBindings,
        },
      };
    }
    return behavior;
  });
}

export const isPrimarySelectionActivation = (button: ButtonsType.Flag): boolean =>
  button === ButtonsType.Flag.Primary || button === ButtonsType.Flag.Trigger;

export function selectionModeForModifiers(modifiers: ModifiersKeys): SelectionMode {
  return selectionMode({ altKey: modifiers.alt, ctrlKey: modifiers.control,
    metaKey: modifiers.meta, shiftKey: modifiers.shift });
}

export const shouldClearSelectionForEmptyPick = (
  mode: SelectionMode,
  hasSelection: boolean,
): boolean => mode === "replace" && hasSelection;
