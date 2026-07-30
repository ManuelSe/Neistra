import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { useWorkspaceStore } from "../store/workspace";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

describe("project workspace", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.setState({
      theme: "light",
      activeProjectId: null,
      mobilePanel: null,
    });
    vi.restoreAllMocks();
  });

  it("creates a real project and exposes its durable checkpoint state", async () => {
    const user = userEvent.setup();
    const created = {
      schema_version: 1 as const,
      id: "project-1",
      name: "Kinase panel",
      description: null,
      revision: 0,
      checkpoint_revision: 0,
      has_uncheckpointed_changes: false,
      created_at: "2026-07-30T10:00:00Z",
      modified_at: "2026-07-30T10:00:00Z",
      entries: [],
      groups: [],
      history: {
        can_undo: false,
        can_redo: false,
        undo_description: null,
        redo_description: null,
        retained_commands: 0,
        limit: 200,
      },
    };
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const path =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (path === "/api/v1/projects" && init?.method === "POST") {
        return Promise.resolve(response(created, 201));
      }
      if (path === "/api/v1/projects/project-1") {
        return Promise.resolve(response(created));
      }
      return Promise.resolve(
        response([
          {
            ...created,
            entry_count: 0,
          },
        ]),
      );
    });

    renderApp();
    await screen.findByRole("heading", { name: "No project open" });
    await user.click(screen.getByRole("button", { name: "Create project" }));
    await user.type(screen.getByLabelText("Name"), "Kinase panel");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(await screen.findByRole("heading", { name: "Kinase panel" })).toBeInTheDocument();
    expect(screen.getByText("Checkpoint saved")).toBeInTheDocument();
  });

  it("persists and applies the theme choice", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response([]));
    renderApp();

    await screen.findByRole("heading", { name: "No project open" });
    await user.click(screen.getByRole("button", { name: "Use dark theme" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(useWorkspaceStore.getState().theme).toBe("dark");
  });

  it("surfaces an unavailable local API and recovers on retry", async () => {
    const user = userEvent.setup();
    let offline = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      offline ? Promise.reject(new TypeError("offline")) : Promise.resolve(response([])),
    );
    renderApp();

    expect(await screen.findByRole("alert")).toHaveTextContent("Local API unavailable");
    offline = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("heading", { name: "No project open" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
