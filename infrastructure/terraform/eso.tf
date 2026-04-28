# ═══════════════════════════════════════════════════════════════════════════════
# External Secrets Operator — IAM scaffolding (v2.7.62)
# ═══════════════════════════════════════════════════════════════════════════════
#
# Defines the IAM role ESO will assume (via IRSA — IAM Roles for Service
# Accounts) to read AWS Secrets Manager. Resources here apply safely even
# without ESO installed in the cluster — they're just an IAM role + policy
# that nothing references until the operator's ServiceAccount actually
# tries to assume it.
#
# Cutover sequence (runbook 02 in infrastructure/RUNBOOKS):
#   1. terraform apply (this file) — IAM role exists.
#   2. helm install external-secrets ... — ESO running with the SA
#      that maps to this role via the eks.amazonaws.com/role-arn annotation.
#   3. Populate AWS Secrets Manager with the prod secret values.
#   4. kubectl apply -f infrastructure/k8s/eso-cluster-secret-store.yaml \
#                     -f infrastructure/k8s/eso-elevatedpos-secrets.yaml
#   5. kubectl delete secret elevatedpos-secrets -n elevatedpos
#      (ESO recreates within ~30s with values from Secrets Manager).
#
# Step 5 is the only risky moment — if ESO can't read Secrets Manager
# (IAM mis-wired) the secret stays gone and every pod that mounts it
# fails the next time the kubelet syncs env. Have the manual
# `kubectl apply -f infrastructure/k8s/secrets.yaml` ready as a rollback.

resource "aws_iam_role" "external_secrets" {
  name        = "elevatedpos-external-secrets-${var.environment}"
  description = "Assumed by the External Secrets Operator service account in the external-secrets namespace. Read-only access to elevatedpos/${var.environment}/* secrets."

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = module.eks.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${module.eks.oidc_provider}:aud" = "sts.amazonaws.com"
          "${module.eks.oidc_provider}:sub" = "system:serviceaccount:external-secrets:external-secrets"
        }
      }
    }]
  })

  tags = {
    Environment = var.environment
    Purpose     = "ExternalSecretsOperator"
  }
}

resource "aws_iam_role_policy" "external_secrets_read" {
  name = "secretsmanager-read-elevatedpos"
  role = aws_iam_role.external_secrets.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret",
      ]
      # Only the prod secrets for THIS environment — IAM-level fence
      # against a misconfigured ExternalSecret pointing at the wrong path.
      Resource = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:elevatedpos/${var.environment}/*"
    }]
  })
}

# ─── Outputs ─────────────────────────────────────────────────────────────────

output "external_secrets_role_arn" {
  description = "Annotate the ESO ServiceAccount with this ARN: eks.amazonaws.com/role-arn=<arn>. Used in the Helm install command in runbook 02."
  value       = aws_iam_role.external_secrets.arn
}
