import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { prepare } from "./support/interactions";
import { current, panel, select, structures } from "./support/minimization";

const names = ["Transform selection", "Edit molecule", "Minimize selection"];

test("unifies exactly three launchers with equal desktop/touch geometry and keyboard setup", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const p = await prepare(page, request, ["tests/fixtures/quick-minimization/New_molecule.sdf"], "Molecular toolbar");
  await select(page, [{ structure_id: p.entries[0].id, atom_id: 1 }], info.project.name === "mobile-chromium");
  const originalViewport = page.viewportSize()!;
  const group = page.getByRole("group", { name: "Molecular tools", exact: true });
  const submissions: string[] = [];
  page.on("request", r => { if (r.method() === "POST" && r.url().includes("minimizations")) submissions.push(r.url()); });
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "Use dark theme" }).click();
    for (const width of [originalViewport.width, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(group).toHaveAttribute("data-transform-active", "false");
      await expect(group.getByRole("button")).toHaveCount(3);
      for (const [index, name] of names.entries()) await expect(group.getByRole("button").nth(index)).toHaveAccessibleName(name);
      const geometry = await group.evaluate(node => {
        const bar = node.getBoundingClientRect(), style = getComputedStyle(node);
        return { x: bar.x, right: bar.right, y: bar.y, width: bar.width, viewport: innerWidth,
          size: matchMedia("(any-pointer: coarse)").matches || innerWidth <= 840 ? 44 : 32,
          border: style.borderTopWidth, gap: style.gap, padding: style.padding,
          buttons: Array.from(node.querySelectorAll("button"), button => {
            const b = button.getBoundingClientRect(), s = getComputedStyle(button), icon = button.querySelector("svg")!.getBoundingClientRect();
            return { x: b.x, y: b.y, width: b.width, height: b.height, border: s.borderTopWidth,
              iconWidth: icon.width, iconHeight: icon.height, dx: icon.x + icon.width / 2 - b.x - b.width / 2, dy: icon.y + icon.height / 2 - b.y - b.height / 2 };
          }) };
      });
      expect(geometry.border).toBe("1px"); expect(geometry.gap).toBe("3px"); expect(geometry.padding).toBe("3px");
      expect(geometry.x).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
      for (const button of geometry.buttons) {
        expect(button.width).toBe(geometry.size); expect(button.height).toBe(geometry.size);
        expect(button.y).toBe(geometry.buttons[0].y); expect(button.border).toBe("0px");
        expect(button.iconWidth).toBe(16); expect(button.iconHeight).toBe(16);
        expect(Math.abs(button.dx)).toBeLessThanOrEqual(0.5); expect(Math.abs(button.dy)).toBeLessThanOrEqual(0.5);
      }
      const selectionBar = await page.locator(".viewer-toolbar").boundingBox();
      expect(geometry.y).toBeGreaterThanOrEqual(selectionBar!.y + selectionBar!.height);
      expect(await group.locator(".transform-launcher").evaluate(node => getComputedStyle(node).borderTopWidth)).toBe("0px");
      expect((await new AxeBuilder({ page }).include(".viewer-edit-transform-actions").analyze()).violations).toEqual([]);
      await group.getByRole("button", { name: names[0], exact: true }).focus();
      await page.keyboard.press("Tab"); await expect(group.getByRole("button", { name: names[1], exact: true })).toBeFocused();
      await page.keyboard.press("Tab");
      const minimize = group.getByRole("button", { name: names[2], exact: true });
      await expect(minimize).toBeFocused();
      await expect(page.getByRole("tooltip")).toContainText("Open minimization settings");
      await page.keyboard.press("Enter"); await expect(panel(page)).toBeFocused();
      await expect(panel(page).getByRole("button", { name: "Run quick minimization", exact: true })).toBeEnabled();
      expect(submissions).toEqual([]);
      await page.keyboard.press("Escape"); await expect(panel(page)).toBeHidden(); await expect(minimize).toBeFocused();
      await page.locator(".molstar-host canvas").first().focus();
      await page.mouse.move(1, 1);
      await page.screenshot({ path: info.outputPath(`${theme}-${width}-molecular-tools.png`) });
    }
  }
  expect((await current(request, p.id)).revision).toBe(p.revision);
});

test("retains the expanded transform strip without a nested frame or a canonical edit on Cancel", async ({ page, request }, info) => {
  test.setTimeout(60000);
  const p = await prepare(page, request, ["tests/fixtures/quick-minimization/New_molecule.sdf"], "Expanded tools");
  const before = await structures(request, p);
  await select(page, [{ structure_id: p.entries[0].id, atom_id: 1 }], info.project.name === "mobile-chromium");
  const group = page.getByRole("group", { name: "Molecular tools", exact: true });
  await group.getByRole("button", { name: "Transform selection", exact: true }).click();
  await expect(group).toHaveAttribute("data-transform-active", "true");
  await expect(group.getByRole("button", { name: "Apply movement", exact: true })).toBeVisible();
  await expect(group.getByRole("button", { name: "Edit molecule", exact: true })).toHaveCount(0);
  await expect(group.getByRole("button", { name: "Minimize selection", exact: true })).toHaveAttribute("aria-disabled", "true");
  expect(await group.evaluate(node => getComputedStyle(node).borderTopWidth)).toBe("0px");
  expect(await group.locator(".movement-banner").evaluate(node => getComputedStyle(node).borderTopWidth)).toBe("1px");
  await group.getByRole("button", { name: "More movement tools", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "More movement tools", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await group.getByRole("button", { name: "Cancel movement", exact: true }).click();
  await expect(group.getByRole("button")).toHaveCount(3);
  expect(await structures(request, p)).toEqual(before);
});

test("reveals a quiet shortcut during publication without resubmission or focus theft beforehand", async ({ page, request }, info) => {
  test.setTimeout(60000);
  const p = await prepare(page, request, ["tests/fixtures/quick-minimization/New_molecule.sdf"], "Reveal quick run");
  await select(page, p.entries[0].atom_ids.map(atom_id => ({ structure_id: p.entries[0].id, atom_id })), info.project.name === "mobile-chromium");
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const applying = new Promise<void>(resolve => { entered = resolve; });
  let submissions = 0;
  page.on("request", r => { if (r.method() === "POST" && /\/quick-minimizations$/.test(r.url())) submissions++; });
  await page.route("**/quick-minimizations/*/apply", async route => {
    const response = await route.fetch(); entered(); await held; await route.fulfill({ response });
  });
  const minimize = page.getByRole("button", { name: "Minimize selection", exact: true });
  await minimize.focus(); await expect(minimize).toBeFocused();
  await page.keyboard.press("Control+m");
  await applying;
  await expect(panel(page)).toBeHidden(); await expect(minimize).toBeFocused();
  await expect(minimize).toHaveAttribute("aria-disabled", "false");
  await minimize.click(); await expect(panel(page)).toBeFocused();
  expect(submissions).toBe(1);
  release();
  await expect(panel(page)).toContainText("Quick coordinates applied", { timeout: 10000 });
  expect((await current(request, p.id)).revision).toBe(p.revision + 1);
  expect(submissions).toBe(1);
});


test("retires a quiet run after status transport failure without a late canonical edit", async ({ page, request }, info) => {
  test.setTimeout(60000);
  const p = await prepare(page, request, ["tests/fixtures/quick-minimization/New_molecule.sdf"], "Quick status failure");
  const before = await structures(request, p);
  await select(page, p.entries[0].atom_ids.map(atom_id => ({ structure_id: p.entries[0].id, atom_id })), info.project.name === "mobile-chromium");
  await page.route("**/api/v1/jobs/*", async route => {
    if (route.request().method() === "GET") await route.fulfill({ status: 503, json: { detail: { code: "status_unavailable", message: "Temporary job status failure" } } });
    else await route.continue();
  });
  const cancelled = page.waitForResponse(r => r.request().method() === "POST" && /\/jobs\/[^/]+\/cancel$/.test(new URL(r.url()).pathname));
  await page.keyboard.press("Control+m");
  expect((await cancelled).ok()).toBe(true);
  await expect(page.getByRole("alert")).toContainText("Temporary job status failure");
  await expect(panel(page)).toBeHidden();
  expect((await current(request, p.id)).revision).toBe(p.revision);
  expect(await structures(request, p)).toEqual(before);
});

test("hands Style selection focus to explicit minimization setup", async ({ page, request }, info) => {
  test.setTimeout(60000);
  const p = await prepare(page, request, ["tests/fixtures/quick-minimization/New_molecule.sdf"], "Style Minimize handoff");
  await select(page, [{ structure_id: p.entries[0].id, atom_id: 1 }], info.project.name === "mobile-chromium");
  const style = page.getByRole("button", { name: "Style selection", exact: true });
  await style.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Style selection", exact: true })).toBeVisible();
  const minimize = page.getByRole("button", { name: "Minimize selection", exact: true });
  await minimize.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Style selection", exact: true })).toBeHidden();
  await expect(panel(page)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(panel(page).getByRole("button", { name: "Close minimization", exact: true })).toBeFocused();
  expect((await current(request, p.id)).revision).toBe(p.revision);
});
