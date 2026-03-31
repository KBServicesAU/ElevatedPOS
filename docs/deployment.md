# ElevatedPOS Deployment Guide

## Prerequisites

- AWS CLI configured with appropriate credentials
- Terraform 1.6+
- kubectl
- Helm 3
- Docker
- pnpm 9+
- Node.js 20+

---

## Local Development

### 1. Start the local infrastructure stack

```bash
pnpm docker:dev
```

This starts:
- **PostgreSQL 16** on port 5432
- **Redis 7** on port 6379
- **Kafka + Zookeeper** on port 9092
- **Typesense** on port 8108
- **MailHog** on port 8025 (SMTP 1025, UI 8025)
- **Temporal** on port 7233 (UI 8088)

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with local values
```

Key variables to set locally:
```
DATABASE_URL=postgres://elevatedpos:elevatedpos@localhost:5432/elevatedpos
REDIS_URL=redis://localhost:6379
KAFKA_BROKERS=localhost:9092
JWT_SECRET=dev-secret-change-in-production
ANTHROPIC_API_KEY=sk-ant-...
```

### 4. Run migrations

```bash
pnpm db:migrate
```

This runs the `0001_initial.sql` migration in each service.

### 5. Start all services in dev mode

```bash
pnpm dev
```

Services will hot-reload on file changes via `tsx --watch`.

### Service ports (local dev):

| App/Service | URL |
|-------------|-----|
| web-backoffice | http://localhost:3000 |
| auth | http://localhost:4001 |
| catalog | http://localhost:4002 |
| inventory | http://localhost:4003 |
| orders | http://localhost:4004 |
| payments | http://localhost:4005 |
| customers | http://localhost:4006 |
| loyalty | http://localhost:4007 |
| campaigns | http://localhost:4008 |
| notifications | http://localhost:4009 |
| integrations | http://localhost:4010 |
| automations | http://localhost:4011 |
| ai | http://localhost:4012 |
| hardware-bridge | http://localhost:9999 |
| kds-display | http://localhost:3001 |

---

## Production Deployment on AWS

### Step 1 — Bootstrap Terraform state

```bash
# Create the S3 bucket and DynamoDB table for Terraform state
aws s3 mb s3://elevatedpos-terraform-state --region ap-southeast-2
aws s3api put-bucket-versioning \
  --bucket elevatedpos-terraform-state \
  --versioning-configuration Status=Enabled
aws dynamodb create-table \
  --table-name elevatedpos-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-southeast-2
```

### Step 2 — Provision infrastructure

```bash
cd infrastructure/terraform

# Initialise providers and remote state
terraform init

# Review the plan
terraform plan \
  -var="environment=prod" \
  -var="db_password=<STRONG_PASSWORD>"

# Apply (takes ~20 minutes for EKS cluster)
terraform apply \
  -var="environment=prod" \
  -var="db_password=<STRONG_PASSWORD>"
```

### Step 3 — Configure kubectl

```bash
aws eks update-kubeconfig \
  --region ap-southeast-2 \
  --name elevatedpos-prod
```

### Step 4 — Create Kubernetes namespace and secrets

```bash
kubectl apply -f infrastructure/k8s/namespace.yaml

# Create the secrets (substitute real values)
kubectl create secret generic elevatedpos-secrets \
  --from-literal=DATABASE_URL="postgres://elevatedpos:<password>@<rds-endpoint>:5432/elevatedpos?sslmode=require" \
  --from-literal=REDIS_URL="rediss://<redis-endpoint>:6379" \
  --from-literal=KAFKA_BROKERS="<broker1>:9094,<broker2>:9094,<broker3>:9094" \
  --from-literal=JWT_SECRET="<64-char-random-string>" \
  --from-literal=JWT_REFRESH_SECRET="<64-char-random-string>" \
  --from-literal=ANTHROPIC_API_KEY="sk-ant-..." \
  --from-literal=STRIPE_SECRET_KEY="sk_live_..." \
  --from-literal=TYRO_API_KEY="..." \
  --from-literal=SENDGRID_API_KEY="..." \
  --from-literal=TWILIO_AUTH_TOKEN="..." \
  -n elevatedpos
```

### Step 5 — Build and push Docker images

```bash
# Login to ECR
aws ecr get-login-password --region ap-southeast-2 | \
  docker login --username AWS --password-stdin \
  <ACCOUNT_ID>.dkr.ecr.ap-southeast-2.amazonaws.com

# Build and push each service (example for auth)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
IMAGE_TAG=$(git rev-parse --short HEAD)

for SERVICE in auth catalog inventory orders payments customers loyalty campaigns notifications integrations automations ai hardware-bridge; do
  docker build \
    -t $ACCOUNT_ID.dkr.ecr.ap-southeast-2.amazonaws.com/elevatedpos/$SERVICE:$IMAGE_TAG \
    -t $ACCOUNT_ID.dkr.ecr.ap-southeast-2.amazonaws.com/elevatedpos/$SERVICE:latest \
    -f services/$SERVICE/Dockerfile .
  docker push $ACCOUNT_ID.dkr.ecr.ap-southeast-2.amazonaws.com/elevatedpos/$SERVICE:$IMAGE_TAG
  docker push $ACCOUNT_ID.dkr.ecr.ap-southeast-2.amazonaws.com/elevatedpos/$SERVICE:latest
done

# Web apps
for APP in web-backoffice kds-display; do
  docker build \
    -t $ACCOUNT_ID.dkr.ecr.ap-southeast-2.amazonaws.com/elevatedpos/$APP:$IMAGE_TAG \
    -t $ACCOUNT_ID.dkr.ecr.ap-southeast-2.amazonaws.com/elevatedpos/$APP:latest \
    -f apps/$APP/Dockerfile .
  docker push $ACCOUNT_ID.dkr.ecr.ap-southeast-2.amazonaws.com/elevatedpos/$APP:$IMAGE_TAG
  docker push $ACCOUNT_ID.dkr.ecr.ap-southeast-2.amazonaws.com/elevatedpos/$APP:latest
done
```

### Step 6 — Deploy to Kubernetes

```bash
# Replace ACCOUNT_ID placeholder in manifests
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
find infrastructure/k8s -name "*.yaml" -exec \
  sed -i "s/ACCOUNT_ID/$ACCOUNT_ID/g" {} +

# Apply all manifests
kubectl apply -f infrastructure/k8s/namespace.yaml
kubectl apply -f infrastructure/k8s/serviceaccount.yaml
kubectl apply -f infrastructure/k8s/configmap.yaml
kubectl apply -f infrastructure/k8s/services/
kubectl apply -f infrastructure/k8s/apps/
kubectl apply -f infrastructure/k8s/ingress.yaml
```

### Step 7 — Run database migrations

```bash
# Run migrations for each service via a one-off pod
for SERVICE in auth catalog inventory orders payments customers loyalty campaigns notifications integrations automations; do
  kubectl run migrate-$SERVICE \
    --image=$ACCOUNT_ID.dkr.ecr.ap-southeast-2.amazonaws.com/elevatedpos/$SERVICE:latest \
    --restart=Never \
    --rm \
    --attach \
    --env-from=secret/elevatedpos-secrets \
    --env-from=configmap/elevatedpos-config \
    -n elevatedpos \
    -- pnpm db:migrate
done
```

### Step 8 — Verify deployment

```bash
# Check all pods are running
kubectl get pods -n elevatedpos

# Check service endpoints
kubectl get services -n elevatedpos

# Check ingress
kubectl get ingress -n elevatedpos

# Tail logs for a service
kubectl logs -f deployment/orders -n elevatedpos

# Scale a service manually if needed
kubectl scale deployment orders --replicas=5 -n elevatedpos
```

---

## CI/CD Pipeline

The recommended CI/CD flow using GitHub Actions:

1. **On pull request**: `pnpm lint && pnpm test && pnpm build`
2. **On merge to `main`**:
   - Run full test suite
   - Build Docker images tagged with git SHA
   - Push to ECR
   - Update Kubernetes deployments with new image tags
   - Run smoke tests against staging

```yaml
# .github/workflows/deploy.yml (example)
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install
      - run: pnpm test
      - run: pnpm build
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-southeast-2
      - name: Build and push images
        run: ./scripts/build-and-push.sh
      - name: Deploy to EKS
        run: ./scripts/deploy.sh
```

---

## Monitoring & Observability

- **Metrics**: Prometheus (MSK JMX/Node exporters) + Grafana dashboards
- **Logs**: CloudWatch Container Insights (stdout/stderr from pods)
- **Traces**: AWS X-Ray (via `@aws-lambda-powertools/tracer` or OTEL)
- **Alerts**: CloudWatch Alarms → SNS → PagerDuty
- **Uptime**: Route 53 health checks on `/health` endpoints

### Key metrics to monitor:
- Order creation rate and p99 latency
- Payment success/failure rate
- Kafka consumer group lag
- Redis memory utilisation
- RDS connection count and slow query count
- Pod restart count (CrashLoopBackOff indicator)

---

## Rollback

To rollback a deployment to the previous image:

```bash
kubectl rollout undo deployment/orders -n elevatedpos
```

To rollback to a specific revision:

```bash
kubectl rollout history deployment/orders -n elevatedpos
kubectl rollout undo deployment/orders --to-revision=3 -n elevatedpos
```

---

## Scaling

HPAs are configured for all services. To adjust limits:

```bash
# Manual override
kubectl patch hpa orders -n elevatedpos -p '{"spec":{"maxReplicas":30}}'

# Or edit the manifest and reapply
kubectl apply -f infrastructure/k8s/services/orders.yaml
```

For peak trading periods (e.g., Black Friday), pre-scale:
```bash
kubectl scale deployment orders --replicas=15 -n elevatedpos
kubectl scale deployment payments --replicas=10 -n elevatedpos
```
