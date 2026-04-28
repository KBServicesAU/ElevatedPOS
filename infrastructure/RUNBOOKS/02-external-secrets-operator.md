# Runbook 02 — External Secrets Operator (manual `kubectl apply` → AWS Secrets Manager)

## Status (v2.7.61)

`infrastructure/k8s/secrets.yaml` is gitignored, contains 16 production
secrets in plaintext on whoever's laptop is running the deploy, and is
applied via `kubectl apply -f secrets.yaml`. This caused the v2.7.55
outage (template defaults overwrote prod values — see incident notes in
the v2.7.60 commit). It also means any rotation requires a human to:
- edit the file locally
- apply it
- restart 15 deployments

We want to move to AWS Secrets Manager + External Secrets Operator (ESO)
so:
- prod secret values live ONLY in Secrets Manager (encrypted, IAM-gated,
  versioned, audit-logged)
- ESO syncs them into the cluster as a Kubernetes `Secret` object
- rotations happen by updating Secrets Manager — ESO picks up automatically
- the gitignored `secrets.yaml` stops being the source of truth

## Migration plan

### Step 1: Install ESO

ESO ships as a Helm chart. Install:

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm repo update
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets \
  --create-namespace \
  --set installCRDs=true \
  --version 0.10.x
```

CRDs to verify exist after install:
- `ClusterSecretStore`
- `ExternalSecret`

### Step 2: IAM role for ESO to read Secrets Manager

Create a service-account-bound IAM role (IRSA pattern):

```hcl
# infrastructure/terraform/eso-iam.tf
resource "aws_iam_role" "external_secrets" {
  name = "elevatedpos-external-secrets-${var.environment}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.eks.arn }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:sub": "system:serviceaccount:external-secrets:external-secrets"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "external_secrets_read" {
  role = aws_iam_role.external_secrets.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
      Resource = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:elevatedpos/${var.environment}/*"
    }]
  })
}
```

### Step 3: Create the secrets in Secrets Manager

Use one secret per logical group, JSON-encoded:

```bash
# Auth + crypto
aws secretsmanager create-secret --name elevatedpos/prod/auth \
  --secret-string '{
    "JWT_SECRET":"...",
    "INTERNAL_SECRET":"...",
    "NEXTAUTH_SECRET":"...",
    "WEBHOOK_SIGNING_SECRET":"...",
    "ENCRYPTION_KEY":"..."
  }'

# Datastores
aws secretsmanager create-secret --name elevatedpos/prod/datastore \
  --secret-string '{"DATABASE_URL":"...","REDIS_URL":"..."}'

# Stripe
aws secretsmanager create-secret --name elevatedpos/prod/stripe \
  --secret-string '{
    "STRIPE_SECRET_KEY":"sk_live_...",
    "STRIPE_WEBHOOK_SECRET":"whsec_...",
    "STRIPE_CONNECT_CLIENT_ID":"ca_..."
  }'

# Email
aws secretsmanager create-secret --name elevatedpos/prod/email \
  --secret-string '{"RESEND_API_KEY":"re_..."}'

# Integrations
aws secretsmanager create-secret --name elevatedpos/prod/integrations \
  --secret-string '{
    "ANZ_INTEGRATOR_ID":"...",
    "ANTHROPIC_API_KEY":"...",
    "TYPESENSE_API_KEY":"...",
    "TYRO_API_KEY":""
  }'
```

Source the values from the current `infrastructure/k8s/secrets.yaml`.

### Step 4: ClusterSecretStore + ExternalSecret CRDs

```yaml
# infrastructure/k8s/eso-cluster-secret-store.yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: aws-secrets-manager
spec:
  provider:
    aws:
      service: SecretsManager
      region: ap-southeast-2
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets
            namespace: external-secrets

---
# infrastructure/k8s/eso-elevatedpos-secrets.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: elevatedpos-secrets
  namespace: elevatedpos
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: elevatedpos-secrets
    creationPolicy: Owner   # ESO owns the resulting Secret — drop the manual one first
  dataFrom:
    - extract:
        key: elevatedpos/prod/auth
    - extract:
        key: elevatedpos/prod/datastore
    - extract:
        key: elevatedpos/prod/stripe
    - extract:
        key: elevatedpos/prod/email
    - extract:
        key: elevatedpos/prod/integrations
```

ESO merges all five `dataFrom` extracts into a single Kubernetes Secret
named `elevatedpos-secrets` — same name every deployment already
references, so no deployment.yaml changes needed.

### Step 5: Cutover

1. Verify the manual `secrets.yaml` matches Secrets Manager exactly.
2. `kubectl delete secret elevatedpos-secrets -n elevatedpos`
3. `kubectl apply -f infrastructure/k8s/eso-cluster-secret-store.yaml -f infrastructure/k8s/eso-elevatedpos-secrets.yaml`
4. ESO recreates the Secret within ~30s.
5. Spot-check an env var on a fresh pod — if values match, success.

### Step 6: Rotation flow going forward

Old:
- edit `secrets.yaml`, kubectl apply, kubectl rollout restart × 15.

New:
- `aws secretsmanager update-secret --secret-id elevatedpos/prod/stripe --secret-string '{...}'`
- ESO refreshes within `refreshInterval` (1h default; force with
  `kubectl annotate externalsecret elevatedpos-secrets force-sync=$(date +%s) --overwrite`)
- `kubectl rollout restart -n elevatedpos deploy/auth …` to bake fresh values into pods

The git-tracked `secrets.yaml.template` becomes purely documentation —
no merchant ever copies it to a real secrets.yaml.

## Why this isn't done yet

Cutover requires:
- ESO running stable in cluster (~10 min)
- All 16 secrets pre-populated in Secrets Manager (manual/scripted)
- A deletion + recreation of the live Kubernetes Secret object — a botched
  cutover takes everything down.

This is a 2-3 hour planned maintenance window, not a session-batch job.

Estimated effort: half a day for the full migration including verification.
