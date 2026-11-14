import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { expect, test, type APIRequestContext } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import type * as SurfaceHarness from "../../apps/web/src/test/selectionSurfaceHarness";
import type * as SurfaceGeometryModule from "../../apps/web/src/viewer/surface/geometry";
import type * as SurfaceProtocol from "../../apps/web/src/viewer/surface/protocol";
import { performanceBudget } from "./support/performance";

// Three incomplete Cα-only placeholders qualify display context across actual
// polymer units, not preparation or peptide chemistry. Two contact; one is apart.
function contactingEntry(): Buffer {
  return Buffer.from([0, 2, 10].map((x, index) =>
    `ATOM  ${String(index + 1).padStart(5)}   CA ALA ${["A", "B", "C"][index]}   1    ${x.toFixed(3).padStart(8)}   0.000   0.000  1.00 10.00           C  `,
  ).join("\n") + "\nEND\n");
}

// Deterministic carbon centers, not a molecule: extend the existing 47-wide,
// 2.5 Å capacity lattice by one atom without changing its density or spacing.
function syntheticEntry(count: number): Buffer {
  const header = `data_entry_surface_${count}
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_alt_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_entity_id
_atom_site.label_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
_atom_site.B_iso_or_equiv
_atom_site.auth_seq_id
_atom_site.auth_asym_id
_atom_site.pdbx_PDB_model_num
`;
  const rows = Array.from({ length: count }, (_, index) => {
    const chain = "A";
    const [x, y, z] = [(index % 47) * 2.5, Math.floor(index / 47) % 47 * 2.5, Math.floor(index / 2209) * 2.5];
    return `HETATM ${index + 1} C C${index + 1} . SYN ${chain} 1 . ${x} ${y} ${z} 1 0 1 ${chain} 1`;
  });
  return Buffer.from(header + rows.join("\n") + "\n#\n");
}

async function importFixture(request: APIRequestContext, name: string, buffer: Buffer) {
  const created = await request.post("/api/v1/projects", { data: { name: `Entry surface ${name} ${Date.now()}` } });
  expect(created.status()).toBe(201);
  const initial = await created.json() as Project;
  const imported = await request.post(`/api/v1/projects/${initial.id}/imports`, { timeout: 120_000, multipart: {
    expected_revision: "0", files: { name, mimeType: name.endsWith(".pdb") ? "chemical/x-pdb" : "chemical/x-mmcif", buffer },
  } });
  expect(imported.status(), await imported.text()).toBe(201);
  const project = (await imported.json() as { project: Project }).project;
  expect(project.entries).toHaveLength(1);
  const entry = project.entries[0];
  const response = await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`, { timeout: 120_000 });
  expect(response.status()).toBe(200);
  const projection = await response.json() as StructureProjection;
  return { entry, projection };
}

test("whole-entry surfaces combine contacting units and match a complete captured fragment", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const buffer = contactingEntry();
  const fixture = await importFixture(request, "contacting-entry.pdb", buffer);
  expect(fixture.entry.atom_count).toBe(3);
  expect(fixture.projection.structure.atoms.map(atom => atom.coordinates)).toEqual([[0, 0, 0], [2, 0, 0], [10, 0, 0]]);
  await page.goto("/selection-surface-test.html");
  const evidence = await page.evaluate(async ({ entry, projection }) => {
    const path = "/src/test/selectionSurfaceHarness.ts";
    const { mountProductionSurfaceHarness, fixtureSurface } = await import(/* @vite-ignore */ path) as typeof SurfaceHarness;
    const container = document.createElement("div");
    Object.assign(container.style, { position: "fixed", inset: "0" }); document.body.appendChild(container);
    const settings = structuredClone(entry.viewer_settings);
    settings.representations = []; settings.surface_objects = [];
    for (const key of Object.keys(settings.components)) settings.components[key as keyof typeof settings.components] = true;
    const h = await mountProductionSurfaceHarness(container, { entryId: entry.id, label: entry.name,
      projection: projection.viewer, atomIds: entry.atom_ids, normalized: projection.structure, hierarchy: projection.hierarchy, settings });
    try {
      const internals = h.engine as unknown as { loaded: Map<string, { structure: { units: unknown[] } }>;
        surfaces: { requests: Map<string, unknown> }; surfaceRefs: Map<string, string> };
      const units = internals.loaded.get(entry.id)!.structure.units.length;
      const whole = fixtureSurface({ kind: "entry" }, false);
      whole.appearance = { ...whole.appearance, color_by: "custom", custom_color: "#00ff00", opacity: 1 };
      h.source.settings.surface_objects = [whole];
      await h.sync([h.source]);
      const combined = h.geometry(entry.id, "entry");
      if (!combined) throw new Error(JSON.stringify(h.inspect().statuses));
      h.engine.fitVisible();
      await new Promise(resolve => setTimeout(resolve, 500));
      const canvas = container.querySelector("canvas")!;
      const greenPixels = () => {
        const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        if (!gl) throw new Error("WebGL unavailable");
        gl.finish(); const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let count = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 1] > pixels[i] + 40 && pixels[i + 1] > pixels[i + 2] + 40) count++;
        return count;
      };
      const entryPixels = greenPixels();
      const entryDraws = h.details().representations.flatMap(representation => representation.objects)
        .map(object => ({ type: object.type, count: object.drawCount }));
      const entryState = h.inspect().statuses.find(status => status.channel === "entry")?.state;
      // At the declared 0.5 Å grid, no combined surface vertex may be deeply
      // buried inside either contacting carbon's 1.7 Å physical sphere.
      let deeplyBuriedVertices = 0, trianglesInGap = 0;
      for (let index = 0; index < combined.vertices.length; index += 3) {
        const [x, y, z] = combined.vertices.subarray(index, index + 3);
        if ([0, 2, 10].some(center => Math.hypot(x - center, y, z) < 1.2)) deeplyBuriedVertices++;
      }
      for (let index = 0; index < combined.indices.length; index += 3) {
        const x = (combined.vertices[combined.indices[index] * 3] + combined.vertices[combined.indices[index + 1] * 3]
          + combined.vertices[combined.indices[index + 2] * 3]) / 3;
        if (x > 4.5 && x < 7.5) trianglesInGap++;
      }
      const fragment = fixtureSurface({ kind: "fragment", profile: "molecular-v1", atom_ids: entry.atom_ids }, false);
      fragment.appearance = { ...whole.appearance };
      h.source.settings.surface_objects = [{ ...whole, visible: false }, fragment];
      await h.sync([h.source]);
      const captured = h.geometry(entry.id, "fragment");
      if (!captured) throw new Error(JSON.stringify(h.inspect().statuses));
      await new Promise(resolve => setTimeout(resolve, 100));
      const identical = (key: "atomIds" | "vertices" | "normals" | "indices" | "groups") =>
        combined[key].length === captured[key].length && combined[key].every((value, index) => value === captured[key][index]);
      const summary = { units, atoms: [...combined.atomIds], ownerGroups: [...new Set(combined.groups)],
        exactVertices: identical("vertices"), exactNormals: identical("normals"), exactIndices: identical("indices"),
        exactGroups: identical("groups"), exactAtomIds: identical("atomIds"), deeplyBuriedVertices, trianglesInGap,
        entryPixels, fragmentPixels: greenPixels(), entryDraws, entryState, evidence: combined.evidence,
        statuses: h.inspect().statuses, workers: { ...h.workers } };
      h.dispose();
      // The viewer deliberately unmounts its owned React root in a microtask,
      // before disposing the plugin, so parent React commits can finish first.
      await Promise.resolve();
      return { ...summary, activeAfterDispose: h.workers.active, canvasAfterDispose: container.querySelectorAll("canvas").length,
        requestsAfterDispose: internals.surfaces.requests.size, componentsAfterDispose: internals.surfaceRefs.size };
    } catch (error) { h.dispose(); throw error; }
  }, fixture);
  expect(evidence.units).toBeGreaterThanOrEqual(2);
  expect(evidence.atoms).toEqual(fixture.entry.atom_ids);
  expect(evidence.ownerGroups.sort((a, b) => a - b)).toEqual([0, 1, 2]);
  expect([evidence.exactVertices, evidence.exactNormals, evidence.exactIndices, evidence.exactGroups, evidence.exactAtomIds]).toEqual([true, true, true, true, true]);
  expect(evidence.deeplyBuriedVertices).toBe(0);
  expect(evidence.trianglesInGap).toBe(0);
  expect(evidence.entryPixels).toBeGreaterThan(100);
  expect(evidence.fragmentPixels).toBeGreaterThan(100);
  expect(evidence.entryDraws.length).toBeGreaterThan(0);
  expect(evidence.entryState).toBe("ready");
  expect(evidence.entryDraws.every(draw => draw.type === "mesh" && draw.count > 0)).toBe(true);
  expect(evidence.statuses.find(status => status.channel === "fragment")?.state).toBe("ready");
  expect(evidence.workers).toEqual({ created: 2, terminated: 2, active: 0, maximum: 1 });
  expect(evidence.activeAfterDispose).toBe(0); expect(evidence.canvasAfterDispose).toBe(0);
  expect(evidence.requestsAfterDispose).toBe(0); expect(evidence.componentsAfterDispose).toBe(0);
  writeFileSync(info.outputPath("combined-entry-surface.json"), JSON.stringify({ fixtureSha256: createHash("sha256").update(buffer).digest("hex"), ...evidence }, null, 2));
});

test("renders a 100001-atom whole-entry surface with the fixed profile and bounded worker resources", async ({ page, request }, info) => {
  test.setTimeout(300_000);
  const buffer = syntheticEntry(100_001);
  const fixture = await importFixture(request, "entry-100001.cif", buffer);
  expect(fixture.entry.atom_count).toBe(100_001);
  await page.goto("/selection-surface-test.html");
  const evidence = await page.evaluate(async ({ entry, projection }) => {
    const path = "/src/test/selectionSurfaceHarness.ts";
    const { mountProductionSurfaceHarness, fixtureSurface } = await import(/* @vite-ignore */ path) as typeof SurfaceHarness;
    const container = document.createElement("div");
    Object.assign(container.style, { position: "fixed", inset: "0" }); document.body.appendChild(container);
    const settings = structuredClone(entry.viewer_settings);
    settings.representations = []; settings.surface_objects = [];
    for (const key of Object.keys(settings.components)) settings.components[key as keyof typeof settings.components] = true;
    const h = await mountProductionSurfaceHarness(container, { entryId: entry.id, label: entry.name,
      projection: projection.viewer, atomIds: entry.atom_ids, normalized: projection.structure, hierarchy: projection.hierarchy, settings }, 125_000);
    const tasks: number[] = [];
    const observer = new PerformanceObserver(list => list.getEntries().forEach(task => tasks.push(task.duration)));
    observer.observe({ type: "longtask", buffered: false });
    try {
      const started = performance.now();
      const whole = fixtureSurface({ kind: "entry" }, false);
      whole.appearance = { ...whole.appearance, color_by: "custom", custom_color: "#00ff00", opacity: 1 };
      h.source.settings.surface_objects = [whole];
      await h.sync([h.source]);
      const readyMs = performance.now() - started;
      const geometry = h.geometry(entry.id, "entry");
      if (!geometry) throw new Error("Whole-entry worker did not return geometry");
      h.engine.fitVisible();
      await new Promise(resolve => setTimeout(resolve, 500));
      observer.disconnect();
      const canvas = container.querySelector("canvas")!;
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) throw new Error("WebGL unavailable");
      gl.finish(); const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let greenPixels = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 1] > pixels[i] + 40 && pixels[i + 1] > pixels[i + 2] + 40) greenPixels++;
      const geometryPath = "/src/viewer/surface/geometry.ts", protocolPath = "/src/viewer/surface/protocol.ts";
      const { surfaceAdmission } = await import(/* @vite-ignore */ geometryPath) as typeof SurfaceGeometryModule;
      const { SURFACE_PROFILE } = await import(/* @vite-ignore */ protocolPath) as typeof SurfaceProtocol;
      const input = h.input(entry.id, "entry"), admission = surfaceAdmission(input);
      const coordinates = new Map(projection.structure.atoms.map(atom => [atom.id, atom.coordinates]));
      const exactCoordinates = input.atomIds.every((id, index) => [input.x[index], input.y[index], input.z[index]]
        .every((value, axis) => Math.abs(value - coordinates.get(id)![axis]) < 0.001));
      const internals = h.engine as unknown as { surfaces: { statuses(): { state: string; channel: string }[];
        requests: Map<string, { geometry?: typeof geometry; displayBytes: number }> }; surfaceRefs: Map<string, string>;
        loaded: Map<string, unknown>;
        surfaceBindings: Map<string, { entryId: string; surfaceId: string; componentRef: string; representationRef?: string }>;
        plugin: { state: { data: { cells: Map<string, { obj?: { data: { repr?: object } } }> } } } };
      const retained = () => [...internals.surfaces.requests.values()].reduce((sum, value) => sum + value.displayBytes + (value.geometry?.evidence.meshBytes ?? 0), 0);
      const retainedBytes = retained();
      const binding = () => [...internals.surfaceBindings.values()].find(value => value.entryId === entry.id && value.surfaceId === whole.id);
      const before = binding();
      if (!before?.representationRef) throw new Error("Missing installed entry representation");
      const loadedBefore = internals.loaded.get(entry.id);
      const reprBefore = internals.plugin.state.data.cells.get(before.representationRef)?.obj?.data.repr;
      const workersBefore = h.workers.created, appearanceStarted = performance.now();
      h.source.settings.surface_objects = [{ ...whole, name: "Renamed bounded entry", appearance: { ...whole.appearance, custom_color: "#ff0000", opacity: 0.7 } }];
      await h.sync([h.source]);
      const appearanceMs = performance.now() - appearanceStarted;
      await new Promise(resolve => setTimeout(resolve, 100));
      gl.finish(); gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let redPixels = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > pixels[i + 1] + 40 && pixels[i] > pixels[i + 2] + 40) redPixels++;
      const after = binding();
      const appearanceOnly = { appearanceMs, redPixels,
        geometryRetained: h.geometry(entry.id, "entry") === geometry,
        molecularStructureRetained: internals.loaded.get(entry.id) === loadedBefore,
        componentRetained: before.componentRef === after?.componentRef,
        representationRetained: Boolean(after?.representationRef && before.representationRef === after.representationRef
          && internals.plugin.state.data.cells.get(after.representationRef)?.obj?.data.repr === reprBefore),
        extraWorkers: h.workers.created - workersBefore, retainedBytesAfter: retained() };
      const summary = { ...geometry.evidence, dimensions: admission.dimensions, profile: SURFACE_PROFILE,
        inputKind: input.kind, atoms: geometry.atomIds.length, exactCoordinates,
        exactMembership: geometry.atomIds.every((id, index) => id === entry.atom_ids[index]),
        vertices: geometry.vertices.length / 3, triangles: geometry.indices.length / 3,
        greenPixels, readyMs, longestSurfaceTaskMs: Math.max(0, ...tasks), retainedBytes, appearanceOnly,
        statuses: internals.surfaces.statuses(), workers: { ...h.workers } };
      h.dispose();
      await Promise.resolve();
      return { ...summary, activeAfterDispose: h.workers.active, canvasAfterDispose: container.querySelectorAll("canvas").length,
        requestsAfterDispose: internals.surfaces.requests.size, componentsAfterDispose: internals.surfaceRefs.size };
    } catch (error) { observer.disconnect(); h.dispose(); throw error; }
  }, fixture);
  expect(evidence.atoms).toBe(100_001);
  expect(evidence.inputKind).toBe("entry");
  expect(evidence.exactMembership).toBe(true); expect(evidence.exactCoordinates).toBe(true);
  expect(evidence.profile).toMatchObject({ id: "molecular-v1", probeRadius: 1.4, resolution: 0.5, probePositions: 36 });
  expect(evidence.statuses).toEqual([expect.objectContaining({ channel: "entry", state: "ready" })]);
  expect(evidence.vertices).toBeGreaterThan(0); expect(evidence.triangles).toBeGreaterThan(0);
  expect(evidence.greenPixels).toBeGreaterThan(100);
  expect(evidence.appearanceOnly).toMatchObject({ geometryRetained: true, molecularStructureRetained: true,
    componentRetained: true, representationRetained: true, extraWorkers: 0, retainedBytesAfter: evidence.retainedBytes });
  expect(evidence.appearanceOnly.redPixels).toBeGreaterThan(100);
  expect(Number.isFinite(evidence.appearanceOnly.appearanceMs)).toBe(true);
  expect(evidence.cells).toBeLessThanOrEqual(64_000_000);
  expect(evidence.meshBytes).toBeLessThanOrEqual(evidence.meshBoundBytes);
  expect(evidence.meshBoundBytes).toBeLessThanOrEqual(512 * 1024 ** 2);
  expect(evidence.workingBoundBytes).toBeLessThanOrEqual(2 * 1024 ** 3);
  expect(evidence.retainedBytes).toBeLessThanOrEqual(1024 ** 3);
  expect(evidence.workers).toEqual({ created: 1, terminated: 1, active: 0, maximum: 1 });
  expect(evidence.activeAfterDispose).toBe(0); expect(evidence.canvasAfterDispose).toBe(0);
  expect(evidence.requestsAfterDispose).toBe(0); expect(evidence.componentsAfterDispose).toBe(0);
  performanceBudget(evidence.readyMs, 120_000, "entry.readyMs");
  performanceBudget(evidence.longestSurfaceTaskMs, 750, "entry.longestSurfaceTaskMs");
  writeFileSync(info.outputPath("entry-100001-capacity.json"), JSON.stringify({ fixtureSha256: createHash("sha256").update(buffer).digest("hex"), ...evidence }, null, 2));
});
