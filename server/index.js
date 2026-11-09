import { loadConfig } from "./config.js";
import { openDatabase } from "./database.js";
import { createVetCareServer } from "./app.js";

const config = loadConfig();

let database;
try {
  database = await openDatabase({
    filename: config.databasePath,
    adminEmail: config.adminEmail,
    adminName: config.adminName,
    adminPassword: config.adminPassword,
    resetAdminPassword: config.resetAdminPassword,
  });
} catch (error) {
  console.error(`[db] ${error.message}`);
  process.exit(1);
}

const adminStatusLabels = {
  created: "criado",
  unchanged: "já existia",
  password_reset: "senha redefinida",
};

if (config.seedOnly) {
  console.log(`[db] Banco preparado em ${config.databasePath}.`);
  console.log(
    `[db] Administrador ${config.adminEmail}: ${adminStatusLabels[database.adminStatus] ?? database.adminStatus}.`,
  );
  database.close();
  process.exit(0);
}

const server = createVetCareServer({
  database,
  sessionTtlHours: config.sessionTtlHours,
  cookieSecure: config.cookieSecure,
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `[api] A porta ${config.port} já está em uso. Encerre o outro processo ou defina PORT.`,
    );
  } else {
    console.error("[api] erro no servidor:", error);
  }

  database.close();
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  const displayHost = config.host === "0.0.0.0" ? "localhost" : config.host;
  console.log(`[api] VetCare disponível em http://${displayHost}:${config.port}`);
  console.log(
    `[api] Administrador: ${config.adminEmail} (${adminStatusLabels[database.adminStatus] ?? database.adminStatus}).`,
  );
  console.log(
    `[api] Sessões expiram em ${config.sessionTtlHours}h. Para o frontend em desenvolvimento, use a URL exibida pelo Vite.`,
  );
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`\n[api] ${signal} recebido. Encerrando...`);

  server.close(() => {
    database.close();
    process.exit(0);
  });

  setTimeout(() => {
    database.close();
    process.exit(1);
  }, 5_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
