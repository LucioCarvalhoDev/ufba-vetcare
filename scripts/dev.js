import { spawn } from "node:child_process";
import { resolve } from "node:path";

const children = [];
let shuttingDown = false;

function start(name, command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  children.push({ name, child, exited: false });

  child.on("exit", (code, signal) => {
    const entry = children.find((item) => item.child === child);
    if (entry) {
      entry.exited = true;
    }

    if (shuttingDown) {
      return;
    }

    console.error(
      `[dev] ${name} encerrou (${signal ?? `código ${code}`}). Encerrando...`,
    );
    shutdown(code ?? 1);
  });

  child.on("error", (error) => {
    console.error(`[dev] Não foi possível iniciar ${name}:`, error.message);
    shutdown(1);
  });

  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const { child, exited } of children) {
    if (!exited) {
      child.kill("SIGINT");
    }
  }

  setTimeout(() => {
    for (const { child, exited } of children) {
      if (!exited) {
        child.kill("SIGKILL");
      }
    }
    process.exit(code);
  }, 1_000).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start("api", process.execPath, ["--watch", "server/index.js"]);
start("web", process.execPath, [resolve("node_modules/vite/bin/vite.js")]);
