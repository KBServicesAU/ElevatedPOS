# NEXUS Production Deployment Guide

## Prerequisites
- AWS account with appropriate IAM permissions
- Domain name registered (any registrar)
- Expo account + EAS CLI configured
- Apple Developer account (for iOS IPA distribution)
- `kubectl`, `terraform`, `aws-cli`, `pnpm`, `eas-cli` installed locally

---

## 1. Initial AWS Setup

```bash
# Configure AWS CLI
aws configure
# Region: ap-southeast-2
# Output format: json

# Initialise Terraform
cd infrastructure/terraform
terraform init

# Copy and fill in your variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — set domain_name, db_password, etc.

# Plan and apply
terraform plan -out=tfplan
terraform apply tfplan
```

After apply, Terraform outputs your **nameservers**. Point your domain registrar to these nameservers. DNS propagation takes 5-48 hours.

---

## 2. Configure GitHub Secrets

Go to Settings → Secrets → Actions and add:

| Secret | Value |
|--------|-------|
| `AWS_ACCESS_KEY_ID` | From IAM user |
| `AWS_SECRET_ACCESS_KEY` | From IAM user |
| `AWS_ACCOUNT_ID` | Your 12-digit AWS account ID |
| `DB_PASSWORD` | Same as terraform.tfvars db_password |
| `JWT_SECRET` | 256-bit random string |
| `INTERNAL_SECRET` | 256-bit random string |
| `STRIPE_SECRET_KEY` | From Stripe dashboard |
| `STRIPE_PUBLISHABLE_KEY` | From Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | From Stripe webhook settings |
| `NEXTAUTH_SECRET` | 256-bit random string |
| `EXPO_TOKEN` | From expo.dev → Access Tokens |
| `EAS_PROJECT_ID` | From eas.json after `eas init` |
| `EXPO_PUBLIC_API_URL` | `https://api.your-domain.com` |

Generate random secrets:
```bash
openssl rand -base64 32
```

---

## 3. First Deployment

```bash
# Build and push all Docker images, run migrations, deploy to EKS
git tag v1.0.0
git push origin v1.0.0
```

This triggers the CI/CD pipeline which:
1. Runs all tests
2. Builds Docker images for all 15 services
3. Pushes to ECR
4. Runs database migrations
5. Deploys to EKS

---

## 4. Build Mobile APKs

After the server is deployed and `EXPO_PUBLIC_API_URL` is set:

```bash
cd apps/mobile

# Build all three role-locked APKs (triggered automatically on version tag)
# Or manually:
eas build --profile production-pos   --platform android --non-interactive
eas build --profile production-kds   --platform android --non-interactive
eas build --profile production-kiosk --platform android --non-interactive

# For iPad (iOS):
eas build --profile production-pos   --platform ios --non-interactive
eas build --profile production-kds   --platform ios --non-interactive
eas build --profile production-kiosk --platform ios --non-interactive
```

Downloads appear in the Expo dashboard at expo.dev.

---

## 5. Distributing APKs to Customers

### Android APK (direct install)
1. Download the `.apk` from expo.dev after build completes
2. Send directly to customer or host on your download server
3. Customer enables "Install from unknown sources" in Android settings
4. Installs like any app

### iOS IPA (iPad)
With enterprise/adhoc provisioning:
1. Download the `.ipa` from expo.dev
2. Distribute via Apple Configurator 2 (USB) or MDM (Mobile Device Management)
3. For ad-hoc: device UDID must be registered in your Apple Developer account first

### Which APK goes to which customer?
| Product tier | Android | iOS |
|---|---|---|
| Base (POS) | `nexus-pos.apk` | `nexus-pos.ipa` |
| + KDS addon | `nexus-kds.apk` | `nexus-kds.ipa` |
| + Kiosk addon | `nexus-kiosk.apk` | `nexus-kiosk.ipa` |

---

## 6. Onboarding a New Customer

1. Create their organisation in the back-office (or via `POST /api/v1/auth/register`)
2. Set their plan in the database (`professional` for KDS/Kiosk access)
3. Send them their back-office URL: `https://app.your-domain.com`
4. They generate pairing codes from **Devices → Generate Code**
5. They enter the code on each device
6. Devices are online within 30 seconds

---

## 7. Monitoring

- **Logs**: `kubectl logs -n nexus -l app=<service> --follow`
- **Metrics**: CloudWatch Container Insights (enabled by EKS add-on)
- **Health checks**: All services expose `GET /health` → `{ status: 'ok' }`
- **Alerts**: Configure CloudWatch alarms for CPU, memory, error rates

---

## 8. SSL Certificate Renewal

ACM certificates auto-renew. No action required as long as the DNS validation records remain in Route53 (Terraform manages these — do not delete them).
