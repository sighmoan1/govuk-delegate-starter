export async function healthResponse(checkDatabase: () => Promise<unknown>): Promise<Response> {
  try {
    await checkDatabase();
    return Response.json({ service: "observatory", status: "ready", database: "ready" }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // Do not disclose connection strings, internal errors or research data.
    return Response.json({ service: "observatory", status: "unavailable", database: "unavailable" }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
