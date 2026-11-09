export function createDashboardRouter({
  database,
  requirePermission,
  sendJson,
  HttpError,
}) {
  return function handleDashboard(req, res, pathname) {
    if (pathname !== "/api/veterinarian-dashboard" || req.method !== "GET") {
      throw new HttpError(404, "not_found", "Rota não encontrada.");
    }

    const authUser = requirePermission(req, res, "appointments.read");
    const params = new URL(req.url ?? "/", "http://localhost").searchParams;

    try {
      return sendJson(
        res,
        200,
        database.getVeterinarianDashboard(authUser.id, {
          date: params.get("date") ?? "",
          month: params.get("month") ?? "",
        }),
      );
    } catch (error) {
      if (error.code === "VETERINARIAN_ONLY") {
        throw new HttpError(403, "veterinarian_only", error.message);
      }

      if (error.code === "INVALID_DASHBOARD_QUERY") {
        throw new HttpError(400, "invalid_dashboard_query", error.message);
      }

      throw error;
    }
  };
}
