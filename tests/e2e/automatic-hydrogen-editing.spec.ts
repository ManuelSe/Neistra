import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import { newEmptyProject, observe, selectPair } from "./support/modeling";

for (const item of [
  { fixture: "ammonia", parent: 1, hidden: false },
  { fixture: "ammonia", parent: 1, hidden: true },
  { fixture: "water", parent: 1, hidden: false },
  { fixture: "sulfide", parent: 2, hidden: false },
]) {
  test(`one-click +H ${item.fixture} ${item.hidden ? "hidden" : "visible"} retains exact history and source`, async ({ page, request }, info) => {
    test.setTimeout(90000);
    const empty = await newEmptyProject(page, request);
    const source = readFileSync(`tests/fixtures/hydrogens/single-hydrogen-${item.fixture}.mol`);
    const imported = await request.post(`/api/v1/projects/${empty.id}/imports`, { multipart: {
      expected_revision: String(empty.revision), generate_3d: "false", infer_bonds: "false",
      files: { name: `${item.fixture}.mol`, mimeType: "chemical/x-mdl-molfile", buffer: source },
    } });
    expect(imported.ok()).toBe(true);
    const path = `/api/v1/projects/${empty.id}`;
    let project = await (await request.get(path)).json() as Project;
    const entry = project.entries[0];
    const styled = item.fixture === "ammonia" && !item.hidden;
    if (styled) {
      const selection = { schema_version: 1, atoms: [{ structure_id: entry.id, atom_id: item.parent }], granularity: "atom", source: "inspector" };
      const represented = await request.post(`${path}/selection-representations`, { data: { expected_revision: project.revision, selection, action: "apply", style: "thick-stick" } });
      expect(represented.ok()).toBe(true);
      project = await represented.json() as Project;
      const colored = await request.post(`${path}/selection-appearance`, { data: { expected_revision: project.revision, selection, property: "color", action: "set", color: "#ff00ff" } });
      expect(colored.ok()).toBe(true);
      project = await colored.json() as Project;
    }
    if (item.hidden) {
      const updated = await request.put(`${path}/entries/${entry.id}/viewer-settings`, { data: {
        expected_revision: project.revision,
        settings: { ...entry.viewer_settings, components: { ...entry.viewer_settings.components, hydrogens: false } },
      } });
      expect(updated.ok()).toBe(true);
      project = await updated.json() as Project;
    }
    const read = async () => (await (await request.get(`${path}/entries/${entry.id}/structure`)).json() as StructureProjection).structure;
    const before = await read();
    const beforeSettings = project.entries[0].viewer_settings;
    await page.reload();
    await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
    await observe(page);
    await selectPair(page, entry.id, [item.parent], info.project.name === "mobile-chromium");
    await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
    await page.evaluate(() => window.editingPicks!.settled());
    const camera = await page.evaluate(() => window.editingPicks!.camera());
    const add = panel.getByRole("button", { name: "Add hydrogen (+H)", exact: true });
    await add.click();
    await expect.poll(async () => (await read()).atoms.length).toBe(before.atoms.length + 1);
    const after = await read();
    const settingsAfter = (await (await request.get(path)).json() as Project).entries[0].viewer_settings;
    if (styled) {
      const created = after.atoms.find(a => !before.atoms.some(b => b.id === a.id))!.id;
      expect(settingsAfter.selection_representations).toEqual([{ style: "thick-stick", atom_ids: [item.parent, created] }]);
      expect(settingsAfter.selection_colors).toEqual([{ color: "#ff00ff", atom_ids: [item.parent, created] }]);
      const nativeAppearance = () => page.evaluate(async entryId => {
        const path = "/src/test/modelingHarness.ts";
        const { inspectNativeAppearance } = await import(/* @vite-ignore */ path);
        return inspectNativeAppearance(window.interactionEngines.at(-1)!, entryId);
      }, entry.id);
      await expect.poll(async () => (await nativeAppearance()).find((layer: { tag: string }) => layer.tag === "molweave-representation-selection-thick-stick")?.atomIds).toEqual([item.parent, created]);
      expect((await nativeAppearance()).find((layer: { tag: string }) => layer.tag === "molweave-representation-selection-thick-stick")?.colors).toEqual([{ color: 0xff00ff, atomIds: [item.parent, created] }]);
    }
    expect(after.atoms.find(a => a.id === item.parent)?.formal_charge).toBe(1);
    expect(after.atoms.slice(0, before.atoms.length).map(a => a.coordinates)).toEqual(before.atoms.map(a => a.coordinates));
    await page.evaluate(() => window.editingPicks!.settled());
    expect(await page.evaluate(() => window.editingPicks!.camera())).toEqual(camera);
    await expect(page.locator(".viewer-status")).toContainText("/ 1 selected");
    expect((await (await request.get(path)).json()).revision).toBe(project.revision + 1);
    await expect(add).toBeEnabled();
    await add.click();
    await expect(panel.getByRole("alert")).toContainText("No further supported");
    expect(await read()).toEqual(after);
    expect((await (await request.get(path)).json()).revision).toBe(project.revision + 1);
    await page.screenshot({ path: info.outputPath(`single-h-${item.fixture}-${item.hidden}.png`) });
    await panel.getByRole("button", { name: "Close molecular editor" }).click();
    await page.getByRole("button", { name: /^Undo: Add one hydrogen/ }).click();
    await expect.poll(read).toEqual(before);
    expect((await (await request.get(path)).json() as Project).entries[0].viewer_settings).toEqual(beforeSettings);
    await page.getByRole("button", { name: /^Redo: Add one hydrogen/ }).click();
    await expect.poll(read).toEqual(after);
    expect((await (await request.get(path)).json() as Project).entries[0].viewer_settings).toEqual(settingsAfter);
    const current = await (await request.get(path)).json() as Project;
    const saved = await request.post(`${path}/save`, { data: { expected_revision: current.revision } });
    expect(saved.ok()).toBe(true);
    await page.reload();
    await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
    expect(await read()).toEqual(after);
    const restored = await (await request.get(path)).json() as Project;
    expect(restored.entries[0].viewer_settings.components.hydrogens).toBe(!item.hidden);
    expect(restored.entries[0].viewer_settings).toEqual(settingsAfter);
    expect(Buffer.from(await (await request.get(`${path}/entries/${entry.id}/original`)).body())).toEqual(source);
  });
}
