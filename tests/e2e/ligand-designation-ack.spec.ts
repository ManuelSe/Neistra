import { expect, test } from "@playwright/test";
import type { Project } from "../../apps/web/src/api/types";
import { prepare } from "./support/interactions";

// These columns are written in UTC; SQLite readback omits the UTC suffix.
// Preserve every timestamp digit and compare every other project field exactly.
const persistedProject = (project: Project): Project => ({ ...project,
  modified_at: project.modified_at.replace(/Z$/, ""),
  entries: project.entries.map(entry => ({ ...entry, modified_at: entry.modified_at.replace(/Z$/, "") })),
});

for (const theme of ["light", "dark"] as const) test(`keeps replacement ligand choices through real Use and Clear acknowledgements (${theme})`, async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 700 });
  const initial = await prepare(page, request, [{ name: "acknowledged-copies.smi", mimeType: "chemical/x-daylight-smiles",
    buffer: Buffer.from("CCO.CCO exact copies\n") }], `Ligand acknowledgements ${theme}`);
  const entry = initial.entries[0], base = `/api/v1/projects/${initial.id}`;
  const original = await (await request.get(`${base}/entries/${entry.id}/original`)).body();
  const readSelection = () => page.evaluate(async () => {
    const { useSelectionStore } = await import("/src/store/selection.ts");
    const state = useSelectionStore.getState();
    return { selection: state.selection, order: state.inspectionOrder, anchor: state.rangeAnchor };
  });
  const selection = await readSelection();
  const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
  if (await toggle.count()) await toggle.click();
  await page.getByRole("button", { name: "Inspector", exact: true }).click();
  const controls = page.getByRole("region", { name: "Ligand of interest", exact: true });
  await controls.getByRole("combobox", { name: "Entry", exact: true }).selectOption(entry.id);
  const controlsElement = await controls.elementHandle();
  // The modal intentionally hides background controls from role queries. Observe
  // their existing DOM for the ACK state while interacting only with the modal.
  const summaryState = () => controlsElement!.evaluate(element => ({
    action: element.querySelector(".ligand-designation-summary .secondary-button")?.textContent?.trim(),
    text: element.querySelector(".ligand-designation-current > strong")?.textContent?.trim(),
    saving: [...element.querySelectorAll(".ligand-designation-notice")]
      .some(notice => notice.textContent === "Saving ligand choice…"),
    backgroundHidden: element.closest('[aria-hidden="true"]') !== null,
  }));
  type Held = { saved: Promise<Project>; capture: (value: Project) => void; wait: Promise<void>; release: () => void };
  let pending: Held | null = null;
  const releases: (() => void)[] = [];
  const holdAcknowledgement = () => {
    let capture!: Held["capture"], release!: Held["release"];
    const saved = new Promise<Project>(resolve => { capture = resolve; });
    const wait = new Promise<void>(resolve => { release = resolve; });
    const held = { saved, capture, wait, release };
    pending = held; releases.push(release); return held;
  };
  await page.route(url => url.pathname === `${base}/entries/${entry.id}/ligand-designation`, async route => {
    const held = pending;
    if (route.request().method() !== "PUT" || !held) { await route.continue(); return; }
    pending = null;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    held.capture(await response.json() as Project);
    await held.wait;
    await route.fulfill({ response });
  });
  const dialog = page.getByRole("dialog", { name: "Choose ligand of interest", exact: true });
  const open = async () => {
    await controls.getByRole("button", { name: /^(Choose|Change)$/, exact: true }).click();
    await expect(dialog.getByRole("radio")).toHaveCount(2);
  };
  const evidence = [];
  try {
    for (const operation of ["Use", "Clear"] as const) {
      const held = holdAcknowledgement();
      if (operation === "Use") {
        await open();
        const chosen = dialog.getByRole("radio").nth(1);
        if (info.project.name === "mobile-chromium") await chosen.tap(); else await chosen.check();
        await dialog.getByRole("button", { name: "Use ligand", exact: true }).click();
      } else {
        await controls.getByRole("button", { name: "Clear", exact: true }).click();
      }
      const acknowledged = await held.saved;
      expect(acknowledged.entries[0].ligand_designation.status).toBe(operation === "Use" ? "resolved" : "cleared");
      if (operation === "Use") {
        expect(acknowledged.entries[0].ligand_designation.origin).toBe("manual");
        expect(acknowledged.entries[0].ligand_designation.instance_id).toBeTruthy();
        await dialog.getByRole("button", { name: "Close", exact: true }).click();
      }
      await open();
      const replacement = await dialog.elementHandle();
      const radio = await dialog.getByRole("radio").nth(1).elementHandle();
      const cancel = dialog.locator(".ligand-candidate-actions").getByRole("button", { name: /^(Close|Cancel)$/, exact: true });
      await expect(cancel).toHaveText("Close");
      await cancel.focus(); await expect(cancel).toBeFocused();
      held.release();
      await expect.poll(async () => (await summaryState()).action).toBe(operation === "Use" ? "Change" : "Choose");
      if (operation === "Clear") await expect.poll(async () => (await summaryState()).text).toBe("Left unassigned");
      await expect.poll(async () => (await summaryState()).saving).toBe(false);
      await expect(dialog.getByRole("button", { name: "Use ligand", exact: true })).toBeDisabled();
      await expect(cancel).toHaveText("Cancel");
      await expect(cancel).toBeFocused();
      expect(await replacement!.evaluate(element => element.isConnected)).toBe(true);
      expect(await radio!.evaluate(element => element.isConnected)).toBe(true);
      await expect(dialog.getByRole("radio").nth(1)).not.toBeChecked();
      const observed = await dialog.evaluate(element => {
        const panel = element.getBoundingClientRect();
        const header = element.querySelector(".ligand-candidate-header")!.getBoundingClientRect();
        return { outerScrollTop: element.scrollTop, panelTop: panel.top, headerTop: header.top };
      });
      expect(observed.outerScrollTop).toBe(0); expect(observed.headerTop).toBeGreaterThanOrEqual(observed.panelTop);
      expect(persistedProject(await (await request.get(base)).json() as Project)).toEqual(persistedProject(acknowledged));
      await cancel.click(); await expect(dialog).toBeHidden();
      await expect(controls.getByRole("button", { name: /^(Choose|Change)$/, exact: true })).toBeFocused();
      evidence.push({ operation, revision: acknowledged.revision, status: acknowledged.entries[0].ligand_designation.status, summary: await summaryState(), observed });
    }
    const final: Project = await (await request.get(base)).json();
    expect(final.revision).toBe(initial.revision + 2);
    expect(final.entries[0].current_artifact_id).toBe(entry.current_artifact_id);
    expect(await (await request.get(`${base}/entries/${entry.id}/original`)).body()).toEqual(original);
    expect(await readSelection()).toEqual(selection);
    await info.attach("real-designation-acknowledgements", { body: JSON.stringify(evidence), contentType: "application/json" });
  } finally {
    releases.forEach(release => release());
    await page.unrouteAll({ behavior: "wait" });
  }
});
