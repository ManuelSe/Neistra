import { describe, expect, it } from "vitest";
import { PropertyInputOwner } from "../ligandProperties/ownership";
import { propertyInputKey } from "../ligandProperties/context";
import { propertyTargetKey } from "../ligandProperties/session";
import { propertyEntry, propertyPreferences, propertyProject, propertyRegistry, propertyTarget } from "./ligand-properties-fixtures";

describe("exact property input ownership", () => {
  it("ignores display-only replacement DTOs and unrelated entry edits", () => {
    let project = propertyProject(); project.entries.push({ ...propertyEntry("other-source"), id: "other-entry" });
    const target = propertyTarget(); target.originalArtifactId = project.entries[0].original_artifact_id;
    const owner = new PropertyInputOwner(() => ({ activeProjectId: project.id, inspectedEntryId: "entry-a", paused: false,
      inputKey: propertyInputKey(project.id, project.entries.find(entry => entry.id === "entry-a"), propertyRegistry, propertyPreferences) }));
    const owns = owner.capture(target), epoch = owner.snapshot();
    project = { ...project, revision: project.revision + 1, name: "Renamed", entries: project.entries.map(entry => ({ ...entry,
      name: `${entry.name} renamed`, visible: !entry.visible, viewer_settings: { ...entry.viewer_settings, components: { ...entry.viewer_settings.components, ions: false } },
      current_artifact_id: entry.id === "other-entry" ? "new-unrelated-source" : entry.current_artifact_id,
      ligand_designation: { ...entry.ligand_designation, atom_ids: [...entry.ligand_designation.atom_ids] } })) };
    owner.observe(); expect(owner.snapshot()).toBe(epoch); expect(owns()).toBe(true);
  });
  it.each(["project", "navigation", "source", "preview"])("retires a same-batched %s ABA and allows a fresh current owner", mode => {
    const target = propertyTarget(); let context = { activeProjectId: target.projectId, inspectedEntryId: target.source.entry_id,
      inputKey: propertyTargetKey(target), paused: false };
    const owner = new PropertyInputOwner(() => context), owns = owner.capture(target);
    const current = context;
    context = { ...context, ...(mode === "project" ? { activeProjectId: "other-project" }
      : mode === "navigation" ? { inspectedEntryId: "other-entry" } : mode === "source" ? { inputKey: "other-source" } : { paused: true }) };
    owner.observe(); context = current; owner.observe();
    expect(owns()).toBe(false); expect(owner.capture(target)()).toBe(true); expect(owner.snapshot()).toBe(2);
  });
  it("includes original identity and method/coverage identity without using project revision", () => {
    const project = propertyProject(), entry = project.entries[0];
    const base = propertyInputKey(project.id, entry, propertyRegistry, propertyPreferences);
    expect(propertyInputKey(project.id, { ...entry, original_artifact_id: "different-original" }, propertyRegistry, propertyPreferences)).not.toBe(base);
    expect(propertyInputKey(project.id, entry, { ...propertyRegistry, policy_version: "new-policy" }, propertyPreferences)).not.toBe(base);
    expect(propertyInputKey(project.id, entry, propertyRegistry, { ...propertyPreferences, enabled_categories: ["composition"] })).not.toBe(base);
  });
});
