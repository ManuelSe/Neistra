import { expect, test } from "@playwright/test";
import type { Job, QuickMinimizationProposal } from "../../apps/web/src/api/types";
import { prepare } from "./support/interactions";
import { current, panel, structures } from "./support/minimization";

test("keeps warned Ctrl+M results quiet while retaining full inspection and exact Undo/Redo", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const project = await prepare(page, request, ["tests/fixtures/quick-minimization/New_molecule.sdf"], "Quiet warned minimization");
  const entry = project.entries[0];
  const before = await structures(request, project);
  const originalPath = `/api/v1/projects/${project.id}/entries/${entry.id}/original`;
  const original = await (await request.get(originalPath)).body();
  const mobile = info.project.name === "mobile-chromium";
  if (await page.locator(".notice").isVisible()) {
    await page.getByRole("button", { name: "Dismiss message", exact: true }).click();
  }
  if (mobile) await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("tab", { name: "selection", exact: true }).click();
  await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("structure");
  await page.getByRole("textbox", { name: "Value", exact: true }).fill(entry.id);
  await page.getByRole("button", { name: "Apply query", exact: true }).click();
  await expect(page.locator(".viewer-status")).toContainText(`/ ${entry.atom_count} selected`);
  if (mobile) await page.getByRole("button", { name: "Close panel", exact: true }).click({ position: { x: 2, y: 100 } });
  const focusOwner = page.getByRole("button", { name: "Minimize selection", exact: true });
  await focusOwner.focus();
  await expect(focusOwner).toBeFocused();

  // Observe arrival as well as the final state: a warning wall must never flash
  // before a later short notice replaces it. No server response is fabricated.
  await page.evaluate(() => {
    const messages = new Set<string>();
    const collect = () => {
      const current = document.querySelector(".notice");
      if (!current) return;
      const copy = current.cloneNode(true) as HTMLElement;
      copy.querySelectorAll("button").forEach(button => button.remove());
      messages.add(copy.textContent?.trim() ?? "");
    };
    const observer = new MutationObserver(collect);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    (window as unknown as { readQuickNoticeMessages: () => string[] }).readQuickNoticeMessages = () => {
      collect(); observer.disconnect(); return [...messages];
    };
  });
  let applications = 0;
  page.on("request", request => {
    if (request.method() === "POST" && /\/quick-minimizations\/[^/]+\/apply$/.test(new URL(request.url()).pathname)) applications++;
  });
  const submitted = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/quick-minimizations"));
  await page.keyboard.press("Control+m");
  const submission = await submitted;
  expect(submission.status()).toBe(201);
  const job = await submission.json() as Job;
  await expect(page.getByRole("button", { name: /Undo: Quick minimize selection/ })).toBeEnabled({ timeout: 60000 });
  await expect.poll(async () => (await current(request, project.id)).revision).toBe(project.revision + 1);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(panel(page)).toBeHidden();
  await expect(focusOwner).toBeFocused();
  expect(applications).toBe(1);

  const proposalResponse = await request.get(`/api/v1/projects/${project.id}/quick-minimizations/${job.id}/proposal`);
  expect(proposalResponse.status()).toBe(200);
  const proposal = await proposalResponse.json() as QuickMinimizationProposal;
  expect(proposal.report.warnings.length).toBeGreaterThan(0);
  const messages = await page.evaluate(() => (window as unknown as { readQuickNoticeMessages: () => string[] }).readQuickNoticeMessages());
  expect(messages.every(text => text === "Quick minimization was stored locally.")).toBe(true);

  const updated = await current(request, project.id);
  expect(updated.history.retained_commands).toBe(project.history.retained_commands + 1);
  const after = await structures(request, updated);
  expect(after[entry.id].warnings.filter(warning => warning.code === "quick_minimization_limit").map(warning => warning.message)).toEqual(proposal.report.warnings);
  expect(after[entry.id].bonds).toEqual(before[entry.id].bonds);
  expect(after[entry.id].source).toEqual(before[entry.id].source);
  expect(after[entry.id].atoms.map(atom => atom.formal_charge)).toEqual(before[entry.id].atoms.map(atom => atom.formal_charge));
  expect(after[entry.id].atoms.map(atom => atom.coordinates)).not.toEqual(before[entry.id].atoms.map(atom => atom.coordinates));
  expect(await (await request.get(originalPath)).body()).toEqual(original);

  if (mobile) await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("tab", { name: "Jobs", exact: true }).click();
  await page.getByRole("button", { name: "Inspect minimization", exact: true }).click();
  await expect(panel(page).locator(".minimization-warning")).toHaveText(proposal.report.warnings);
  await panel(page).getByRole("button", { name: "Close minimization", exact: true }).click();
  // Inspect closes the mobile Jobs drawer; closing the report returns directly
  // to the canvas, with the existing history controls available.
  await page.getByRole("button", { name: /Undo: Quick minimize selection/ }).click();
  await expect.poll(() => structures(request, project)).toEqual(before);
  await page.getByRole("button", { name: /Redo: Quick minimize selection/ }).click();
  await expect.poll(() => structures(request, project)).toEqual(after);
  expect(applications).toBe(1);
  expect(await (await request.get(originalPath)).body()).toEqual(original);
  await info.attach("quiet-warned-minimization", { body: JSON.stringify({ messages, warnings: proposal.report.warnings, applications, jobId: job.id }), contentType: "application/json" });
});
