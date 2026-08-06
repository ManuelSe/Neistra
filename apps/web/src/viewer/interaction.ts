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
): PluginSpec.Behavior[] {
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
          bindings: cameraNeutralFocusBindings.camera,
        },
      };
    }
    if (behavior.transformer === PluginBehaviors.Representation.FocusLoci) {
      return {
        ...behavior,
        defaultParams: {
          ...defaultParams,
          bindings: cameraNeutralFocusBindings.representation,
        },
      };
    }
    return behavior;
  });
}

export const isPrimarySelectionActivation = (button: ButtonsType.Flag): boolean =>
  button === ButtonsType.Flag.Primary || button === ButtonsType.Flag.Trigger;

export function selectionModeForModifiers(modifiers: ModifiersKeys): SelectionMode {
  if (modifiers.alt) return "subtract";
  if (modifiers.control || modifiers.meta || modifiers.shift) return "add";
  return "replace";
}

export const shouldClearSelectionForEmptyPick = (
  mode: SelectionMode,
  hasSelection: boolean,
): boolean => mode === "replace" && hasSelection;
