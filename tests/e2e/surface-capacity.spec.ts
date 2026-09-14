import { browserRssKiB } from "./support/process-memory";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";

// Deterministic stress input, not a molecule: 100,000 carbon centers spaced
// 2.5 Å on a 47-wide lattice. One synthetic residue; no bonds, preparation or chemical claims.
function syntheticLattice() {
  const header = `data_synthetic_100k
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
  return Buffer.from(header + Array.from({ length: 100_000 }, (_, i) =>
    `HETATM ${i + 1} C C${i + 1} . SYN A 1 . ${(i % 47) * 2.5} ${Math.floor(i / 47) % 47 * 2.5} ${Math.floor(i / 2209) * 2.5} 1 0 1 A 1`).join("\n") + "\n#\n");
}
for (const fixture of ["6vxx", "1aon", "synthetic-100k"]) {
  test(`renders the complete ${fixture} selection within bounded capacity`, async ({ page, request }, info) => {
    test.setTimeout(300_000);
    const buffer = fixture === "synthetic-100k" ? syntheticLattice() : readFileSync(`tests/fixtures/surfaces/${fixture}.cif`);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const fixtures: Record<string, { sha256: string; atoms: number }> = {
      "6vxx": { sha256: "74ceac62dc45e34818f7c6f32fc12690f250ad803b999c1d7399a362ecd86984", atoms: 23694 },
      "1aon": { sha256: "6b202f340ffb9a1924d5315ce9e837e02cee1dbd745df675be76f6d4e1b8e66f", atoms: 58870 },
      "synthetic-100k": { sha256: "97c5b1359d4d208fa2c9a6bff3c6704f0b424a834d0fce79fee16deb3ecec31f", atoms: 100000 },
    };
    expect(sha256).toBe(fixtures[fixture].sha256);
    const initial: Project = await (await request.post("/api/v1/projects", { data: { name: `Capacity ${fixture}` } })).json();
    const imported = await request.post(`/api/v1/projects/${initial.id}/imports`, { timeout: 120_000, multipart: {
      expected_revision: "0", files: { name: `${fixture}.cif`, mimeType: "chemical/x-mmcif", buffer },
    } });
    expect(imported.status(), await imported.text()).toBe(201);
    const project: Project = (await imported.json()).project;
    expect(project.entries).toHaveLength(1);
    const entry = project.entries[0];
    expect(entry.atom_count).toBe(fixtures[fixture].atoms);
    const response = await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`, { timeout: 120_000 });
    expect(response.status()).toBe(200);
    const projection: StructureProjection = await response.json();
    await page.goto("/selection-surface-test.html");
    let peakRssKiB = browserRssKiB();
    const baselineRssKiB = peakRssKiB;
    const timer = setInterval(() => { peakRssKiB = Math.max(peakRssKiB, browserRssKiB()); }, 100);
    try {
      const evidence = await page.evaluate(async ({ entry, projection }) => {
        const path = "/src/test/selectionSurfaceHarness.ts";
        const { mountProductionSurfaceHarness } = await import(/* @vite-ignore */ path);
        const container = document.createElement("div");
        Object.assign(container.style, { position: "fixed", inset: "0" }); document.body.appendChild(container);
        const settings = structuredClone(entry.viewer_settings); settings.representations = [];
        for (const key of Object.keys(settings.components)) settings.components[key as keyof typeof settings.components] = true;
        const h = await mountProductionSurfaceHarness(container, { entryId: entry.id, label: entry.name,
          projection: projection.viewer, atomIds: entry.atom_ids, normalized: projection.structure, hierarchy: projection.hierarchy, settings }, 125_000);
        const tasks: number[] = [];
        const observer = new PerformanceObserver((list) => list.getEntries().forEach((task) => tasks.push(task.duration)));
        observer.observe({ type: "longtask", buffered: false });
        const started = performance.now();
        h.source.settings.selection_surface = { profile: "molecular-v1", atom_ids: entry.atom_ids };
        await h.sync([h.source]);
        const readyMs = performance.now() - started;
        await new Promise((resolve) => setTimeout(resolve, 100)); observer.disconnect();
        const geometry = h.geometry(entry.id);
        if (!geometry) throw new Error(JSON.stringify(h.inspect().statuses));
        const canvas = container.querySelector("canvas")!;
        const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        if (!gl) throw new Error("WebGL unavailable");
        gl.finish(); const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        // Count pixels differing from the corner background, including carbon gray.
        let renderedPixels = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (Math.max(...[0, 1, 2].map((axis) => Math.abs(pixels[i + axis] - pixels[axis]))) > 20) renderedPixels++;
        }
        const allocationPath = "/src/viewer/surface/geometry.ts";
        const { surfaceAdmission } = await import(/* @vite-ignore */ allocationPath);
        const input = h.input(entry.id);
        const dimensions = surfaceAdmission(input).dimensions;
        const coordinates = new Map(projection.structure.atoms.map((atom) => [atom.id, atom.coordinates]));
        const exactCoordinates = input.atomIds.every((id, i) => [input.x[i], input.y[i], input.z[i]]
          .every((value, axis) => Math.abs(value - coordinates.get(id)![axis]) < 0.001));
        const summary = { ...geometry.evidence, dimensions, exactCoordinates, readyMs, longestSurfaceTaskMs: Math.max(0, ...tasks),
          atoms: geometry.atomIds.length, exactMembership: [...geometry.atomIds].sort((a, b) => a - b).every((id, i) => id === entry.atom_ids[i]),
          vertices: geometry.vertices.length / 3, triangles: geometry.indices.length / 3, renderedPixels,
          workers: { ...h.workers } };
        h.dispose();
        return { ...summary, activeAfterDispose: h.workers.active };
      }, { entry, projection });
      writeFileSync(info.outputPath("surface-capacity.json"), JSON.stringify({ fixture,
        sha256: createHash("sha256").update(buffer).digest("hex"), baselineRssKiB, peakRssKiB, ...evidence }, null, 2));
      expect(evidence.atoms).toBe(entry.atom_count);
      expect(evidence.exactMembership).toBe(true);
      expect(evidence.exactCoordinates).toBe(true);
      expect(evidence.renderedPixels).toBeGreaterThan(100);
      expect(evidence.readyMs).toBeLessThan(120_000);
      expect(evidence.longestSurfaceTaskMs).toBeLessThan(750);
      expect(evidence.meshBytes).toBeLessThanOrEqual(evidence.meshBoundBytes);
      expect(evidence.meshBoundBytes).toBeLessThanOrEqual(512 * 1024 ** 2);
      expect(evidence.workingBoundBytes).toBeLessThanOrEqual(2 * 1024 ** 3);
      expect(evidence.workers.maximum).toBe(1);
      expect(evidence.activeAfterDispose).toBe(0);
    } finally { clearInterval(timer); }
  });
}
