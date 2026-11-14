import { expect, test } from "@playwright/test";
import { prepare } from "./support/interactions";
import { expectApplicationViewer, watchNativeUi } from "./support/viewer-ui";

test("keeps native UI absent through loading, themes, camera actions and reload", async ({ page, request }, info) => {
  test.setTimeout(120000);
  await watchNativeUi(page);
  const project = await prepare(page, request, ["tests/fixtures/complex/1stp.pdb"], "Application viewer");
  await expect(page.getByLabel("Loading molecular structures")).toHaveCount(0);
  for (const theme of ["light", "dark"] as const) {
    const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
    if (await toggle.count()) await toggle.click();
    await page.getByRole("button", { name: "Fit all visible", exact: true }).click();
    await expectApplicationViewer(page);
    expect(await page.evaluate(() => {
      const native = window.interactionEngines.at(-1)! as unknown as {
        plugin: { canvas3d: { props: { camera: { helper: { axes: { name: string } } } } } };
      };
      return native.plugin.canvas3d.props.camera.helper.axes.name;
    })).toBe("on");
    const canvas = page.locator(".molstar-host canvas").first();
    await expect(canvas).toBeVisible();
    await canvas.hover({ position: { x: 80, y: 250 } });
    await expectApplicationViewer(page);
    await page.screenshot({ path: info.outputPath(`${theme}-application-viewer.png`) });
  }
  const notice = await request.get("/licenses/molstar.txt");
  expect(notice.ok()).toBe(true);
  expect(await notice.text()).toContain("Copyright (c) 2017 - now, Mol* contributors");
  const before = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  expect(before.revision).toBe(project.revision);
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
  await expect(page.getByLabel("Loading molecular structures")).toHaveCount(0);
  await expectApplicationViewer(page);
});

test("retains molecular annotations through native tasks, rebuilds, remounts and projects", async ({ page, request }, info) => {
  test.setTimeout(180000);
  const lifecycleErrors: string[] = [];
  page.on("console", message => {
    if (message.type() === "error" && message.text().includes("unmount a root")) lifecycleErrors.push(message.text());
  });
  await watchNativeUi(page);
  const other = await (await request.post("/api/v1/projects", { data: { name: `Other annotation project ${Date.now()}` } })).json() as import("../../apps/web/src/api/types").Project;
  let project = await prepare(page, request, ["tests/fixtures/hydrogens/butane-reconciliation.mol"], "Annotation ownership");
  const entry = project.entries[0];
  const path = `/api/v1/projects/${project.id}`;
  const projection = await (await request.get(`${path}/entries/${entry.id}/structure`)).json() as import("../../apps/web/src/api/types").StructureProjection;
  const configured = await request.put(`${path}/entries/${entry.id}/viewer-settings`, { data: {
    expected_revision: project.revision, settings: { ...entry.viewer_settings, labels: { ...entry.viewer_settings.labels, structure: true } },
  } });
  expect(configured.ok()).toBe(true); project = await configured.json();
  for (const [kind, count] of [["distance", 2], ["angle", 3], ["dihedral", 4]] as const) {
    const response = await request.post(`${path}/measurements`, { data: {
      expected_revision: project.revision, name: `Owned ${kind}`, kind,
      atom_references: projection.structure.atoms.slice(0, count).map(atom => ({ structure_id: entry.id, atom_id: atom.id })),
    } });
    expect(response.ok(), await response.text()).toBe(true); project = await response.json();
  }
  await expectApplicationViewer(page);
  await page.reload();
  const inspect = () => page.evaluate(async () => {
    const { inspectViewerAnnotations } = await import("/src/test/viewerInterfaceHarness.ts");
    return inspectViewerAnnotations(window.interactionEngines.at(-1)!);
  });
  const settled = async () => {
    await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
    await expect(page.getByLabel("Loading molecular structures")).toHaveCount(0);
    await expect.poll(() => inspect()).toHaveLength(4);
    const annotations = await inspect();
    for (const kind of ["distance", "angle", "dihedral"]) {
      expect(annotations.find(item => item.kind === kind)?.text).toContain(`Owned ${kind}`);
    }
    expect(annotations.every(item => item.textDrawCount > 0)).toBe(true);
    expect(annotations.find(item => item.kind === "label")?.text).toBe(entry.name);
    await expectApplicationViewer(page);
  };
  await page.getByRole("button", { name: "Fit all visible", exact: true }).click();
  await settled();
  const persistedBefore = await (await request.get(path)).json() as typeof project;
  const original = await (await request.get(`${path}/entries/${entry.id}/original`)).body();
  const reads: string[] = [];
  page.on("request", outgoing => { if (/\/structure$/.test(new URL(outgoing.url()).pathname)) reads.push(outgoing.url()); });
  const rebuilt = await page.evaluate(async () => {
    const { rebuildViewerAppearance } = await import("/src/test/viewerInterfaceHarness.ts");
    return rebuildViewerAppearance(window.interactionEngines.at(-1)!);
  });
  expect(rebuilt.changed).toEqual(rebuilt.restored);
  expect(rebuilt.changed).toHaveLength(4);
  expect(rebuilt.restoredCamera).toEqual(rebuilt.camera);
  expect(reads).toEqual([]);
  const feedback = await page.evaluate(async () => {
    const { startNativeFeedback } = await import("/src/test/viewerInterfaceHarness.ts");
    const feedback = await startNativeFeedback(window.interactionEngines.at(-1)!);
    Object.assign(window, { stopNativeFeedback: feedback.stop });
    return { overlayReports: feedback.overlayReports, toastEntries: feedback.toastEntries };
  });
  expect(feedback.overlayReports).toBeGreaterThan(0);
  expect(feedback.toastEntries).toBeGreaterThan(0);
  await expectApplicationViewer(page);
  await page.evaluate(async () => {
    await (window as unknown as { stopNativeFeedback: () => Promise<void> }).stopNativeFeedback();
  });
  for (const theme of ["light", "dark"] as const) {
    const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
    if (await toggle.count()) await toggle.click();
    await settled();
    await page.screenshot({ path: info.outputPath(`${theme}-owned-annotations.png`) });
  }
  const viewport = page.viewportSize()!;
  const remount = async (size: { width: number; height: number }) => {
    const mounts = await page.evaluate(() => window.interactionEngines.length);
    await page.setViewportSize(size);
    await expect.poll(() => page.evaluate(() => window.interactionEngines.length)).toBeGreaterThan(mounts);
    await settled();
  };
  await remount({ width: viewport.width > 840 ? 600 : 1100, height: viewport.height });
  await remount(viewport);
  const open = async (name: string) => {
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
  };
  await open(other.name);
  await expect(page.getByRole("heading", { name: other.name, exact: true })).toBeVisible();
  await expectApplicationViewer(page, false);
  await open(project.name);
  await settled();
  expect(await (await request.get(path)).json()).toEqual(persistedBefore);
  expect(await (await request.get(`${path}/entries/${entry.id}/original`)).body()).toEqual(original);
  expect(lifecycleErrors, "Nested viewer roots must unmount outside the parent React commit").toEqual([]);
});
