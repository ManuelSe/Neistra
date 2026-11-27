import { openInspectorTools } from "./support/navigation";
import { expect, test, type Page } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import { prepare, frameFixture, cyanPixels } from "./support/interactions";
import { observe, previewState } from "./support/modeling";
async function selectAtom(page: Page, entryId: string, mobile: boolean, ids = [1]) {
  if (mobile) await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await openInspectorTools(page);
  await page.getByRole("tab", { name: "selection", exact: true }).click();
  await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("atom_reference");
  for (const [index, id] of ids.entries()) {
    if (index) await page.getByRole("button", { name: "add", exact: true }).click();
    await page.getByRole("textbox", { name: "Value", exact: true }).fill(`${entryId}:${id}`);
    await page.getByRole("button", { name: "Apply query", exact: true }).click();
  }
  if (mobile) await page.getByRole("button", { name: "Close panel", exact: true }).click({ position: { x: 2, y: 100 } });
}
test("keeps eleven fragment tiles and both hydrogen controls contained through visual viewport zoom in both themes", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const initial = await prepare(page, request, ["tests/fixtures/editing/ethanol-3d.mol"], "Compact editor zoom");
  await selectAtom(page, initial.entries[0].id, info.project.name === "mobile-chromium");
  const launcher = page.getByRole("button", { name: "Edit molecule", exact: true }); await launcher.focus(); await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true }), cdp = await page.context().newCDPSession(page);
  try {
    for (const dark of [false, true]) {
      if (((await page.locator("html").getAttribute("data-theme")) === "dark") !== dark) await page.getByRole("button", { name: /Use (dark|light) theme/ }).click();
      await panel.getByRole("button", { name: "Atoms", exact: true }).click();
      const checkHydrogenControls = async () => {
        for (const name of ["Show non-polar hydrogens", "Use entry hydrogen setting"]) {
          const control = panel.getByRole("button", { name, exact: true });
          await control.scrollIntoViewIfNeeded(); await expect(control).toBeVisible();
          expect(await control.evaluate(node => {
            const b = node.getBoundingClientRect(); return [...node.children].every(child => { const c = child.getBoundingClientRect(); return c.left >= b.left && c.right <= b.right && c.top >= b.top && c.bottom <= b.bottom; });
          })).toBe(true);
          const box = (await control.boundingBox())!, outer = (await panel.boundingBox())!;
          expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
          expect(box.x).toBeGreaterThanOrEqual(outer.x); expect(box.x + box.width).toBeLessThanOrEqual(outer.x + outer.width);
          expect(box.y).toBeGreaterThanOrEqual(outer.y); expect(box.y + box.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
          expect(await control.evaluate(node => { const b = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)); })).toBe(true);
          expect(await control.evaluate(node => {
            for (let parent = node.parentElement; parent && !parent.classList.contains("molecular-edit-panel"); parent = parent.parentElement) {
              if (/auto|scroll/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) return false;
            }
            return true;
          })).toBe(true);
        }
      };
      await checkHydrogenControls();
      await page.screenshot({ path: info.outputPath(`compact-atoms-${dark ? "dark" : "light"}.png`) });
      await panel.getByRole("button", { name: "Fragments", exact: true }).click();
      await expect(panel.locator(".edit-fragment-grid button")).toHaveCount(11);
      expect(await panel.locator(".edit-fragment-grid").evaluate(node => getComputedStyle(node).gridTemplateColumns.split(" ").length)).toBe(2);
      await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
      await expect.poll(() => page.evaluate(() => window.visualViewport?.scale)).toBe(2);
      await expect.poll(() => panel.evaluate(node => {
        const b = node.getBoundingClientRect(), v = window.visualViewport!;
        return b.left >= v.offsetLeft && b.top >= v.offsetTop && b.right <= v.offsetLeft + v.width + 1 && b.bottom <= v.offsetTop + v.height + 1;
      })).toBe(true);
      for (const name of ["Methyl", "Phenyl", "Cyclobutyl", "Methoxy"]) {
        const tile = panel.getByRole("button", { name: `Attach ${name}`, exact: true });
        await tile.scrollIntoViewIfNeeded(); await expect(tile).toBeVisible();
        await page.screenshot({ path: info.outputPath(`compact-fragments-${dark ? "dark" : "light"}-${name.toLowerCase()}-zoom2.png`) });
      }
      await checkHydrogenControls();
      await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
    }
    await panel.getByRole("button", { name: "Close molecular editor", exact: true }).focus(); await page.keyboard.press("Escape"); await expect(launcher).toBeFocused();
    expect((await (await request.get(`/api/v1/projects/${initial.id}`)).json() as Project).revision).toBe(initial.revision);
  } finally { await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 }); await cdp.detach(); }
});
test("retains one submitted Apply through closing and responsive remount without completion focus changes", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const initial = await prepare(page, request, ["tests/fixtures/editing/ethanol-3d.mol"], "Retained editor Apply"), entry = initial.entries[0];
  const path = `/api/v1/projects/${initial.id}`, endpoint = `${path}/entries/${entry.id}/model-edits`;
  const canonical = async () => (await (await request.get(`${path}/entries/${entry.id}/structure`)).json()) as StructureProjection;
  const before = (await canonical()).structure, original = await (await request.get(`${path}/entries/${entry.id}/original`)).body();
  await selectAtom(page, entry.id, info.project.name === "mobile-chromium");
  let release!: () => void, started!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), captured = new Promise<void>(resolve => { started = resolve; }); let writes = 0;
  let routeCompletion: Promise<void> | undefined;
  await page.route(url => url.pathname === endpoint, route => {
    routeCompletion = (async () => {
    if (route.request().method() !== "POST") { await route.continue(); return; }
    writes++; expect(route.request().headers()["x-neistra-edit-attempt"]).toMatch(/^[a-f0-9-]{36}$/i); started(); await held; const response = await route.fetch(); await route.fulfill({ response });
    })(); return routeCompletion;
  });
  try {
    await page.getByRole("button", { name: "Edit molecule", exact: true }).click(); const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
    await panel.getByRole("button", { name: "Replace selected atom with N", exact: true }).click(); await captured;
    await expect(panel.getByText("Applying…", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("compact-applying.png") });
    await panel.getByRole("button", { name: "Close molecular editor", exact: true }).click();
    await page.setViewportSize({ width: info.project.name === "mobile-chromium" ? 1200 : 390, height: 800 });
    await expect(page.getByRole("button", { name: "Edit molecule", exact: true })).toHaveAttribute("aria-busy", "true");
    await page.getByRole("button", { name: "Edit molecule", exact: true }).click(); await expect(panel.getByText("Applying…", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Close molecular editor", exact: true }).click();
    const focus = page.getByRole("button", { name: "Fit all visible", exact: true }); await focus.focus(); release();
    await expect.poll(async () => (await canonical()).structure.atoms.find(atom => atom.id === 1)?.element).toBe("N");
    await expect(page.getByRole("button", { name: "Edit molecule", exact: true })).toHaveAttribute("aria-busy", "false");
    await expect(panel).toBeHidden(); await expect(focus).toBeFocused(); expect(writes).toBe(1);
    await page.getByRole("button", { name: /^Undo:/ }).click(); await expect.poll(async () => (await canonical()).structure).toEqual(before);
    expect(await (await request.get(`${path}/entries/${entry.id}/original`)).body()).toEqual(original);
  } finally { release(); await routeCompletion; }
});
test("reviews an unknown receipt and requires a fresh deliberate edit after explicit continuation", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const initial = await prepare(page, request, ["tests/fixtures/editing/ethanol-3d.mol"], "Unknown editor receipt"), entry = initial.entries[0];
  const path = `/api/v1/projects/${initial.id}`, endpoint = `${path}/entries/${entry.id}/model-edits`;
  const tokens: string[] = [], revisions: number[] = [];
  await page.route(url => url.pathname === endpoint, async route => {
    if (route.request().method() !== "POST") { await route.continue(); return; }
    tokens.push(route.request().headers()["x-neistra-edit-attempt"]); revisions.push((route.request().postDataJSON() as { expected_revision: number }).expected_revision);
    if (tokens.length === 1) { await route.fetch(); await route.abort("failed"); } else await route.continue();
  });
  await page.route(url => url.pathname.startsWith(`${path}/edit-attempts/`), route => route.fulfill({ json: {
    server_instance_id: "restarted", attempt_id: tokens[0], project_id: initial.id, entry_id: null, kind: null, expected_revision: null, expected_artifact_id: null,
    phase: "unknown", outcome: "unknown", committed_revision: null, committed_artifact_id: null, reason: null,
  } }));
  await selectAtom(page, entry.id, info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click(); const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await panel.getByRole("button", { name: "Replace selected atom with N", exact: true }).click();
  await expect(panel.getByText("Earlier edit outcome is unknown. It may still arrive.", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Replace selected atom with C", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "Review current state", exact: true }).click();
  await expect(panel.getByText(`Reviewed revision ${initial.revision + 1}. Current structure verified.`, { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Continue editing current state", exact: true })).toBeEnabled(); expect(tokens).toHaveLength(1);
  await page.screenshot({ path: info.outputPath("compact-unknown-reviewed.png") });
  await panel.getByRole("button", { name: "Continue editing current state", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Replace selected atom with C", exact: true })).toBeEnabled(); expect(tokens).toHaveLength(1);
  await panel.getByRole("button", { name: "Replace selected atom with C", exact: true }).click();
  await expect.poll(async () => (await (await request.get(path)).json() as Project).revision).toBe(initial.revision + 2);
  expect(tokens).toHaveLength(2); expect(new Set(tokens).size).toBe(2); expect(revisions).toEqual([initial.revision, initial.revision + 1]);
  await expect(panel.getByText("Saved", { exact: true })).toBeVisible();
});
test("opens captured geometry setup without submitting and applies a qualified torsion with exact fixed atoms and Undo", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const mol = `Torsion chain
  Neistra           3D

  4  3  0  0  0  0  0  0  0  0999 V2000
    0.0000    1.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    1.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  2  3  1  0
  3  4  1  0
M  END
`;
  const initial = await prepare(page, request, [{ name: "torsion.mol", mimeType: "chemical/x-mdl-molfile", buffer: Buffer.from(mol) }], "Captured torsion"), entry = initial.entries[0], path = `/api/v1/projects/${initial.id}`;
  const canonical = async () => (await (await request.get(`${path}/entries/${entry.id}/structure`)).json()) as StructureProjection;
  const before = (await canonical()).structure, original = await (await request.get(`${path}/entries/${entry.id}/original`)).body();
  await selectAtom(page, entry.id, info.project.name === "mobile-chromium", [2, 3]);
  await expect(page.locator(".viewer-status")).toContainText("/ 2 selected");
  let calculationPosts = 0, applies = 0;
  page.on("request", outgoing => {
    if (outgoing.method() !== "POST") return;
    const url = new URL(outgoing.url());
    if (url.pathname.includes("minimization")) calculationPosts++;
    if (url.pathname === `${path}/entries/${entry.id}/model-edits`) applies++;
  });
  const launcher = page.getByRole("button", { name: "Edit molecule", exact: true }), panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await launcher.click(); await panel.getByText("Geometry", { exact: true }).click();
  await panel.getByRole("button", { name: "Quick minimization setup", exact: true }).click();
  const setup = page.getByRole("dialog", { name: "Minimize selection", exact: true }); await expect(setup).toBeVisible();
  expect(calculationPosts).toBe(0); expect(applies).toBe(0);
  expect((await (await request.get(path)).json() as Project).revision).toBe(initial.revision);
  await setup.getByRole("button", { name: "Close minimization", exact: true }).click();
  await launcher.click(); await panel.getByText("Geometry", { exact: true }).click();
  await panel.getByRole("button", { name: "Rotate bond", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Preview rotation", exact: true })).toBeDisabled();
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) {
    for (const control of [panel.getByRole("combobox", { name: "Moving side", exact: true }), panel.getByRole("spinbutton", { name: "Rotation (degrees)", exact: true })]) {
      await control.scrollIntoViewIfNeeded();
      const bounds = (await control.boundingBox())!, outer = (await panel.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(44); expect(bounds.x).toBeGreaterThanOrEqual(outer.x); expect(bounds.x + bounds.width).toBeLessThanOrEqual(outer.x + outer.width);
      expect(bounds.y).toBeGreaterThanOrEqual(outer.y); expect(bounds.y + bounds.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
      expect(await control.evaluate(node => { const rect = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)); })).toBe(true);
    }
  }
  await panel.getByRole("combobox", { name: "Moving side", exact: true }).selectOption("3");
  await panel.getByRole("spinbutton", { name: "Rotation (degrees)", exact: true }).fill("90");
  await observe(page);
  const nativeBefore = await previewState(page), cyanBefore = await cyanPixels(page);
  expect(nativeBefore.preview).toBeNull();
  const previewResponse = page.waitForResponse(response => new URL(response.url()).pathname === `${path}/entries/${entry.id}/model-edits/preview`);
  await panel.getByRole("button", { name: "Preview rotation", exact: true }).click();
  const rotation = (await (await previewResponse).json() as { rotation: unknown }).rotation;
  expect(rotation).toEqual({ axis_atom_ids: [2, 3], moving_endpoint_id: 3, angle_degrees: 90, rotating_atom_count: 1, fixed_atom_count: 3, no_op: false });
  const strip = panel.getByRole("group", { name: "Placement inspection", exact: true }); await expect(strip.getByRole("button", { name: "Apply placement", exact: true })).toBeEnabled();
  await expect(strip.getByRole("button", { name: "Next direction", exact: true })).toHaveCount(0);
  await expect(strip.getByLabel("Qualified bond rotation", { exact: true })).toContainText("+90° relative");
  await expect(strip.getByLabel("Qualified bond rotation", { exact: true })).toContainText("1 moving · 3 fixed");
  await expect(strip.getByLabel("Qualified bond rotation", { exact: true })).toContainText("Including all H; both axis atoms fixed.");
  await expect.poll(async () => (await previewState(page)).preview?.moved_atoms?.map(atom => atom.atom_id)).toEqual([4]);
  const native = await previewState(page), move = native.preview!.moved_atoms![0];
  expect(move.before).toEqual(before.atoms.find(atom => atom.id === 4)!.coordinates);
  expect(move.after[0]).toBeCloseTo(1.5, 8); expect(move.after[1]).toBeCloseTo(0, 8); expect(move.after[2]).toBeCloseTo(1, 8);
  expect(native.objects.length).toBeGreaterThan(0);
  expect(native.objects.every(object => !object.pickable && object.drawCount > 0)).toBe(true);
  expect(native.canonicalAtoms).toEqual(nativeBefore.canonicalAtoms);
  expect(native.representations).toBe(nativeBefore.representations + 1);
  await expect.poll(() => cyanPixels(page)).toBeGreaterThan(cyanBefore + 20);
  await page.screenshot({ path: info.outputPath("compact-qualified-torsion.png") });
  expect((await canonical()).structure).toEqual(before);
  const uncommitted = (await (await request.get(path)).json()) as Project;
  expect(uncommitted.revision).toBe(initial.revision); expect(uncommitted.history).toEqual(initial.history); expect(applies).toBe(0);
  await strip.getByRole("button", { name: "Cancel placement", exact: true }).click();
  await expect.poll(async () => (await previewState(page)).preview).toBeNull();
  expect((await previewState(page)).representations).toBe(nativeBefore.representations);
  expect((await canonical()).structure).toEqual(before);
  const cancelled = (await (await request.get(path)).json()) as Project;
  expect(cancelled.revision).toBe(initial.revision); expect(cancelled.history).toEqual(initial.history); expect(applies).toBe(0);
  await panel.getByRole("button", { name: "Preview rotation", exact: true }).click();
  await expect(strip.getByRole("button", { name: "Apply placement", exact: true })).toBeEnabled();
  await expect.poll(async () => (await previewState(page)).preview?.moved_atoms?.map(atom => atom.atom_id)).toEqual([4]);
  await strip.getByRole("button", { name: "Apply placement", exact: true }).click();
  await expect.poll(async () => (await (await request.get(path)).json() as Project).revision).toBe(initial.revision + 1);
  const after = (await canonical()).structure;
  for (const id of [1, 2, 3]) expect(after.atoms.find(atom => atom.id === id)).toEqual(before.atoms.find(atom => atom.id === id));
  const moved = after.atoms.find(atom => atom.id === 4)!;
  expect(moved.coordinates[0]).toBeCloseTo(1.5, 8); expect(moved.coordinates[1]).toBeCloseTo(0, 8); expect(moved.coordinates[2]).toBeCloseTo(1, 8);
  expect(after.bonds).toEqual(before.bonds); expect(applies).toBe(1); expect(calculationPosts).toBe(0);
  await page.getByRole("button", { name: /^Undo:/ }).click(); await expect.poll(async () => (await canonical()).structure).toEqual(before);
  expect(await (await request.get(`${path}/entries/${entry.id}/original`)).body()).toEqual(original);
});
test("recovers an Undo-partial residue only through explicit current-target selection before a later mutation", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const initial = await prepare(page, request, ["tests/fixtures/formats/protein_editing.pdb"], "Undo residue recovery"); await frameFixture(page);
  const entry = initial.entries[0], path = `/api/v1/projects/${initial.id}`;
  const canonical = async () => (await (await request.get(`${path}/entries/${entry.id}/structure`)).json()) as StructureProjection;
  const before = (await canonical()).structure, anchor = before.atoms.find(atom => atom.name === "CA")!, residueId = anchor.residue_id;
  const members = before.atoms.filter(atom => atom.residue_id === residueId), cb = members.find(atom => atom.name === "CB")!;
  expect(before.residues.find(residue => residue.id === residueId)?.name).toBe("ALA"); expect(cb).toBeDefined();
  if (info.project.name === "mobile-chromium") await page.getByRole("combobox", { name: "Viewer picking mode" }).selectOption("residue");
  else await page.getByRole("button", { name: "Pick residues", exact: true }).click();
  const point = await page.evaluate(async coordinates => {
    const modulePath = "/src/test/molecularEditHarness.ts", { observeEditPicks } = await import(/* @vite-ignore */ modulePath);
    const observation = await observeEditPicks(window.interactionEngines.at(-1)!); const point = observation.point(coordinates); observation.dispose(); return point;
  }, anchor.coordinates);
  await page.locator(".molstar-host canvas").first().click({ position: point });
  await expect(page.locator(".viewer-status")).toContainText(`/ ${members.length} selected`);
  const launcher = page.getByRole("button", { name: "Edit molecule", exact: true }), panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await launcher.click(); await panel.getByRole("button", { name: "Residues", exact: true }).click();
  await panel.getByRole("button", { name: "Mutate residue to GLY", exact: true }).click();
  await expect.poll(async () => (await canonical()).structure.residues.find(residue => residue.id === residueId)?.name).toBe("GLY");
  expect((await canonical()).structure.atoms.find(atom => atom.id === cb.id)).toBeUndefined();
  await page.getByRole("button", { name: /^Undo:/ }).click(); await expect.poll(async () => (await canonical()).structure).toEqual(before);
  await expect(page.locator(".viewer-status")).toContainText(`/ ${members.length - 1} selected`);
  const recover = panel.getByRole("button", { name: "Select whole residue", exact: true });
  await expect(recover).toBeEnabled(); await expect(panel.getByRole("button", { name: "Mutate residue to VAL", exact: true })).toBeDisabled();
  expect(await recover.evaluate(node => node.closest("fieldset") === null)).toBe(true);
  const restored = await (await request.get(path)).json() as Project;
  // A newer explicit atom selection must remain partial and must never be replaced
  // by an automatic expansion of the earlier picked residue.
  await panel.getByRole("button", { name: "Close molecular editor", exact: true }).click();
  const other = before.atoms.find(atom => atom.name === "CA" && atom.residue_id !== residueId)!;
  await selectAtom(page, entry.id, info.project.name === "mobile-chromium", [other.id]); await launcher.click();
  await expect(page.locator(".viewer-status")).toContainText("/ 1 selected");
  await expect(panel.getByRole("button", { name: "Residues", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByRole("button", { name: "Mutate residue to VAL", exact: true })).toBeDisabled();
  await expect(panel.getByLabel("Current target chemistry", { exact: true })).toContainText(before.residues.find(residue => residue.id === other.residue_id)!.name);
  await panel.getByRole("button", { name: "Close molecular editor", exact: true }).click();
  await selectAtom(page, entry.id, info.project.name === "mobile-chromium", [anchor.id]); await launcher.click();
  await expect(page.locator(".viewer-status")).toContainText("/ 1 selected"); await expect(recover).toBeEnabled();
  await panel.getByRole("button", { name: "Atoms", exact: true }).click();
  await expect(panel.getByLabel("Current target chemistry", { exact: true })).toContainText("q unknown");
  await page.screenshot({ path: info.outputPath("compact-atom-unknown-charge.png") });
  await panel.getByRole("button", { name: "Residues", exact: true }).click();
  await recover.click(); await expect(panel).toBeFocused();
  await expect(panel.getByRole("button", { name: "Residues", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".viewer-status")).toContainText(`/ ${members.length} selected`);
  const selected = await (await request.get(path)).json() as Project;
  expect(selected.revision).toBe(restored.revision); expect(selected.history).toEqual(restored.history);
  await expect(panel.getByRole("button", { name: "Mutate residue to VAL", exact: true })).toBeEnabled();
  await panel.getByRole("button", { name: "Mutate residue to VAL", exact: true }).click();
  await expect.poll(async () => (await canonical()).structure.residues.find(residue => residue.id === residueId)?.name).toBe("VAL");
});
test("keeps a definitive rejected Apply visible on the warned strip until a deliberately new preview and UUID", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const initial = await prepare(page, request, ["tests/fixtures/editing/ethanol-3d.mol"], "Rejected compact Apply"), entry = initial.entries[0], path = `/api/v1/projects/${initial.id}`;
  await selectAtom(page, entry.id, info.project.name === "mobile-chromium");
  const tokens: string[] = []; let previews = 0;
  await page.route(url => url.pathname === `${path}/entries/${entry.id}/model-edits/preview`, async route => {
    previews++; const response = await route.fetch(); const body = await response.json() as Record<string, unknown>;
    const warnings = Array.isArray(body.warnings) ? body.warnings as unknown[] : [];
    await route.fulfill({ json: { ...body, warnings: [...warnings, { code: "native_preview_warning", severity: "warning", message: "Review this native preview warning", operation: "atom.add", field: null, blocking: false }] } });
  });
  await page.route(url => url.pathname === `${path}/entries/${entry.id}/model-edits`, async route => {
    tokens.push(route.request().headers()["x-neistra-edit-attempt"]);
    if (tokens.length === 1) await route.fulfill({ status: 422, json: { detail: { code: "invalid_edit", message: "This attachment cannot be applied" } } });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click(); const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await panel.getByText("Add atom", { exact: true }).click(); await panel.getByRole("button", { name: "Preview atom", exact: true }).click();
  const strip = panel.getByRole("group", { name: "Placement inspection", exact: true });
  await expect(strip).toContainText(/Ready.*warning/); await strip.getByRole("button", { name: "Apply placement", exact: true }).click();
  await expect(strip.getByText("Not applied", { exact: true })).toBeVisible(); await expect(strip.getByRole("alert")).toContainText("This attachment cannot be applied");
  await expect(strip.getByRole("button", { name: "Apply placement", exact: true })).toBeDisabled(); expect(tokens).toHaveLength(1);
  await page.screenshot({ path: info.outputPath("compact-rejected-apply.png") });
  expect((await (await request.get(path)).json() as Project).revision).toBe(initial.revision);
  await strip.getByRole("button", { name: "Prepare preview again", exact: true }).click();
  await expect(strip).toContainText(/Ready.*warning/); await expect(strip.getByRole("alert")).toHaveCount(0); await expect(strip.getByText("Not applied", { exact: true })).toHaveCount(0);
  expect(tokens).toHaveLength(1); expect(previews).toBe(2);
  await strip.getByRole("button", { name: "Apply placement", exact: true }).click();
  await expect.poll(async () => (await (await request.get(path)).json() as Project).revision).toBe(initial.revision + 1);
  expect(tokens).toHaveLength(2); expect(new Set(tokens).size).toBe(2);
});
test("keeps unreadable edit information guarded per project and permits explicit reviewed recovery in an empty workspace", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const initial = await prepare(page, request, ["tests/fixtures/editing/ethanol-3d.mol"], "Unreadable edit journal");
  const other = await (await request.post("/api/v1/projects", { data: { name: `Other journal recovery ${Date.now()}` } })).json() as Project;
  await page.evaluate(() => sessionStorage.setItem("neistra.edit-attempts.v1", "unreadable earlier edit")); await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click(); const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await expect(panel.getByText("Earlier edit outcome is unknown. It may still arrive.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("neistra.edit-attempts.v1"))).toBe("unreadable earlier edit");
  await panel.getByRole("button", { name: "Review current state", exact: true }).click();
  await expect(panel).toContainText("Current project and history refreshed; earlier edit identity is unavailable.");
  await panel.getByRole("button", { name: "Continue editing current state", exact: true }).click();
  await expect(panel).toContainText("this project’s acknowledgment is retained");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${other.name}`) }).click();
  const recovery = page.getByLabel("Molecular edit recovery", { exact: true }); await expect(recovery).toBeVisible();
  const newMolecule = page.getByRole("button", { name: "New molecule", exact: true });
  expect(await newMolecule.count()).toBeGreaterThan(0);
  for (const control of await newMolecule.all()) await expect(control).toBeDisabled();
  await page.screenshot({ path: info.outputPath("compact-empty-project-unknown.png") });
  await recovery.getByRole("button", { name: "Review current state", exact: true }).click();
  await expect(recovery).toContainText("Current project and history refreshed; earlier edit identity is unavailable.");
  await recovery.getByRole("button", { name: "Continue editing current state", exact: true }).click(); await expect(recovery).toBeHidden();
  for (const control of await newMolecule.all()) await expect(control).toBeEnabled();
  expect((await (await request.get(`/api/v1/projects/${initial.id}`)).json() as Project).revision).toBe(initial.revision);
  expect((await (await request.get(`/api/v1/projects/${other.id}`)).json() as Project).revision).toBe(other.revision);
});
