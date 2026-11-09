const TYPES = new Set(["consultation", "surgery", "vaccination"]);
const STATUSES = new Set(["scheduled", "completed", "cancelled"]);

function toHttpError(error, HttpError) {
  if (
    error.code === "APPOINTMENT_NOT_FOUND" ||
    error.code === "ANIMAL_NOT_FOUND" ||
    error.code === "VETERINARIAN_NOT_FOUND"
  ) {
    return new HttpError(404, error.code.toLowerCase(), error.message);
  }

  if (error.code === "APPOINTMENT_CONFLICT") {
    return new HttpError(409, "appointment_conflict", error.message);
  }

  if (String(error.code).startsWith("INVALID_")) {
    return new HttpError(400, error.code.toLowerCase(), error.message);
  }

  return error;
}

function readAppointmentPayload(body, { requireStatus }, HttpError) {
  const animalId =
    typeof body.animalId === "string" ? body.animalId.trim() : "";
  const veterinarianId =
    typeof body.veterinarianId === "string"
      ? body.veterinarianId.trim()
      : "";
  const type = typeof body.type === "string" ? body.type.trim() : "";
  const scheduledAt =
    typeof body.scheduledAt === "string" ? body.scheduledAt.trim() : "";
  const durationMinutes = Number(body.durationMinutes);
  const scheduledDate = new Date(scheduledAt);
  const rawStatus =
    typeof body.status === "string" ? body.status.trim() : "";
  const status = requireStatus ? rawStatus : "scheduled";
  const notes =
    typeof body.notes === "string" ? body.notes.trim() || null : null;

  if (!animalId) {
    throw new HttpError(400, "invalid_animal", "Selecione o animal.");
  }

  if (!veterinarianId) {
    throw new HttpError(
      400,
      "invalid_veterinarian",
      "Selecione o veterinário.",
    );
  }

  if (!TYPES.has(type)) {
    throw new HttpError(400, "invalid_type", "Tipo de agendamento inválido.");
  }

  if (Number.isNaN(scheduledDate.getTime())) {
    throw new HttpError(400, "invalid_schedule", "Informe data e horário.");
  }

  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 15 ||
    durationMinutes > 480
  ) {
    throw new HttpError(
      400,
      "invalid_duration",
      "A duração deve estar entre 15 e 480 minutos.",
    );
  }

  if (requireStatus && !STATUSES.has(status)) {
    throw new HttpError(400, "invalid_status", "Situação inválida.");
  }

  return {
    animalId,
    veterinarianId,
    type,
    scheduledAt: scheduledDate.toISOString(),
    durationMinutes,
    status,
    notes,
  };
}

/**
 * @param {{
 *   database: object,
 *   requirePermission: Function,
 *   isSameOriginRequest: Function,
 *   readJsonBody: Function,
 *   sendJson: Function,
 *   getClientIp: Function,
 *   getUserAgent: Function,
 *   HttpError: Function,
 * }} context
 */
export function createAppointmentsRouter({
  database,
  requirePermission,
  isSameOriginRequest,
  readJsonBody,
  sendJson,
  getClientIp,
  getUserAgent,
  HttpError,
}) {
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

  return async function handleAppointments(req, res, pathname) {
    if (pathname === "/api/veterinarians" && req.method === "GET") {
      requirePermission(req, res, "veterinarians.read");
      return sendJson(res, 200, {
        veterinarians: database.listVeterinarians(),
      });
    }

    const cancelMatch = pathname.match(
      /^\/api\/appointments\/([^/]+)\/cancel$/,
    );

    if (cancelMatch && req.method === "POST") {
      if (!isSameOriginRequest(req)) {
        throw new HttpError(403, "forbidden_origin", "Origem não autorizada.");
      }

      const authUser = requirePermission(req, res, "appointments.write");
      let appointment;

      try {
        appointment = database.cancelAppointment(
          decodeURIComponent(cancelMatch[1]),
        );
      } catch (error) {
        throw toHttpError(error, HttpError);
      }

      audit(authUser, "appointments.cancel", appointment.id, req);
      return sendJson(res, 200, { appointment });
    }

    if (pathname === "/api/appointments" && req.method === "GET") {
      requirePermission(req, res, "appointments.read");
      const params = new URL(req.url ?? "/", "http://localhost").searchParams;
      const type = params.get("type") ?? "";
      const status = params.get("status") ?? "";

      if (type && !TYPES.has(type)) {
        throw new HttpError(400, "invalid_type", "Tipo de agendamento inválido.");
      }

      if (status && !STATUSES.has(status)) {
        throw new HttpError(400, "invalid_status", "Situação inválida.");
      }

      const appointments = database.listAppointments({
        q: params.get("q") ?? "",
        type,
        status,
        veterinarianId: params.get("veterinarianId") ?? "",
      });

      return sendJson(res, 200, {
        appointments,
        total: appointments.length,
      });
    }

    if (pathname === "/api/appointments" && req.method === "POST") {
      if (!isSameOriginRequest(req)) {
        throw new HttpError(403, "forbidden_origin", "Origem não autorizada.");
      }

      const authUser = requirePermission(req, res, "appointments.write");
      const input = readAppointmentPayload(
        await readJsonBody(req),
        { requireStatus: false },
        HttpError,
      );
      let appointment;

      try {
        appointment = database.createAppointment({
          ...input,
          createdBy: authUser.id,
        });
      } catch (error) {
        throw toHttpError(error, HttpError);
      }

      audit(authUser, "appointments.create", appointment.id, req);
      return sendJson(res, 201, { appointment });
    }

    const itemMatch = pathname.match(/^\/api\/appointments\/([^/]+)$/);

    if (!itemMatch) {
      throw new HttpError(404, "not_found", "Rota não encontrada.");
    }

    let id;

    try {
      id = decodeURIComponent(itemMatch[1]);
    } catch {
      throw new HttpError(400, "invalid_id", "Identificador inválido.");
    }

    if (req.method === "GET") {
      requirePermission(req, res, "appointments.read");
      const appointment = database.getAppointmentById(id);

      if (!appointment) {
        throw new HttpError(404, "appointment_not_found", "Agendamento não encontrado.");
      }

      return sendJson(res, 200, { appointment });
    }

    if (req.method !== "PUT") {
      throw new HttpError(405, "method_not_allowed", "Método não permitido.");
    }

    if (!isSameOriginRequest(req)) {
      throw new HttpError(403, "forbidden_origin", "Origem não autorizada.");
    }

    const authUser = requirePermission(req, res, "appointments.write");
    const input = readAppointmentPayload(
      await readJsonBody(req),
      { requireStatus: true },
      HttpError,
    );
    let appointment;

    try {
      appointment = database.updateAppointment(id, input);
    } catch (error) {
      throw toHttpError(error, HttpError);
    }

    audit(authUser, "appointments.update", appointment.id, req);
    return sendJson(res, 200, { appointment });
  };
}
