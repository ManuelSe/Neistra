import { expect, test } from "@playwright/test";
import { prepare } from "./support/interactions";
import { frame, openPresentation } from "./support/presentation";
import { performanceBudget } from "./support/performance";

test("keeps large-scene capture bounded across repeated opening, navigation and closure", async ({ page, request }, info) => {
  test.skip(info.project.name !== "chromium", "Detached rendering resources are qualified on desktop Chromium");
  test.setTimeout(240000);
  const started = Date.now();
  const project = await prepare(page, request, ["tests/fixtures/surfaces/1aon.cif"], "Presentation resources");
  await expect(page.getByLabel("Loading molecular structures")).toHaveCount(0);
  expect(project.entries[0].atom_count).toBeGreaterThan(50000);
  const importMs = Date.now() - started;
  const before = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  const normalizedReads: string[] = [];
  page.on("request", outgoing => { if (new URL(outgoing.url()).pathname.endsWith("/structure")) normalizedReads.push(outgoing.url()); });
  await page.evaluate(() => {
    const engine = window.interactionEngines.at(-1)!;
    const capture = engine.capturePresentation.bind(engine);
    const state = { tracks: [] as MediaStreamTrack[], longestTask: 0, rendererCount: window.interactionEngines.length };
    Object.assign(window, { presentationResources: state });
    new PerformanceObserver(list => {
      state.longestTask = Math.max(state.longestTask, ...list.getEntries().map(entry => entry.duration));
    }).observe({ type: "longtask", buffered: false });
    engine.capturePresentation = () => {
      const source = capture(); state.tracks.push(...source.stream.getTracks()); return source;
    };
  });
  const inspect = () => page.evaluate(() => {
    const state = (window as unknown as { presentationResources: {
      tracks: MediaStreamTrack[]; longestTask: number; rendererCount: number;
    } }).presentationResources;
    return { sources: state.tracks.length, active: state.tracks.filter(track => track.readyState === "live").length,
      longestTask: state.longestTask, renderers: window.interactionEngines.length, initialRenderers: state.rendererCount };
  });
  const openMs: number[] = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    const opening = Date.now();
    const child = await openPresentation(page);
    await expect.poll(async () => (await frame(child)).colored).toBeGreaterThan(100);
    openMs.push(Date.now() - opening);
    const resource = await inspect();
    expect(resource.active).toBe(1); expect(resource.sources).toBe(cycle + 1);
    expect(resource.renderers).toBe(resource.initialRenderers);
    expect(await child.locator("canvas, .molstar-host, .viewer-toolbar").count()).toBe(0);
    await page.bringToFront();
    const canvas = page.locator(".molstar-host canvas").first();
    await canvas.hover(); await page.mouse.wheel(0, -80); await page.mouse.wheel(0, 80);
    await expect.poll(async () => (await frame(child)).colored).toBeGreaterThan(100);
    await child.close();
    await expect.poll(async () => (await inspect()).active).toBe(0);
  }
  const resource = await inspect();
  performanceBudget(resource.longestTask, 750, "presentation large-scene longest task");
  expect(normalizedReads).toEqual([]);
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(before);
  await info.attach("presentation-resource-profile", { body: JSON.stringify({ atoms: project.entries[0].atom_count,
    importMs, openMs, ...resource, normalizedReads }), contentType: "application/json" });
});
