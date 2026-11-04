import { expect, type Page } from "@playwright/test";

export async function frame(page: Page) {
  return page.locator("video").evaluate((video: HTMLVideoElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(video, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    let colored = 0;
    for (let i = 0; i < data.length; i += 4) {
      hash = Math.imul(hash ^ data[i], 16777619);
      if (Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) > 35) colored++;
    }
    return { width: canvas.width, height: canvas.height, hash: hash >>> 0, colored };
  });
}

export async function matchesSource(child: Page, source: Buffer) {
  return child.locator("video").evaluate(async (video: HTMLVideoElement, png: string) => {
    const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const expected = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    ctx.drawImage(video, 0, 0);
    const actual = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let matching = 0, content = 0;
    for (let i = 0; i < expected.length; i += 4) {
      if (Math.max(...[0, 1, 2].map(c => Math.abs(expected[i + c] - expected[c]))) < 25) continue;
      content++;
      if (Math.max(...[0, 1, 2].map(c => Math.abs(expected[i + c] - actual[i + c]))) < 30) matching++;
    }
    return { content, fraction: matching / Math.max(1, content) };
  }, source.toString("base64"));
}

export async function sourceRaster(page: Page) {
  const encoded = await page.evaluate(async () => {
    const engine = window.interactionEngines.at(-1)! as unknown as {
      syncQueue: Promise<void>;
      plugin: { canvas3d: { requestDraw(): void } };
    };
    await engine.syncQueue;
    const canvas = document.querySelector<HTMLCanvasElement>(".molstar-host canvas")!;
    engine.plugin.canvas3d.requestDraw();
    // Read the actual canvas, excluding application controls composited above it.
    return await new Promise<string>(resolve => requestAnimationFrame(() => resolve(canvas.toDataURL().split(",")[1])));
  });
  return Buffer.from(encoded, "base64");
}

export async function openPresentation(page: Page) {
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Detach viewer", exact: true }).click();
  const child = await opened;
  await expect(child.locator("video")).toBeVisible();
  return child;
}

export async function openProject(page: Page, name: string) {
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
}

export async function expectMirror(page: Page, child: Page) {
  await expect(child.locator("video")).toBeVisible();
  const source = await sourceRaster(page);
  await expect.poll(async () => (await matchesSource(child, source)).fraction).toBeGreaterThan(0.95);
}
