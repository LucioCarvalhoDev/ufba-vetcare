import { resolve } from "node:path";

function readInteger(value, fallback, { min, max, name }) {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} deve ser um inteiro entre ${min} e ${max}.`);
  }

  return parsed;
}

function readBoolean(value, fallback) {
  if (value === undefined || value === "") {
    return fallback;
  }

  return value === "true" || value === "1";
}

/**
 * Carrega .env local (se existir) e normaliza a configuração do servidor.
 * Nenhum segredo é impresso ou versionado por esta função.
 */
export function loadConfig() {
  try {
    process.loadEnvFile();
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const databasePathRaw = process.env.DATABASE_PATH ?? "./data/vetcare.db";

  return {
    host: process.env.HOST ?? "127.0.0.1",
    port: readInteger(process.env.PORT, 3001, {
      min: 1,
      max: 65535,
      name: "PORT",
    }),
    databasePath:
      databasePathRaw === ":memory:"
        ? databasePathRaw
        : resolve(process.cwd(), databasePathRaw),
    sessionTtlHours: readInteger(process.env.SESSION_TTL_HOURS, 8, {
      min: 1,
      max: 168,
      name: "SESSION_TTL_HOURS",
    }),
    cookieSecure: readBoolean(process.env.COOKIE_SECURE, false),
    adminName: process.env.ADMIN_NAME ?? "Administrador VetCare",
    adminEmail: (process.env.ADMIN_EMAIL ?? "admin@vetcare.com")
      .trim()
      .toLowerCase(),
    adminPassword: process.env.ADMIN_PASSWORD ?? "",
    resetAdminPassword: process.argv.includes("--reset-password"),
    seedOnly: process.argv.includes("--seed"),
  };
}
