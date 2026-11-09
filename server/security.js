import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

export const SESSION_COOKIE_NAME = "vetcare_session";

function scryptOptions() {
  return {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAX_MEMORY,
  };
}

/**
 * Valida a política mínima para criação de senhas.
 *
 * @param {string} password
 */
export function assertPasswordStrength(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("A senha deve ter pelo menos 8 caracteres.");
  }

  if (password.length > 128) {
    throw new Error("A senha deve ter no máximo 128 caracteres.");
  }
}

/**
 * Gera um hash scrypt com salt aleatório.
 * Formato: scrypt$N$r$p$saltBase64$hashBase64
 *
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  assertPasswordStrength(password);

  const salt = randomBytes(16);
  const derivedKey = await scrypt(
    password,
    salt,
    SCRYPT_KEY_LENGTH,
    scryptOptions(),
  );

  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    Buffer.from(derivedKey).toString("base64"),
  ].join("$");
}

/**
 * Compara uma senha com o hash armazenado usando tempo constante.
 *
 * @param {string} password
 * @param {string} storedHash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, storedHash) {
  if (typeof password !== "string" || typeof storedHash !== "string") {
    return false;
  }

  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);

  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  let salt;
  let storedKey;
  try {
    salt = Buffer.from(saltRaw, "base64");
    storedKey = Buffer.from(hashRaw, "base64");
  } catch {
    return false;
  }

  if (salt.length === 0 || storedKey.length === 0) {
    return false;
  }

  try {
    const derivedKey = await scrypt(
      password,
      salt,
      storedKey.length,
      {
        N: n,
        r,
        p,
        maxmem: SCRYPT_MAX_MEMORY,
      },
    );
    const derivedBuffer = Buffer.from(derivedKey);

    return (
      derivedBuffer.length === storedKey.length &&
      timingSafeEqual(derivedBuffer, storedKey)
    );
  } catch {
    return false;
  }
}

/**
 * Gera o token de sessão e apenas o seu hash é persistido no banco.
 *
 * @returns {{ token: string, tokenHash: string }}
 */
export function createSessionToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

/**
 * @param {string} token
 * @returns {string}
 */
export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * @param {string | undefined} cookieHeader
 * @returns {Record<string, string>}
 */
export function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }

  const cookies = {};

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }

    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();

    if (name) {
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
    }
  }

  return cookies;
}

/**
 * @param {string} token
 * @param {{ maxAgeSeconds: number, secure: boolean }} options
 * @returns {string}
 */
export function serializeSessionCookie(token, { maxAgeSeconds, secure }) {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

/**
 * @param {{ secure: boolean }} options
 * @returns {string}
 */
export function clearSessionCookie({ secure }) {
  const attributes = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];

  if (secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}
