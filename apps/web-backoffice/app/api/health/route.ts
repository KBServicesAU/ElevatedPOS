/**
 * GET /api/health
 * Kubernetes readiness and liveness probe endpoint.
 * Returns 200 as long as the Next.js server is running.
 */
export async function GET() {
  return Response.json({ status: 'ok', service: 'web-backoffice' });
}
