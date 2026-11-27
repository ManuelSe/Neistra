import { openInspectorTools } from "./navigation";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, test, type APIRequestContext, type Page, type Response } from "@playwright/test";
import type { NormalizedStructure, Project, Selection } from "../../../apps/web/src/api/types";

export async function prepared(page: Page, request: APIRequestContext, specimen = "isolated") {
  const imported = await request.post("/api/v1/projects/import-archive", { multipart: {
    operation_id: `min-${specimen}-${Date.now()}`, file: { name: `${specimen}.molweave.zip`, mimeType: "application/vnd.molweave.project+zip", buffer: await readFile(`tests/fixtures/minimization/${specimen}.molweave.zip`) },
  } });
  expect(imported.status()).toBe(201);
  let project = (await imported.json()).project as Project;
  project = await (await request.patch(`/api/v1/projects/${project.id}`, { data: { expected_revision: project.revision, name: `Minimization ${specimen} ${Date.now()}` } })).json() as Project;
  const pendingIds = project.entries.map(entry => entry.id);
  for (const entry of project.entries) {
    expect(entry.ligand_designation).toEqual({ schema_version: 1, status: "unresolved",
      source_artifact_id: null, instance_id: null, atom_ids: [], origin: null,
      selected_at: null, reason_code: null, resolver_version: null,
      assessed_at: null, assessed_revision: null });
    expect(entry.dirty).toBe(false);
  }
  const snapshots = await Promise.all(project.entries.map(async entry => {
    const base = `/api/v1/projects/${project.id}/entries/${entry.id}`;
    const structure = await request.get(`${base}/structure`), original = await request.get(`${base}/original`);
    expect(structure.status()).toBe(200); expect(original.status()).toBe(200);
    return { entryId: entry.id, structure: await structure.body(), original: await original.body() };
  }));
  const assessments: { requestedRevision: number; entryIds: string[]; project: Project }[] = [];
  const observations: Promise<void>[] = [];
  const observationErrors: string[] = [];
  const observeAssessment = (response: Response) => {
    if (response.request().method() !== "POST" || new URL(response.url()).pathname
      !== `/api/v1/projects/${project.id}/ligand-designations/resolve`) return;
    observations.push((async () => {
      if (response.status() !== 200) throw new Error(`Unexpected legacy assessment HTTP ${response.status()}`);
      const request = response.request().postDataJSON() as { expected_revision: number; entry_ids: string[] };
      assessments.push({ requestedRevision: request.expected_revision, entryIds: request.entry_ids,
        project: await response.json() as Project });
    })().catch(error => { observationErrors.push(String(error)); }));
  };
  page.on("response", observeAssessment);
  await page.route("**/src/viewer/MolstarEngine.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nconst minimizationMount = MolstarEngine.prototype.mount;\nMolstarEngine.prototype.mount = async function(target) { await minimizationMount.call(this,target); (window.interactionEngines ??= []).push(this); };` });
  });
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
    await expect(page.locator(".viewer-status")).toContainText(`${project.entries.length} visible / ${project.entries.length} loaded`, { timeout: 30000 });
    await expect.poll(async () => (await current(request, project.id)).entries
      .filter(entry => pendingIds.includes(entry.id) && entry.ligand_designation.assessed_at === null).length).toBe(0);
    const assessed = await current(request, project.id);
    await expect.poll(() => assessments.some(record => record.project.revision === assessed.revision)).toBe(true);
    await Promise.all(observations);
    expect(observationErrors).toEqual([]);
    const mutations = assessments.filter(record => record.project.revision === record.requestedRevision + 1)
      .sort((left, right) => left.requestedRevision - right.requestedRevision);
    expect(mutations.length).toBeGreaterThan(0);
    expect(mutations.map(record => record.requestedRevision))
      .toEqual(mutations.map((_, index) => project.revision + index));
    expect(assessed.revision).toBe(project.revision + mutations.length);
    for (const record of assessments) {
      expect(record.project.id).toBe(project.id);
      expect(new Set(record.entryIds).size).toBe(record.entryIds.length);
      expect(record.entryIds.length).toBeGreaterThan(0);
      expect(record.entryIds.every(id => pendingIds.includes(id))).toBe(true);
      expect([record.requestedRevision, record.requestedRevision + 1]).toContain(record.project.revision);
      expect(record.project.history).toEqual(project.history);
    }
    expect(assessed.history).toEqual(project.history);
    expect({ ...assessed, revision: null, modified_at: null, entries: [] })
      .toEqual({ ...project, revision: null, modified_at: null, entries: [] });
    for (const entry of project.entries) {
      const after = assessed.entries.find(item => item.id === entry.id)!;
      const designation = after.ligand_designation;
      expect(designation.assessed_at).not.toBeNull();
      expect(designation.resolver_version).not.toBeNull();
      expect(designation.source_artifact_id).toBe(entry.current_artifact_id);
      expect(["resolved", "selection_required", "not_applicable", "unresolved"]).toContain(designation.status);
      expect(designation.atom_ids).toEqual([...designation.atom_ids].sort((a, b) => a - b));
      expect(designation.atom_ids.every(id => entry.atom_ids.includes(id))).toBe(true);
      if (designation.status === "resolved") {
        expect(designation.origin).toBe("automatic_single_candidate");
        expect(designation.instance_id).not.toBeNull();
        expect(designation.atom_ids.length).toBeGreaterThan(0);
      } else {
        expect(designation.origin).toBeNull(); expect(designation.instance_id).toBeNull();
        expect(designation.atom_ids).toEqual([]);
      }
      expect(mutations.filter(record => record.entryIds.includes(entry.id)
        && record.project.entries.find(item => item.id === entry.id)?.ligand_designation.assessed_revision
          === record.project.revision)).toHaveLength(1);
      expect(after.dirty).toBe(true);
      expect({ ...after, ligand_designation: null, modified_at: null, dirty: null })
        .toEqual({ ...entry, ligand_designation: null, modified_at: null, dirty: null });
      if (specimen === "isolated") expect(designation).toMatchObject({ status: "resolved",
        origin: "automatic_single_candidate", atom_ids: [...entry.atom_ids].sort((a, b) => a - b) });
      const snapshot = snapshots.find(item => item.entryId === entry.id)!;
      const base = `/api/v1/projects/${project.id}/entries/${entry.id}`;
      expect(await (await request.get(`${base}/structure`)).body()).toEqual(snapshot.structure);
      expect(await (await request.get(`${base}/original`)).body()).toEqual(snapshot.original);
    }
    const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
    await test.info().attach("legacy-minimization-assessment", { contentType: "application/json",
      body: JSON.stringify({ specimen, before: project, assessed, assessments,
        immutableSources: snapshots.map(snapshot => ({ entryId: snapshot.entryId,
          structureSha256: hash(snapshot.structure), originalSha256: hash(snapshot.original) })) }) });
    project = assessed;
  } finally { page.off("response", observeAssessment); }
  return project;
}
export async function select(page: Page, atoms: Selection["atoms"], mobile: boolean) {
  await openInspectorTools(page);
  await page.getByRole("tab", { name: "selection", exact: true }).click();
  await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("atom_reference");
  const mode = page.getByRole("group", { name: "Operation mode" });
  await mode.getByRole("button", { name: "replace", exact: true }).click();
  for (const [index, atom] of atoms.entries()) {
    if (index) await mode.getByRole("button", { name: "add", exact: true }).click();
    await page.getByRole("textbox", { name: "Value", exact: true }).fill(`${atom.structure_id}:${atom.atom_id}`);
    await page.getByRole("button", { name: "Apply query", exact: true }).click();
  }
  await expect(page.locator(".viewer-status")).toContainText(`/ ${atoms.length} selected`);
  if (mobile || await page.getByRole("dialog", { name: "Inspector panel", exact: true }).isVisible())
    await page.getByRole("button", { name: "Close panel", exact: true }).click({ position: { x: 2, y: 100 } });
  await page.locator(".molstar-host canvas").first().focus();
}
export const current = async (request: APIRequestContext, id: string) => (await (await request.get(`/api/v1/projects/${id}`)).json()) as Project;
export async function structures(request: APIRequestContext, p: Project) {
  return Object.fromEntries(await Promise.all(p.entries.map(async e => [e.id, (await (await request.get(`/api/v1/projects/${p.id}/entries/${e.id}/structure`)).json()).structure as NormalizedStructure])));
}
export const panel = (page: Page) => page.getByRole("dialog", { name: "Minimize selection", exact: true });

/** Explicit legacy-profile entry; Ctrl+M is qualified independently as quick work. */
export async function configure(page: Page) {
  if (!(await panel(page).isVisible())) await page.getByRole("button", { name: "Minimize selection", exact: true }).click();
  await panel(page).getByRole("button", { name: "Advanced AMBER", exact: true }).click();
  await expect(panel(page).getByRole("button", { name: "Run minimization", exact: true })).toBeEnabled({ timeout: 30000 });
}
export async function startAdvanced(page: Page) {
  await configure(page);
  await panel(page).getByRole("button", { name: "Run minimization", exact: true }).click();
}

export async function coordinateState(page: Page) {
  return page.evaluate(async () => {
    const { inspectCoordinatePreview } = await import("/src/test/modelingHarness.ts");
    return inspectCoordinatePreview(window.interactionEngines.at(-1)!);
  });
}

export const coordinateEntries = (page: Page) => page.evaluate(async () => {
  const { coordinatePreviewEntries } = await import("/src/test/modelingHarness.ts");
  return coordinatePreviewEntries(window.interactionEngines.at(-1)!);
});
export const coordinateSummary = (page: Page, movable: Selection["atoms"]) => page.evaluate(async atoms => {
  const { inspectCoordinateSummary } = await import("/src/test/modelingHarness.ts");
  return inspectCoordinateSummary(window.interactionEngines.at(-1)!, atoms);
}, movable);
