/**
 * SSRF guard for outbound webhook delivery.
 *
 * Webhook endpoints are merchant-configured URLs that the orders /
 * payments / etc. services hit to push events. Without a guard, a
 * malicious merchant could register e.g.:
 *
 *   http://169.254.169.254/latest/meta-data/iam/security-credentials/
 *
 * which on AWS / GCP returns the IMDS instance role's credentials in
 * the response body — the webhook delivery service stores the body on
 * the delivery row, and the merchant can read it back via the GET
 * /webhooks/deliveries dashboard. Same vector for hitting:
 *
 *   - 127.0.0.1 (other local services on the cluster)
 *   - 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 (RFC1918 private nets,
 *     reachable from inside the VPC including Postgres, Redis, etc.)
 *   - 169.254.0.0/16 (link-local — IMDS, Wireguard, etc.)
 *   - ::1, fc00::/7, fe80::/10 (IPv6 equivalents)
 *
 * We also reject URLs whose hostname is a literal IP — webhook URLs in
 * the wild always use a registered domain. This keeps the rule simple
 * (no need to resolve DNS at register time) and forces the merchant to
 * use their own externally-routable hostname.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.gce.internal',
  'metadata',
  'instance-data',
  'instance-data.ec2.internal',
]);

/** Anything that parses as an IPv4 / IPv6 literal — reject outright.
 *  Keeps the rule simple: webhooks must use registered hostnames. */
function isIpLiteral(host: string): boolean {
  // IPv6 — bracketed in URLs ([::1]) but URL.hostname strips the brackets.
  if (/:/.test(host)) return true;
  // IPv4 dotted quad.
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

export interface SsrfCheckResult {
  ok: boolean;
  reason?: string;
}

export function checkWebhookUrl(rawUrl: string): SsrfCheckResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'invalid url' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: `unsupported protocol "${parsed.protocol}" — http(s) only` };
  }

  // In production we strongly prefer https — but legitimate test
  // endpoints (ngrok-free, dev tunnels) sometimes serve plain http,
  // so we don't hard-block it.

  const host = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: `webhook hostname "${host}" is not allowed` };
  }

  if (isIpLiteral(host)) {
    return { ok: false, reason: 'webhook URL must use a hostname, not an IP literal' };
  }

  // Reject `*.local` and `*.internal` Bonjour / cluster DNS suffixes.
  // Real merchants don't put webhooks behind these.
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) {
    return { ok: false, reason: `webhook hostname suffix "${host}" is reserved for local networks` };
  }

  return { ok: true };
}
