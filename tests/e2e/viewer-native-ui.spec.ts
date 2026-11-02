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
