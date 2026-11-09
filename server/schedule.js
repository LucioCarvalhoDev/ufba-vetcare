export function createScheduleRouter({
  database,
  requirePermission,
  sendJson,
  HttpError,
}) {
  return function handleSchedule(req, res, pathname) {
    if (pathname !== "/api/schedule" || req.method !== "GET") {
      throw new HttpError(404, "not_found", "Rota não encontrada.");
    }

    requirePermission(req, res, "appointments.read");
    const params = new URL(req.url ?? "/", "http://localhost").searchParams;
    const from = params.get("from") ?? "";

    try {
      return sendJson(res, 200, database.getSchedule(from));
    } catch (error) {
      if (error.code === "INVALID_SCHEDULE_RANGE") {
        throw new HttpError(400, "invalid_schedule_range", error.message);
      }

      throw error;
    }
  };
}
