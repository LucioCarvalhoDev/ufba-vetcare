const STATUS_FILTERS = new Set(["", "active", "inactive"]);

function readStatus(searchParams, HttpError) {
  const status = searchParams.get("status") ?? "";

  if (!STATUS_FILTERS.has(status)) {
    throw new HttpError(
      400,
      "invalid_status",
      "Situação inválida. Use active ou inactive.",
    );
  }

  if (status === "") {
    return undefined;
  }

  return status === "active";
}

function readTutorPayload(body, HttpError) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const isActive = body.isActive === undefined ? true : body.isActive;

  if (name.length < 1 || name.length > 120) {
    throw new HttpError(
      400,
      "invalid_name",
      "O nome do tutor deve ter entre 1 e 120 caracteres.",
    );
  }

  if (typeof isActive !== "boolean") {
    throw new HttpError(
      400,
      "invalid_status",
      "A situação deve ser ativa ou inativa.",
    );
  }

  return {
    name,
    cpf: body.cpf,
    email: body.email,
    phone: body.phone,
    address: body.address,
    notes: body.notes,
    isActive,
  };
}

function readAnimalPayload(body, HttpError) {
  const tutorId =
    typeof body.tutorId === "string" ? body.tutorId.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const species =
    typeof body.species === "string" ? body.species.trim() : "";
  const isActive = body.isActive === undefined ? true : body.isActive;

  if (!tutorId) {
    throw new HttpError(400, "invalid_tutor", "Selecione o tutor do animal.");
  }

  if (name.length < 1 || name.length > 120) {
    throw new HttpError(
      400,
      "invalid_name",
      "O nome do animal deve ter entre 1 e 120 caracteres.",
    );
  }

  if (species.length < 1 || species.length > 80) {
    throw new HttpError(
      400,
      "invalid_species",
      "A espécie deve ter entre 1 e 80 caracteres.",
    );
  }

  if (typeof isActive !== "boolean") {
    throw new HttpError(
      400,
      "invalid_status",
      "A situação deve ser ativa ou inativa.",
    );
  }

  return {
    tutorId,
    name,
    species,
    breed: body.breed ?? null,
    sex: body.sex ?? "unknown",
    birthDate: body.birthDate ?? null,
    notes: body.notes ?? null,
    isActive,
  };
}

function toHttpError(error, HttpError) {
  if (error.code === "TUTOR_NOT_FOUND" || error.code === "ANIMAL_NOT_FOUND") {
    return new HttpError(404, error.code.toLowerCase(), error.message);
  }

  if (
    error.code === "CPF_IN_USE" ||
    error.code === "TUTOR_HAS_ANIMALS" ||
    error.code === "ANIMAL_HAS_APPOINTMENTS"
  ) {
    return new HttpError(409, error.code.toLowerCase(), error.message);
  }

  if (String(error.code).startsWith("INVALID_")) {
    return new HttpError(400, error.code.toLowerCase(), error.message);
  }

  if (String(error.message).includes("UNIQUE constraint failed: tutors.cpf")) {
    return new HttpError(409, "cpf_in_use", "Já existe um tutor com este CPF.");
  }

  return error;
}

/**
 * Cria um roteador compacto para tutores e animais.
 *
 * @param {{
 *   database: object,
 *   requirePermission: Function,
 *   isSameOriginRequest: Function,
 *   readJsonBody: Function,
 *   sendJson: Function,
 *   sendNoContent: Function,
 *   getClientIp: Function,
 *   getUserAgent: Function,
 *   HttpError: Function,
 * }} context
 */
export function createRecordsRouter({
  database,
  requirePermission,
  isSameOriginRequest,
  readJsonBody,
  sendJson,
  sendNoContent,
  getClientIp,
  getUserAgent,
  HttpError,
}) {
  const resources = {
    tutors: {
      key: "tutors",
      singular: "tutor",
      read: "tutors.read",
      write: "tutors.write",
      list: (params) =>
        database.listTutors({
          q: params.get("q") ?? "",
          isActive: readStatus(params, HttpError),
        }),
      get: (id) => database.getTutorById(id),
      create: (input) => database.createTutor(input),
      update: (id, input) => database.updateTutor(id, input),
      remove: (id) => database.deleteTutor(id),
      parse: (body) => readTutorPayload(body, HttpError),
    },
    animals: {
      key: "animals",
      singular: "animal",
      read: "animals.read",
      write: "animals.write",
      list: (params) =>
        database.listAnimals({
          q: params.get("q") ?? "",
          tutorId: params.get("tutorId") ?? "",
          species: params.get("species") ?? "",
          isActive: readStatus(params, HttpError),
        }),
      get: (id) => database.getAnimalById(id),
      create: (input) => database.createAnimal(input),
      update: (id, input) => database.updateAnimal(id, input),
      remove: (id) => database.deleteAnimal(id),
      parse: (body) => readAnimalPayload(body, HttpError),
    },
  };

  function audit(authUser, action, resourceId, req) {
    database.recordAudit({
      userId: authUser.id,
      actorEmail: authUser.email,
      action,
      resource: resourceId,
      result: "success",
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }

  return async function handleRecords(req, res, pathname) {
    const match = pathname.match(/^\/api\/(tutors|animals)(?:\/([^/]+))?$/);

    if (!match) {
      throw new HttpError(404, "not_found", "Rota não encontrada.");
    }

    const [, resourceName, rawId] = match;
    const resource = resources[resourceName];
    let id = null;

    if (rawId) {
      try {
        id = decodeURIComponent(rawId);
      } catch {
        throw new HttpError(400, "invalid_id", "Identificador inválido.");
      }
    }

    if (!id && req.method === "GET") {
      requirePermission(req, res, resource.read);
      const items = resource.list(
        new URL(req.url ?? "/", "http://localhost").searchParams,
      );
      return sendJson(res, 200, {
        [resource.key]: items,
        total: items.length,
      });
    }

    if (!id && req.method === "POST") {
      if (!isSameOriginRequest(req)) {
        throw new HttpError(403, "forbidden_origin", "Origem não autorizada.");
      }

      const authUser = requirePermission(req, res, resource.write);
      const input = resource.parse(await readJsonBody(req));
      let item;

      try {
        item = await resource.create(input);
      } catch (error) {
        throw toHttpError(error, HttpError);
      }

      audit(authUser, `${resourceName}.create`, item.id, req);
      return sendJson(res, 201, { [resource.singular]: item });
    }

    if (id && req.method === "GET") {
      requirePermission(req, res, resource.read);
      const item = resource.get(id);

      if (!item) {
        throw new HttpError(404, "not_found", "Registro não encontrado.");
      }

      return sendJson(res, 200, { [resource.singular]: item });
    }

    if (id && req.method === "PUT") {
      if (!isSameOriginRequest(req)) {
        throw new HttpError(403, "forbidden_origin", "Origem não autorizada.");
      }

      const authUser = requirePermission(req, res, resource.write);
      const input = resource.parse(await readJsonBody(req));
      let item;

      try {
        item = await resource.update(id, input);
      } catch (error) {
        throw toHttpError(error, HttpError);
      }

      audit(authUser, `${resourceName}.update`, item.id, req);
      return sendJson(res, 200, { [resource.singular]: item });
    }

    if (id && req.method === "DELETE") {
      if (!isSameOriginRequest(req)) {
        throw new HttpError(403, "forbidden_origin", "Origem não autorizada.");
      }

      const authUser = requirePermission(req, res, resource.write);

      try {
        await resource.remove(id);
      } catch (error) {
        throw toHttpError(error, HttpError);
      }

      audit(authUser, `${resourceName}.delete`, id, req);
      return sendNoContent(res);
    }

    throw new HttpError(405, "method_not_allowed", "Método não permitido.");
  };
}
