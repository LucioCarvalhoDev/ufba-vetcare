import { randomUUID } from "node:crypto";
import {
  domainError,
  escapeLike,
  nowIso,
  optionalText,
} from "../helpers.js";

function mapTutorRow(row) {
  return {
    id: row.id,
    name: row.name,
    cpf: row.cpf,
    email: row.email,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    animalCount: Number(row.animal_count ?? 0),
  };
}

export function createTutorsRepository(connection) {
  const selectTutorById = connection.prepare(
    `SELECT t.*,
            (SELECT COUNT(*) FROM animals a WHERE a.tutor_id = t.id) AS animal_count
     FROM tutors t
     WHERE t.id = ?`,
  );
  const selectTutorRowById = connection.prepare(
    "SELECT * FROM tutors WHERE id = ?",
  );
  const selectTutorByCpf = connection.prepare(
    "SELECT id FROM tutors WHERE cpf = ?",
  );
  const countAnimals = connection.prepare(
    "SELECT COUNT(*) AS total FROM animals WHERE tutor_id = ?",
  );
  const deleteTutorStatement = connection.prepare(
    "DELETE FROM tutors WHERE id = ?",
  );

  function getTutorById(id) {
    const row = selectTutorById.get(id);
    return row ? mapTutorRow(row) : null;
  }

  return {
    listTutors({ q = "", isActive } = {}) {
      const conditions = [];
      const parameters = [];
      const search = String(q ?? "").trim();

      if (search) {
        const term = `%${escapeLike(search)}%`;
        conditions.push(
          `(t.name LIKE ? ESCAPE '\\'
            OR t.cpf LIKE ? ESCAPE '\\'
            OR t.email LIKE ? ESCAPE '\\'
            OR t.phone LIKE ? ESCAPE '\\')`,
        );
        parameters.push(term, term, term, term);
      }

      if (typeof isActive === "boolean") {
        conditions.push("t.is_active = ?");
        parameters.push(isActive ? 1 : 0);
      }

      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";
      const rows = connection
        .prepare(
          `SELECT t.*,
                  (SELECT COUNT(*) FROM animals a WHERE a.tutor_id = t.id) AS animal_count
           FROM tutors t
           ${where}
           ORDER BY t.name COLLATE NOCASE ASC, t.created_at ASC`,
        )
        .all(...parameters);

      return rows.map(mapTutorRow);
    },

    getTutorById,

    createTutor({
      name,
      cpf = null,
      email = null,
      phone = null,
      address = null,
      notes = null,
      isActive = true,
    }) {
      const normalizedName = String(name ?? "").trim();

      if (!normalizedName) {
        throw domainError("INVALID_NAME", "Nome do tutor é obrigatório.");
      }

      const normalizedCpf = optionalText(cpf);

      if (normalizedCpf && selectTutorByCpf.get(normalizedCpf)) {
        throw domainError("CPF_IN_USE", "Já existe um tutor com este CPF.");
      }

      const id = randomUUID();
      const timestamp = nowIso();

      connection
        .prepare(
          `INSERT INTO tutors
             (id, name, cpf, email, phone, address, notes, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          normalizedName,
          normalizedCpf,
          optionalText(email),
          optionalText(phone),
          optionalText(address),
          optionalText(notes),
          isActive === false ? 0 : 1,
          timestamp,
          timestamp,
        );

      return getTutorById(id);
    },

    updateTutor(id, data = {}) {
      const input = data ?? {};
      const existing = selectTutorRowById.get(id);

      if (!existing) {
        throw domainError("TUTOR_NOT_FOUND", "Tutor não encontrado.");
      }

      const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
      const normalizedName = has("name")
        ? String(input.name ?? "").trim()
        : existing.name;

      if (!normalizedName) {
        throw domainError("INVALID_NAME", "Nome do tutor é obrigatório.");
      }

      const normalizedCpf = has("cpf")
        ? optionalText(input.cpf)
        : existing.cpf;

      if (normalizedCpf) {
        const owner = selectTutorByCpf.get(normalizedCpf);

        if (owner && owner.id !== id) {
          throw domainError("CPF_IN_USE", "Já existe um tutor com este CPF.");
        }
      }

      const isActive =
        typeof input.isActive === "boolean"
          ? input.isActive
            ? 1
            : 0
          : existing.is_active;

      connection
        .prepare(
          `UPDATE tutors
           SET name = ?, cpf = ?, email = ?, phone = ?, address = ?, notes = ?,
               is_active = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          normalizedName,
          normalizedCpf,
          has("email") ? optionalText(input.email) : existing.email,
          has("phone") ? optionalText(input.phone) : existing.phone,
          has("address") ? optionalText(input.address) : existing.address,
          has("notes") ? optionalText(input.notes) : existing.notes,
          isActive,
          nowIso(),
          id,
        );

      return getTutorById(id);
    },

    deleteTutor(id) {
      if (!selectTutorRowById.get(id)) {
        throw domainError("TUTOR_NOT_FOUND", "Tutor não encontrado.");
      }

      if (countAnimals.get(id).total > 0) {
        throw domainError(
          "TUTOR_HAS_ANIMALS",
          "Não é possível excluir um tutor com animais vinculados.",
        );
      }

      deleteTutorStatement.run(id);
      return true;
    },
  };
}
