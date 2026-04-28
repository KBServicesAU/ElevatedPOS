# Runbook 01 — Postgres TLS hardening (sslmode=no-verify → verify-full)

## Status (v2.7.61)

Production `DATABASE_URL` ends with `?sslmode=no-verify`. That gives us
encryption-in-transit (good) but skips certificate hostname verification
(bad — open to a MITM attacker who can intercept the VPC subnet route).

## What changes

`?sslmode=verify-full` makes libpq verify both:
- the certificate chain against a trusted CA
- the certificate's CN/SAN against the connection hostname

For RDS that means we need the AWS RDS CA bundle baked into every container
that connects to Postgres, plus the URL extended with
`?sslmode=verify-full&sslrootcert=/etc/ssl/certs/rds-combined-ca-bundle.pem`.

## Steps

### 1. Get the bundle in our repo

```bash
mkdir -p infrastructure/certs
curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
  -o infrastructure/certs/rds-global-bundle.pem
sha256sum infrastructure/certs/rds-global-bundle.pem
# Pin the sha256 in the Dockerfile for tamper evidence.
```

The bundle is ~4 KB and AWS-rotates ~1× per year. Keep the URL pinned in
this runbook so we can refresh.

### 2. Bake into every service image

Add to **every** services/*/Dockerfile production runner stage (after the
`FROM node:20-alpine AS runner` line):

```dockerfile
# RDS CA bundle for sslmode=verify-full DATABASE_URL connections.
# Pinned sha256 to detect a compromised bundle URL.
COPY infrastructure/certs/rds-global-bundle.pem /etc/ssl/certs/rds-combined-ca-bundle.pem
RUN echo "<sha256-here>  /etc/ssl/certs/rds-combined-ca-bundle.pem" | sha256sum -c -
```

Apps (`apps/web-backoffice/Dockerfile` etc.) need the same line.

A cleaner long-term path is a shared base image
(`infrastructure/docker/Dockerfile.base`) that every service inherits from
— but that's a bigger refactor; do it in a follow-up.

### 3. Update DATABASE_URL in production secret

In `infrastructure/k8s/secrets.yaml` (gitignored), append to the existing
DATABASE_URL:

```
?sslmode=verify-full&sslrootcert=/etc/ssl/certs/rds-combined-ca-bundle.pem
```

Apply:

```bash
kubectl apply -f infrastructure/k8s/secrets.yaml
kubectl rollout restart -n elevatedpos deploy/auth   # smallest blast radius first
```

### 4. Verify on auth pod

```bash
POD=$(kubectl get pods -n elevatedpos -l app=auth --field-selector status.phase=Running --no-headers | head -1 | awk '{print $1}')
kubectl exec -n elevatedpos "$POD" -- node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT 1').then(r => { console.log('OK', r.rows); pool.end(); }).catch(e => { console.error('FAIL', e.message); pool.end(); process.exit(1); });
"
```

If you see `FAIL` with a TLS error, fall back by removing `verify-full` from
the URL and re-applying (don't redeploy the whole cluster — just edit the
secret and restart auth).

### 5. Roll across remaining services

Once auth verifies, roll out the rest in this order:
1. integrations, payments (next-most critical)
2. orders, customers, catalog, inventory
3. everything else

Use `kubectl rollout restart` per service so a TLS-config typo crashes
exactly one service rather than the whole cluster simultaneously.

### 6. Update template

Update `infrastructure/k8s/secrets.yaml.template` line 60-ish (the
`DATABASE_URL` line) to include the verify-full + sslrootcert suffix in
its prod-warning comment.

## Why this isn't done yet

Doing it mid-incident risks every service crashing on TLS handshake at
once if the bundle path is wrong. Recovery requires editing the secret,
which is a manual + audited action. Better to do this as a planned
maintenance window — apply, verify auth, watch dashboards for 30 min,
then roll the rest in batches.

Estimated effort: 2-3 hours including verification + the Dockerfile
refactor for all services.
