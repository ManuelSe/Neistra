import { PluginBehaviors } from "molstar/lib/mol-plugin/behavior";
import { DefaultPluginUISpec } from "molstar/lib/mol-plugin-ui/spec";
import { Binding } from "molstar/lib/mol-util/binding";
import {
  ButtonsType,
  ModifiersKeys,
} from "molstar/lib/mol-util/input/input-observer";
import { describe, expect, it } from "vitest";
import {
  cameraNeutralFocusBindings,
  isPrimarySelectionActivation,
  selectionModeForModifiers,
  shouldClearSelectionForEmptyPick,
  withCameraNeutralPrimarySelection,
} from "../viewer/interaction";

const modifierCases = [
  ModifiersKeys.create(),
  ModifiersKeys.create({ alt: true }),
  ModifiersKeys.create({ control: true }),
  ModifiersKeys.create({ meta: true }),
  ModifiersKeys.create({ shift: true }),
];

const expectNoPrimaryMatch = (binding: Binding) => {
  for (const modifiers of modifierCases) {
    expect(Binding.match(binding, ButtonsType.Flag.Primary, modifiers)).toBe(false);
    expect(Binding.match(binding, ButtonsType.Flag.Trigger, modifiers)).toBe(false);
  }
};

const configuredBindings = (params: unknown): unknown =>
  typeof params === "object" && params !== null && "bindings" in params
    ? params.bindings
    : undefined;

describe("viewer primary interaction policy", () => {
  it("installs camera-neutral bindings on both Mol* focus behaviors", () => {
    const defaults = DefaultPluginUISpec();
    const configured = withCameraNeutralPrimarySelection(defaults.behaviors);
    const camera = configured.find(
      (behavior) => behavior.transformer === PluginBehaviors.Camera.FocusLoci,
    );
    const representation = configured.find(
      (behavior) =>
        behavior.transformer === PluginBehaviors.Representation.FocusLoci,
    );

    expect(configured).toHaveLength(defaults.behaviors.length);
    expect(configuredBindings(camera?.defaultParams as unknown)).toBe(
      cameraNeutralFocusBindings.camera,
    );
    expect(configuredBindings(representation?.defaultParams as unknown)).toBe(
      cameraNeutralFocusBindings.representation,
    );
  });

  it("removes primary and trigger focus while retaining camera secondary bindings", () => {
    for (const binding of Object.values(cameraNeutralFocusBindings.camera)) {
      expectNoPrimaryMatch(binding);
    }
    for (const binding of Object.values(
      cameraNeutralFocusBindings.representation,
    )) {
      expectNoPrimaryMatch(binding);
    }

    const noModifiers = ModifiersKeys.create();
    expect(
      Binding.match(
        cameraNeutralFocusBindings.camera.clickCenterFocus,
        ButtonsType.Flag.Secondary,
        noModifiers,
      ),
    ).toBe(true);
    expect(
      Binding.match(
        cameraNeutralFocusBindings.camera.clickResetCameraOnEmpty,
        ButtonsType.Flag.Secondary,
        noModifiers,
      ),
    ).toBe(true);
  });

  it("maps primary selection activation and modifiers without conflating empty picks", () => {
    expect(isPrimarySelectionActivation(ButtonsType.Flag.Primary)).toBe(true);
    expect(isPrimarySelectionActivation(ButtonsType.Flag.Trigger)).toBe(true);
    expect(isPrimarySelectionActivation(ButtonsType.Flag.Secondary)).toBe(false);

    expect(selectionModeForModifiers(ModifiersKeys.create())).toBe("replace");
    expect(
      selectionModeForModifiers(ModifiersKeys.create({ alt: true, shift: true })),
    ).toBe("subtract");
    expect(selectionModeForModifiers(ModifiersKeys.create({ control: true }))).toBe(
      "add",
    );
    expect(selectionModeForModifiers(ModifiersKeys.create({ meta: true }))).toBe(
      "add",
    );
    expect(selectionModeForModifiers(ModifiersKeys.create({ shift: true }))).toBe(
      "add",
    );

    expect(shouldClearSelectionForEmptyPick("replace", true)).toBe(true);
    expect(shouldClearSelectionForEmptyPick("replace", false)).toBe(false);
    expect(shouldClearSelectionForEmptyPick("add", true)).toBe(false);
    expect(shouldClearSelectionForEmptyPick("subtract", true)).toBe(false);
  });
});
