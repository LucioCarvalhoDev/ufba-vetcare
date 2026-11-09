function toHttpError(error, HttpError) {
  if (error.code === "VETERINARIAN_NOT_FOUND") {
    return new HttpError(404, "veterinarian_not_found", error.message);
  }

  if (error.code === "INVALID_AVAILABILITY") {
    return new HttpError(400, "invalid_availability", error.message);
  }

  return error;
}

export function createAvailabilityRouter({
  database,
  requirePermission,
  isSameOriginRequest,
  readJsonBody,
  sendJson,
  getClientIp,
  getUserAgent,
  HttpError,
}) {
  return async function handleAvailability(req, res, pathname) {
    const match = pathname.match(
      /^\/api\/veterinarians\/([^/]+)\/availability$/,
    );

    if (!match) {
      throw new HttpError(404, "not_found", "Rota não encontrada.");
    }

    let veterinarianId;

    try {
      veterinarianId = decodeURIComponent(match[1]);
    } catch {
      throw new HttpError(400, "invalid_id", "Identificador inválido.");
    }

    if (req.method === "GET") {
      requirePermission(req, res, "veterinarians.read");

      try {
        return sendJson(
          res,
          200,
          database.getVeterinarianAvailability(veterinarianId),
        );
      } catch (error) {
        throw toHttpError(error, HttpError);
      }
    }

    if (req.method !== "PUT") {
      throw new HttpError(405, "method_not_allowed", "Método não permitido.");
    }

    if (!isSameOriginRequest(req)) {
      throw new HttpError(403, "forbidden_origin", "Origem não autorizada.");
    }

    const authUser = requirePermission(req, res, "veterinarians.write");
    const body = await readJsonBody(req);

    if (!Array.isArray(body.slots)) {
      throw new HttpError(
        400,
        "invalid_availability",
        "Envie a lista de horários em slots.",
      );
    }

    let result;

    try {
      result = database.setVeterinarianAvailability(
        veterinarianId,
        body.slots,
      );
    } catch (error) {
      throw toHttpError(error, HttpError);
    }

    database.recordAudit({
      userId: authUser.id,
      actorEmail: authUser.email,
      action: "veterinarians.availability_update",
      resource: veterinarianId,
      result: "success",
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { slots: result.slots.length },
    });

    return sendJson(res, 200, result);
  };
}
