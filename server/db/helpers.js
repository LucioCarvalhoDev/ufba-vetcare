export function nowIso() {
  return new Date().toISOString();
}

export function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, "\\$&");
}

export function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function optionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function normalizeSex(value, fallback = "unknown") {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  if (!["male", "female", "unknown"].includes(normalized)) {
    throw domainError(
      "INVALID_SEX",
      "Sexo inválido. Use male, female ou unknown.",
    );
  }

  return normalized;
}

export function normalizeBirthDate(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const text = String(value).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw domainError(
      "INVALID_BIRTH_DATE",
      "Data de nascimento deve estar no formato AAAA-MM-DD.",
    );
  }

  const date = new Date(`${text}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw domainError("INVALID_BIRTH_DATE", "Data de nascimento inválida.");
  }

  return text;
}
