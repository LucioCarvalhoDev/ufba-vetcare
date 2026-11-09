import { randomUUID } from "node:crypto";
import {
  domainError,
  escapeLike,
  normalizeBirthDate,
  normalizeSex,
  nowIso,
  optionalText,
} from "../helpers.js";

function mapAnimalRow(row) {
  return {
    id: row.id,
    tutorId: row.tutor_id,
    tutorName: row.tutor_name,
    name: row.name,
    species: row.species,
    breed: row.breed,
    sex: row.sex,
    birthDate: row.birth_date,
    notes: row.notes,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createAnimalsRepository(connection) {
  const selectAnimalById = connection.prepare(
    `SELECT a.*, t.name AS tutor_name
     FROM animals a
     INNER JOIN tutors t ON t.id = a.tutor_id
     WHERE a.id = ?`,
  );
  const selectAnimalRowById = connection.prepare(
    "SELECT * FROM animals WHERE id = ?",
  );
  const selectTutorById = connection.prepare(
    "SELECT id FROM tutors WHERE id = ?",
  );
  const deleteAnimalStatement = connection.prepare(
    "DELETE FROM animals WHERE id = ?",
  );
  const countAppointments = connection.prepare(
    "SELECT COUNT(*) AS total FROM appointments WHERE animal_id = ?",
  );

  function getAnimalById(id) {
    const row = selectAnimalById.get(id);
    return row ? mapAnimalRow(row) : null;
  }

  return {
    listAnimals({ q = "", tutorId = "", species = "", isActive } = {}) {
      const conditions = [];
      const parameters = [];
      const search = String(q ?? "").trim();

      if (search) {
        const term = `%${escapeLike(search)}%`;
        conditions.push(
          `(a.name LIKE ? ESCAPE '\\' OR a.breed LIKE ? ESCAPE '\\')`,
        );
        parameters.push(term, term);
      }

      if (tutorId) {
        conditions.push("a.tutor_id = ?");
        parameters.push(tutorId);
      }

      if (species) {
        conditions.push("a.species = ? COLLATE NOCASE");
        parameters.push(String(species).trim());
      }

      if (typeof isActive === "boolean") {
        conditions.push("a.is_active = ?");
        parameters.push(isActive ? 1 : 0);
      }

      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";
      const rows = connection
        .prepare(
          `SELECT a.*, t.name AS tutor_name
           FROM animals a
           INNER JOIN tutors t ON t.id = a.tutor_id
           ${where}
           ORDER BY a.name COLLATE NOCASE ASC, a.created_at ASC`,
        )
        .all(...parameters);

      return rows.map(mapAnimalRow);
    },

    getAnimalById,

    createAnimal({
      tutorId,
      name,
      species,
      breed = null,
      sex = "unknown",
      birthDate = null,
      notes = null,
      isActive = true,
    }) {
      const normalizedTutorId = String(tutorId ?? "").trim();
      const tutor = normalizedTutorId
        ? selectTutorById.get(normalizedTutorId)
        : null;

      if (!tutor) {
        throw domainError("TUTOR_NOT_FOUND", "Tutor não encontrado.");
      }

      const normalizedName = String(name ?? "").trim();
      const normalizedSpecies = String(species ?? "").trim();

      if (!normalizedName) {
        throw domainError("INVALID_NAME", "Nome do animal é obrigatório.");
      }

      if (!normalizedSpecies) {
        throw domainError("INVALID_SPECIES", "Espécie do animal é obrigatória.");
      }

      const normalizedSex = normalizeSex(sex);
      const normalizedBirthDate = normalizeBirthDate(birthDate);
      const id = randomUUID();
      const timestamp = nowIso();

      connection
        .prepare(
          `INSERT INTO animals
             (id, tutor_id, name, species, breed, sex, birth_date, notes, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          normalizedTutorId,
          normalizedName,
          normalizedSpecies,
          optionalText(breed),
          normalizedSex,
          normalizedBirthDate,
          optionalText(notes),
          isActive === false ? 0 : 1,
          timestamp,
          timestamp,
        );

      return getAnimalById(id);
    },

    updateAnimal(id, data = {}) {
      const input = data ?? {};
      const existing = selectAnimalRowById.get(id);

      if (!existing) {
        throw domainError("ANIMAL_NOT_FOUND", "Animal não encontrado.");
      }

      const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
      const tutorId = has("tutorId")
        ? String(input.tutorId ?? "").trim()
        : existing.tutor_id;
      const tutor = tutorId ? selectTutorById.get(tutorId) : null;

      if (!tutor) {
        throw domainError("TUTOR_NOT_FOUND", "Tutor não encontrado.");
      }

      const normalizedName = has("name")
        ? String(input.name ?? "").trim()
        : existing.name;
      const normalizedSpecies = has("species")
        ? String(input.species ?? "").trim()
        : existing.species;

      if (!normalizedName) {
        throw domainError("INVALID_NAME", "Nome do animal é obrigatório.");
      }

      if (!normalizedSpecies) {
        throw domainError("INVALID_SPECIES", "Espécie do animal é obrigatória.");
      }

      const normalizedSex = has("sex")
        ? normalizeSex(input.sex, existing.sex)
        : existing.sex;
      const normalizedBirthDate = has("birthDate")
        ? normalizeBirthDate(input.birthDate)
        : existing.birth_date;
      const isActive =
        typeof input.isActive === "boolean"
          ? input.isActive
            ? 1
            : 0
          : existing.is_active;

      connection
        .prepare(
          `UPDATE animals
           SET tutor_id = ?, name = ?, species = ?, breed = ?, sex = ?,
               birth_date = ?, notes = ?, is_active = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          tutorId,
          normalizedName,
          normalizedSpecies,
          has("breed") ? optionalText(input.breed) : existing.breed,
          normalizedSex,
          normalizedBirthDate,
          has("notes") ? optionalText(input.notes) : existing.notes,
          isActive,
          nowIso(),
          id,
        );

      return getAnimalById(id);
    },

    deleteAnimal(id) {
      if (!selectAnimalRowById.get(id)) {
        throw domainError("ANIMAL_NOT_FOUND", "Animal não encontrado.");
      }

      if (countAppointments.get(id).total > 0) {
        throw domainError(
          "ANIMAL_HAS_APPOINTMENTS",
          "Não é possível excluir um animal com agendamentos vinculados.",
        );
      }

      deleteAnimalStatement.run(id);
      return true;
    },
  };
}
