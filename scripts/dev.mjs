import { spawn, spawnSync } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const STARTUP_TIMEOUT_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const modulePath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(modulePath), "..");

export function parsePort(value, name, fallback) {
  const raw = value ?? String(fallback);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  const port = Number(raw);
  if (port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return port;
}

export function resolvePython(root, platform = process.platform) {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  return platform === "win32"
    ? pathApi.join(root, ".venv", "Scripts", "python.exe")
    : pathApi.join(root, ".venv", "bin", "python");
}

export function buildConfiguration({
  root = repositoryRoot,
  environment = process.env,
  platform = process.platform,
} = {}) {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const delimiter = platform === "win32" ? ";" : ":";
  const apiPort = parsePort(environment.MOLWEAVE_API_PORT, "MOLWEAVE_API_PORT", 8000);
  const webPort = parsePort(environment.MOLWEAVE_WEB_PORT, "MOLWEAVE_WEB_PORT", 5173);
  const pythonPath = [
    pathApi.join(root, "apps", "api", "src"),
    pathApi.join(root, "packages", "molweave_core", "src"),
    pathApi.join(root, "packages", "molweave_demo_plugin", "src"),
    environment.PYTHONPATH,
  ]
    .filter(Boolean)
    .join(delimiter);
  const sharedEnvironment = {
    ...environment,
    MOLWEAVE_DATA_DIR: environment.MOLWEAVE_DATA_DIR ?? ".molweave",
    PYTHONPATH: pythonPath,
  };

  return {
    root,
    platform,
    python: resolvePython(root, platform),
    packageRunner: platform === "win32" ? "corepack.cmd" : "corepack",
    apiPort,
    webPort,
    apiUrl: `http://127.0.0.1:${apiPort}`,
    webUrl: `http://127.0.0.1:${webPort}`,
    sharedEnvironment,
    webEnvironment: {
      ...sharedEnvironment,
      VITE_API_TARGET:
        environment.VITE_API_TARGET ?? `http://127.0.0.1:${apiPort}`,
    },
  };
}

export function buildCommands(configuration) {
  const {
    apiPort,
    python,
    packageRunner,
    sharedEnvironment,
    webEnvironment,
    webPort,
  } = configuration;
  return {
    migration: {
      label: "migrate",
      command: python,
      args: ["-m", "alembic", "upgrade", "head"],
      environment: sharedEnvironment,
    },
    services: [
      {
        label: "api",
        command: python,
        args: [
          "-m",
          "uvicorn",
          "molweave_api.main:app",
          "--host",
          "127.0.0.1",
          "--port",
          String(apiPort),
        ],
        environment: sharedEnvironment,
      },
      {
        label: "worker",
        command: python,
        args: ["-m", "molweave_api.worker"],
        environment: sharedEnvironment,
      },
      {
        label: "web",
        command: packageRunner,
        args: [
          "pnpm",
          "--dir",
          "apps/web",
          "dev",
          "--host",
          "127.0.0.1",
          "--port",
          String(webPort),
          "--strictPort",
        ],
        environment: webEnvironment,
      },
    ],
  };
}

function assertReadableExecutable(file, message) {
  try {
    accessSync(file, fsConstants.R_OK | fsConstants.X_OK);
  } catch {
    throw new Error(message);
  }
}

export function checkPrerequisites(configuration) {
  const setup =
    configuration.platform === "win32"
      ? [
          "py -3.12 -m venv .venv",
          ".venv\\Scripts\\python -m pip install uv",
          ".venv\\Scripts\\uv sync --frozen",
          "corepack pnpm install --frozen-lockfile",
        ].join("\n  ")
      : [
          "python3.12 -m venv .venv",
          ".venv/bin/python -m pip install uv",
          ".venv/bin/uv sync --frozen",
          "corepack pnpm install --frozen-lockfile",
        ].join("\n  ");
  assertReadableExecutable(
    configuration.python,
    `Python environment not found. Run the one-time setup:\n  ${setup}`,
  );

  const version = spawnSync(configuration.python, ["--version"], {
    cwd: configuration.root,
    encoding: "utf8",
    windowsHide: true,
  });
  const versionText = `${version.stdout ?? ""}${version.stderr ?? ""}`.trim();
  if (version.status !== 0 || !/^Python 3\.12\./.test(versionText)) {
    throw new Error(
      `Neistra requires Python 3.12 in .venv; found ${versionText || "an unusable environment"}.`,
    );
  }
  if (Number(process.versions.node.split(".")[0]) !== 22) {
    throw new Error(`Neistra requires Node.js 22; found ${process.version}.`);
  }

  try {
    const requireFromRoot = createRequire(path.join(configuration.root, "package.json"));
    requireFromRoot.resolve("vite/package.json", {
      paths: [path.join(configuration.root, "apps", "web")],
    });
  } catch {
    throw new Error(
      "Web dependencies are not installed. Run: corepack pnpm install --frozen-lockfile",
    );
  }
}

function prefixStream(stream, destination, label) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      destination.write(`[${label}] ${line}\n`);
    }
  });
  stream.on("end", () => {
    if (pending) {
      destination.write(`[${label}] ${pending}\n`);
    }
  });
}

export function startProcess(specification, configuration, spawnProcess = spawn) {
  const child = spawnProcess(specification.command, specification.args, {
    cwd: configuration.root,
    env: specification.environment,
    detached: configuration.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  prefixStream(child.stdout, process.stdout, specification.label);
  prefixStream(child.stderr, process.stderr, specification.label);
  return child;
}

export async function runToCompletion(specification, configuration) {
  const child = startProcess(specification, configuration);
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  if (result.code !== 0) {
    throw new Error(
      `${specification.label} failed${
        result.code === null ? ` with signal ${result.signal}` : ` with exit code ${result.code}`
      }.`,
    );
  }
}

export async function waitForUrl(
  url,
  timeoutMs = STARTUP_TIMEOUT_MS,
  fetchResource = fetch,
  abortSignal,
) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    abortSignal?.throwIfAborted();
    try {
      const timeoutSignal = AbortSignal.timeout(1_000);
      const signal = abortSignal
        ? AbortSignal.any([abortSignal, timeoutSignal])
        : timeoutSignal;
      const response = await fetchResource(url, { signal });
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (abortSignal?.aborted) {
        throw error;
      }
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const detail = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${url}.${detail}`);
}

function sendSignal(child, signal, platform) {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
    return;
  }
  try {
    if (platform === "win32") {
      const args = ["/pid", String(child.pid), "/T"];
      if (signal === "SIGKILL") {
        args.push("/F");
      }
      const result = spawnSync("taskkill", args, {
        stdio: "ignore",
        windowsHide: true,
      });
      if (result.status !== 0 && child.exitCode === null) {
        child.kill(signal === "SIGKILL" ? "SIGKILL" : "SIGTERM");
      }
    } else {
      process.kill(-child.pid, signal);
    }
  } catch (error) {
    if (error?.code !== "ESRCH") {
      throw error;
    }
  }
}

export async function stopProcesses(children, platform, timeoutMs = SHUTDOWN_TIMEOUT_MS) {
  for (const child of children) {
    sendSignal(child, "SIGTERM", platform);
  }
  const allExited = Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) {
            resolve();
          } else {
            child.once("exit", resolve);
          }
        }),
    ),
  );
  const timedOut = await Promise.race([
    allExited.then(() => false),
    new Promise((resolve) => setTimeout(() => resolve(true), timeoutMs)),
  ]);
  if (!timedOut) {
    return;
  }

  if (platform === "win32") {
    for (const child of children) {
      if (child.exitCode === null && child.pid !== undefined) {
        sendSignal(child, "SIGKILL", platform);
      }
    }
  } else {
    for (const child of children) {
      sendSignal(child, "SIGKILL", platform);
    }
  }
  await allExited;
}

export async function main() {
  const configuration = buildConfiguration();
  const commands = buildCommands(configuration);
  checkPrerequisites(configuration);

  process.stdout.write("[neistra] Applying database migrations...\n");
  await runToCompletion(commands.migration, configuration);

  const children = [];
  let shuttingDown = false;
  let shutdownPromise;
  const readinessController = new AbortController();
  let resolveStopped;
  const stopped = new Promise((resolve) => {
    resolveStopped = resolve;
  });
  let rejectUnexpectedExit;
  const unexpectedExit = new Promise((_, reject) => {
    rejectUnexpectedExit = reject;
  });

  const shutdown = (exitCode) => {
    if (!shutdownPromise) {
      shuttingDown = true;
      readinessController.abort();
      shutdownPromise = stopProcesses(children, configuration.platform).finally(() => {
        process.exitCode = exitCode;
        resolveStopped();
      });
    }
    return shutdownPromise;
  };
  process.once("SIGINT", () => void shutdown(130));
  process.once("SIGTERM", () => void shutdown(143));

  try {
    for (const service of commands.services) {
      const child = startProcess(service, configuration);
      children.push(child);
      child.once("error", (error) => {
        if (!shuttingDown) {
          rejectUnexpectedExit(new Error(`${service.label} failed to start: ${error.message}`));
        }
      });
      child.once("exit", (code, signal) => {
        if (!shuttingDown) {
          rejectUnexpectedExit(
            new Error(
              `${service.label} stopped unexpectedly${
                code === null ? ` with signal ${signal}` : ` with exit code ${code}`
              }.`,
            ),
          );
        }
      });
    }

    await Promise.race([
      Promise.all([
        waitForUrl(
          `${configuration.apiUrl}/api/v1/health`,
          STARTUP_TIMEOUT_MS,
          fetch,
          readinessController.signal,
        ),
        waitForUrl(
          configuration.webUrl,
          STARTUP_TIMEOUT_MS,
          fetch,
          readinessController.signal,
        ),
      ]),
      unexpectedExit,
    ]);
    process.stdout.write(
      [
        "[neistra] Ready.",
        `[neistra] Application: ${configuration.webUrl}`,
        `[neistra] API docs: ${configuration.apiUrl}/api/docs`,
        "[neistra] Press Ctrl+C to stop all services.",
      ].join("\n") + "\n",
    );
    await Promise.race([unexpectedExit, stopped]);
  } catch (error) {
    if (shuttingDown) {
      await shutdownPromise;
      return;
    }
    process.stderr.write(`[neistra] ${error instanceof Error ? error.message : String(error)}\n`);
    await shutdown(1);
  }
}

if (path.resolve(process.argv[1] ?? "") === modulePath) {
  main().catch((error) => {
    process.stderr.write(`[neistra] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
