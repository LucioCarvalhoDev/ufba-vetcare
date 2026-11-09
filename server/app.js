import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { createServer } from "node:http";
import {
  clearSessionCookie,
  createSessionToken,
  hashPassword,
  hashToken,
  parseCookies,
  serializeSessionCookie,
  SESSION_COOKIE_NAME,
  verifyPassword,
} from "./security.js";
import { hasPermission } from "./permissions.js";
import { createRecordsRouter } from "./records.js";
import { createAppointmentsRouter } from "./appointments.js";
import { createAvailabilityRouter } from "./availability.js";

const MAX_BODY_BYTES = 16 * 1024;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const USER_AGENT_MAX_LENGTH = 300;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
].join("; ");

class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   */
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * @param {import("node:http").ServerResponse} res
 */
function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
}

/**
 * @param {import("node:http").IncomingMessage} req
 */
function getClientIp(req) {
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * @param {import("node:http").IncomingMessage} req
 */
function getUserAgent(req) {
  const value = req.headers["user-agent"];
  return typeof value === "string"
    ? value.slice(0, USER_AGENT_MAX_LENGTH)
    : null;
}

/**
 * @param {import("node:http").IncomingMessage} req
 */
function isSameOriginRequest(req) {
  const origin = req.headers.origin;

  if (!origin) {
    return true;
  }

  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<Record<string, unknown>>}
 */
async function readJsonBody(req) {
  const contentType = req.headers["content-type"] ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(
      415,
      "unsupported_media_type",
      "Envie a requisição como application/json.",
    );
  }

  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    totalBytes += chunk.length;

    if (totalBytes > MAX_BODY_BYTES) {
      throw new HttpError(
        413,
        "payload_too_large",
        "A requisição excede o tamanho máximo permitido.",
      );
    }

    chunks.push(chunk);
  }

  if (totalBytes === 0) {
    throw new HttpError(400, "invalid_body", "Corpo da requisição vazio.");
  }

  let parsed;

  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid_json", "JSON inválido.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "invalid_body", "Corpo da requisição inválido.");
  }

  return parsed;
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {Record<string, unknown>} payload
 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);

  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {string} message
 * @param {Record<string, string>} [headers]
 */
function sendText(res, status, message, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(message));
  res.setHeader("Cache-Control", "no-store");

  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value);
  }

  res.end(message);
}

/**
 * @param {import("node:http").ServerResponse} res
 */
function sendNoContent(res) {
  res.statusCode = 204;
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

/**
 * @param {object} authUser
 */
function publicUser(authUser) {
  return {
    id: authUser.id,
    name: authUser.name,
    email: authUser.email,
    roles: authUser.roles,
    permissions: authUser.permissions,
  };
}

/**
 * Dados de usuário expostos em listagens administrativas.
 *
 * @param {object} user
 */
function managedUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isActive: user.isActive,
    createdAt: user.createdAt,
    roles: user.roles,
  };
}

/**
 * @param {Record<string, unknown>} body
 * @param {{ passwordRequired?: boolean, statusRequired?: boolean }} options
 */
function parseUserPayload(
  body,
  { passwordRequired = false, statusRequired = false } = {},
) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const roleSlugs = Array.isArray(body.roleSlugs)
    ? [
        ...new Set(
          body.roleSlugs
            .filter((slug) => typeof slug === "string")
            .map((slug) => slug.trim())
            .filter(Boolean),
        ),
      ]
    : [];
  const isActive = body.isActive === undefined ? true : body.isActive;

  if (name.length < 3 || name.length > 120) {
    throw new HttpError(
      400,
      "invalid_name",
      "O nome deve ter entre 3 e 120 caracteres.",
    );
  }

  if (
    !email ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new HttpError(400, "invalid_email", "Informe um e-mail válido.");
  }

  if (passwordRequired || password.length > 0) {
    if (password.length < 8 || password.length > 128) {
      throw new HttpError(
        400,
        "invalid_password",
        "A senha deve ter entre 8 e 128 caracteres.",
      );
    }
  }

  if (roleSlugs.length === 0 || roleSlugs.length > 10) {
    throw new HttpError(
      400,
      "invalid_roles",
      "Selecione ao menos um papel válido.",
    );
  }

  if (typeof isActive !== "boolean" || (statusRequired && body.isActive === undefined)) {
    throw new HttpError(
      400,
      "invalid_status",
      "A situação deve ser ativa ou inativa.",
    );
  }

  return {
    name,
    email,
    password: password.length > 0 ? password : undefined,
    roleSlugs,
    isActive,
  };
}

/**
 * @param {Error & { code?: string }} error
 */
function mapUserMutationError(error) {
  if (error.code === "EMAIL_IN_USE") {
    return new HttpError(409, "email_in_use", error.message);
  }

  if (error.code === "USER_NOT_FOUND") {
    return new HttpError(404, "user_not_found", error.message);
  }

  if (error.code === "LAST_ADMIN") {
    return new HttpError(409, "last_admin", error.message);
  }

  if (
    error.code === "UNKNOWN_ROLE" ||
    error.code === "ROLE_REQUIRED" ||
    error.code === "INVALID_NAME" ||
    error.code === "INVALID_EMAIL"
  ) {
    return new HttpError(400, "invalid_user", error.message);
  }

  if (String(error.message).includes("UNIQUE constraint failed: users.email")) {
    return new HttpError(
      409,
      "email_in_use",
      "Já existe um usuário com este e-mail.",
    );
  }

  return error;
}

/**
 * @param {string} pathname
 * @param {string} staticDir
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
function serveStatic(pathname, staticDir, req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendText(res, 405, "Método não permitido.", { Allow: "GET, HEAD" });
  }

  let decodedPath;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return sendText(res, 400, "Caminho inválido.");
  }

  if (decodedPath.includes("\0")) {
    return sendText(res, 400, "Caminho inválido.");
  }

  const root = resolve(staticDir);
  const relativePath =
    decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const filePath = resolve(root, relativePath);

  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    return sendText(res, 403, "Acesso negado.");
  }

  let targetPath = filePath;

  if (!existsSync(targetPath) || !statSync(targetPath).isFile()) {
    if (extname(relativePath)) {
      return sendText(res, 404, "Arquivo não encontrado.");
    }

    targetPath = join(root, "index.html");

    if (!existsSync(targetPath)) {
      return sendText(
        res,
        503,
        "Frontend não compilado. Execute `npm run build` para gerar a versão de produção.",
      );
    }
  }

  const stats = statSync(targetPath);
  const extension = extname(targetPath).toLowerCase();
  const contentType = MIME_TYPES[extension] ?? "application/octet-stream";
  const isHtml = extension === ".html";
  const isHashedAsset = targetPath.includes(`${sep}assets${sep}`);

  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", stats.size);
  res.setHeader(
    "Cache-Control",
    isHashedAsset
      ? "public, max-age=31536000, immutable"
      : "no-store",
  );

  if (isHtml) {
    res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  }

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  const stream = createReadStream(targetPath);
  stream.on("error", () => {
    if (!res.headersSent) {
      sendText(res, 500, "Erro ao ler o arquivo.");
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
}

/**
 * Cria o servidor HTTP com as rotas de autenticação e o fallback do frontend.
 *
 * @param {{
 *   database: Awaited<ReturnType<typeof import("./database.js").openDatabase>>,
 *   sessionTtlHours?: number,
 *   cookieSecure?: boolean,
 *   staticDir?: string,
 * }} options
 */
export function createVetCareServer({
  database,
  sessionTtlHours = 8,
  cookieSecure = false,
  staticDir = resolve(process.cwd(), "dist"),
}) {
  const sessionTtlMs = sessionTtlHours * 60 * 60 * 1000;
  const sessionTtlSeconds = Math.floor(sessionTtlMs / 1000);
  const loginAttempts = new Map();
  let dummyHashPromise;

  function getDummyHash() {
    dummyHashPromise ??= hashPassword("vetcare-invalid-login-placeholder");
    return dummyHashPromise;
  }

  function pruneLoginAttempts() {
    if (loginAttempts.size < 500) {
      return;
    }

    const now = Date.now();
    for (const [key, entry] of loginAttempts) {
      if (entry.resetAt <= now) {
        loginAttempts.delete(key);
      }
    }
  }

  function loginAttemptKey(req, email) {
    return `${getClientIp(req)}:${email}`;
  }

  function checkLoginRateLimit(key) {
    const entry = loginAttempts.get(key);

    if (!entry) {
      return 0;
    }

    if (entry.resetAt <= Date.now()) {
      loginAttempts.delete(key);
      return 0;
    }

    if (entry.count < LOGIN_MAX_ATTEMPTS) {
      return 0;
    }

    return Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000));
  }

  function registerLoginFailure(key) {
    pruneLoginAttempts();

    const now = Date.now();
    const current = loginAttempts.get(key);

    if (!current || current.resetAt <= now) {
      loginAttempts.set(key, {
        count: 1,
        resetAt: now + LOGIN_WINDOW_MS,
      });
      return;
    }

    current.count += 1;
  }

  function clearLoginRateLimit(key) {
    loginAttempts.delete(key);
  }

  function getRequestUser(req, res) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];

    if (!token) {
      return null;
    }

    const authUser = database.findSessionUser(hashToken(token));

    if (!authUser) {
      res.setHeader(
        "Set-Cookie",
        clearSessionCookie({ secure: cookieSecure }),
      );
      return null;
    }

    return authUser;
  }

  function requirePermission(req, res, permission) {
    const authUser = getRequestUser(req, res);

    if (!authUser) {
      throw new HttpError(
        401,
        "unauthorized",
        "Sessão inválida ou expirada.",
      );
    }

    if (!hasPermission(authUser, permission)) {
      throw new HttpError(
        403,
        "forbidden",
        "Você não tem permissão para acessar este recurso.",
      );
    }

    return authUser;
  }

  async function handleLogin(req, res) {
    if (!isSameOriginRequest(req)) {
      throw new HttpError(403, "forbidden_origin", "Origem não autorizada.");
    }

    const body = await readJsonBody(req);
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password || email.length > 254 || password.length > 128) {
      throw new HttpError(
        400,
        "invalid_credentials_input",
        "Informe e-mail e senha válidos.",
      );
    }

    const attemptKey = loginAttemptKey(req, email);
    const retryAfter = checkLoginRateLimit(attemptKey);

    if (retryAfter > 0) {
      res.setHeader("Retry-After", String(retryAfter));
      throw new HttpError(
        429,
        "too_many_attempts",
        "Muitas tentativas de login. Tente novamente mais tarde.",
      );
    }

    const authUser = database.getUserAuthByEmail(email);
    const storedHash = authUser?.passwordHash ?? (await getDummyHash());
    const passwordMatches = await verifyPassword(password, storedHash);
    const authenticated = Boolean(authUser) && passwordMatches && authUser.isActive;

    if (!authenticated) {
      registerLoginFailure(attemptKey);
      database.recordAudit({
        userId: authUser?.id ?? null,
        actorEmail: email,
        action: "auth.login",
        result: "failure",
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        metadata: {
          reason: !authUser
            ? "unknown_user"
            : !passwordMatches
              ? "invalid_password"
              : "inactive_user",
        },
      });

      throw new HttpError(
        401,
        "invalid_credentials",
        "E-mail ou senha incorretos.",
      );
    }

    clearLoginRateLimit(attemptKey);

    const { token, tokenHash } = createSessionToken();
    const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();

    database.createSession({
      userId: authUser.id,
      tokenHash,
      expiresAt,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    res.setHeader(
      "Set-Cookie",
      serializeSessionCookie(token, {
        maxAgeSeconds: sessionTtlSeconds,
        secure: cookieSecure,
      }),
    );

    database.recordAudit({
      userId: authUser.id,
      actorEmail: authUser.email,
      action: "auth.login",
      resource: "session",
      result: "success",
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    sendJson(res, 200, { user: publicUser(authUser) });
  }

  function handleMe(req, res) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];

    if (!token) {
      throw new HttpError(401, "unauthorized", "Sessão não encontrada.");
    }

    const authUser = database.findSessionUser(hashToken(token));

    if (!authUser) {
      res.setHeader(
        "Set-Cookie",
        clearSessionCookie({ secure: cookieSecure }),
      );
      throw new HttpError(401, "unauthorized", "Sessão inválida ou expirada.");
    }

    sendJson(res, 200, { user: publicUser(authUser) });
  }

  function handleLogout(req, res) {
    if (!isSameOriginRequest(req)) {
      throw new HttpError(403, "forbidden_origin", "Origem não autorizada.");
    }

    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];

    if (token) {
      const tokenHash = hashToken(token);
      const authUser = database.findSessionUser(tokenHash);

      database.deleteSession(tokenHash);

      if (authUser) {
        database.recordAudit({
          userId: authUser.id,
          actorEmail: authUser.email,
          action: "auth.logout",
          resource: "session",
          result: "success",
          ipAddress: getClientIp(req),
          userAgent: getUserAgent(req),
        });
      }
    }

    res.setHeader("Set-Cookie", clearSessionCookie({ secure: cookieSecure }));
    sendNoContent(res);
  }

  function handleListUsers(req, res) {
    requirePermission(req, res, "users.read");

    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    const q = (requestUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
    const roleSlug = (requestUrl.searchParams.get("role") ?? "")
      .trim()
      .slice(0, 50);
    const status = (requestUrl.searchParams.get("status") ?? "").trim();
    let isActive;

    if (status === "active") {
      isActive = true;
    } else if (status === "inactive") {
      isActive = false;
    } else if (status !== "") {
      throw new HttpError(
        400,
        "invalid_status",
        "Situação inválida. Use active ou inactive.",
      );
    }

    const users = database.listUsers({ q, roleSlug, isActive });
    sendJson(res, 200, {
      users: users.map(managedUser),
      total: users.length,
    });
  }

  function handleListRoles(req, res) {
    requirePermission(req, res, "roles.read");
    sendJson(res, 200, { roles: database.listRoles() });
  }

  async function handleCreateUser(req, res) {
    if (!isSameOriginRequest(req)) {
      throw new HttpError(403, "forbidden_origin", "Origem não autorizada.");
    }

    const authUser = requirePermission(req, res, "users.write");
    const body = await readJsonBody(req);
    const input = parseUserPayload(body, { passwordRequired: true });
    let user;

    try {
      user = await database.createUser(input);
    } catch (error) {
      throw mapUserMutationError(error);
    }

    database.recordAudit({
      userId: authUser.id,
      actorEmail: authUser.email,
      action: "users.create",
      resource: user.id,
      result: "success",
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { roleSlugs: input.roleSlugs },
    });

    sendJson(res, 201, { user: managedUser(user) });
  }

  function handleGetUser(req, res, userId) {
    requirePermission(req, res, "users.read");
    const user = database.getUserAuthById(userId);

    if (!user) {
      throw new HttpError(404, "user_not_found", "Usuário não encontrado.");
    }

    sendJson(res, 200, { user: managedUser(user) });
  }

  async function handleUpdateUser(req, res, userId) {
    if (!isSameOriginRequest(req)) {
      throw new HttpError(403, "forbidden_origin", "Origem não autorizada.");
    }

    const authUser = requirePermission(req, res, "users.write");
    const body = await readJsonBody(req);
    const input = parseUserPayload(body, {
      passwordRequired: false,
      statusRequired: true,
    });
    let user;

    try {
      user = await database.updateUser(userId, input);
    } catch (error) {
      throw mapUserMutationError(error);
    }

    database.recordAudit({
      userId: authUser.id,
      actorEmail: authUser.email,
      action: "users.update",
      resource: user.id,
      result: "success",
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        roleSlugs: input.roleSlugs,
        passwordChanged: Boolean(input.password),
      },
    });

    sendJson(res, 200, { user: managedUser(user) });
  }

  const handleRecords = createRecordsRouter({
    database,
    requirePermission,
    isSameOriginRequest,
    readJsonBody,
    sendJson,
    sendNoContent,
    getClientIp,
    getUserAgent,
    HttpError,
  });

  const handleAvailability = createAvailabilityRouter({
    database,
    requirePermission,
    isSameOriginRequest,
    readJsonBody,
    sendJson,
    getClientIp,
    getUserAgent,
    HttpError,
  });

  const handleAppointments = createAppointmentsRouter({
    database,
    requirePermission,
    isSameOriginRequest,
    readJsonBody,
    sendJson,
    getClientIp,
    getUserAgent,
    HttpError,
  });

  async function handleRequest(req, res) {
    setSecurityHeaders(res);

    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    const { pathname } = requestUrl;

    if (pathname.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store");

      if (req.method === "POST" && pathname === "/api/auth/login") {
        return handleLogin(req, res);
      }

      if (req.method === "GET" && pathname === "/api/auth/me") {
        return handleMe(req, res);
      }

      if (req.method === "POST" && pathname === "/api/auth/logout") {
        return handleLogout(req, res);
      }

      if (req.method === "GET" && pathname === "/api/users") {
        return handleListUsers(req, res);
      }

      if (req.method === "POST" && pathname === "/api/users") {
        return handleCreateUser(req, res);
      }

      if (req.method === "GET" && pathname === "/api/roles") {
        return handleListRoles(req, res);
      }

      if (
        pathname === "/api/tutors" ||
        pathname.startsWith("/api/tutors/") ||
        pathname === "/api/animals" ||
        pathname.startsWith("/api/animals/")
      ) {
        return handleRecords(req, res, pathname);
      }

      if (
        pathname.startsWith("/api/veterinarians/") &&
        pathname.endsWith("/availability")
      ) {
        return handleAvailability(req, res, pathname);
      }

      if (
        pathname === "/api/veterinarians" ||
        pathname === "/api/appointments" ||
        pathname.startsWith("/api/appointments/")
      ) {
        return handleAppointments(req, res, pathname);
      }

      const userRoute = pathname.match(/^\/api\/users\/([^/]+)$/);

      if (userRoute) {
        let userId;

        try {
          userId = decodeURIComponent(userRoute[1]);
        } catch {
          throw new HttpError(400, "invalid_user_id", "Identificador inválido.");
        }

        if (req.method === "GET") {
          return handleGetUser(req, res, userId);
        }

        if (req.method === "PUT") {
          return handleUpdateUser(req, res, userId);
        }
      }

      if (req.method === "GET" && pathname === "/api/health") {
        database.connection.prepare("SELECT 1 AS ok").get();
        return sendJson(res, 200, {
          status: "ok",
          timestamp: new Date().toISOString(),
        });
      }

      return sendJson(res, 404, {
        error: { code: "not_found", message: "Rota não encontrada." },
      });
    }

    return serveStatic(pathname, staticDir, req, res);
  }

  return createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      if (error instanceof HttpError) {
        if (!res.headersSent) {
          sendJson(res, error.status, {
            error: { code: error.code, message: error.message },
          });
        }
        return;
      }

      console.error("[api] erro inesperado:", error);

      if (!res.headersSent) {
        sendJson(res, 500, {
          error: {
            code: "internal_error",
            message: "Erro interno do servidor.",
          },
        });
      } else {
        res.destroy();
      }
    });
  });
}
