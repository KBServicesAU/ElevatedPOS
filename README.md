# NEXUS — Unified Commerce & Operations Platform

> Australia-first · Cloud-native · AI-powered · Offline-capable

NEXUS is a next-generation POS and unified commerce platform designed for retail, hospitality, QSR, franchise, and hybrid operators. It combines the best of EPOS Now, Lightspeed, Toast, Square, Shopify POS, and Revel while exceeding them in speed, flexibility, AI capabilities, and developer extensibility.

## Architecture

```
nexus/
├── apps/
│   ├── web-backoffice/     # Next.js 14 — Back office UI (port 3000)
│   ├── pos-client/         # React Native + Expo — POS app
│   ├── kiosk/              # React Native — Self-service kiosk
│   └── kds-display/        # React — Kitchen display (browser)
├── services/
│   ├── auth/               # Authentication, JWT, employees, roles (port 4001)
│   ├── catalog/            # Products, categories, modifiers, price lists (port 4002)
│   ├── inventory/          # Stock, POs, transfers, suppliers (port 4003)
│   ├── orders/             # Order management (port 4004)
│   ├── payments/           # Payment orchestration (port 4005)
│   ├── customers/          # CRM, store credit (port 4006)
│   ├── loyalty/            # Points, tiers, stamps (port 4007)
│   ├── campaigns/          # Email/SMS campaigns (port 4008)
│   ├── notifications/      # Push, email, SMS dispatch (port 4009)
│   ├── integrations/       # App marketplace, webhooks (port 4010)
│   ├── automations/        # Workflow automation (port 4011)
│   ├── ai/                 # AI copilot via Anthropic (port 4012)
│   └── hardware-bridge/    # Local hardware bridge (port 9999)
├── packages/
│   ├── config/             # Shared TypeScript + ESLint config
│   ├── event-schemas/      # Kafka event type definitions
│   ├── api-client/         # Generated API client (ky-based)
│   └── test-utils/         # Shared test factories + helpers
└── infrastructure/
    ├── docker/             # Docker Compose for local dev
    ├── terraform/          # AWS infrastructure as code
    └── k8s/                # Kubernetes manifests + Helm charts
```

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm 9+
- Docker + Docker Compose

### 1. Start infrastructure
```bash
pnpm docker:dev
```

### 2. Install dependencies
```bash
pnpm install
```

### 3. Copy environment config
```bash
cp .env.example .env
# Edit .env with your local settings
```

### 4. Run migrations
```bash
pnpm db:migrate
```

### 5. Start all services
```bash
pnpm dev
```

### 6. Open the back office
Visit http://localhost:3000

## Services

| Service | Port | Description |
|---------|------|-------------|
| web-backoffice | 3000 | Next.js back office dashboard |
| auth | 4001 | Authentication, JWT, users, roles |
| catalog | 4002 | Products, categories, modifiers |
| inventory | 4003 | Stock, POs, transfers, suppliers |
| orders | 4004 | Order management |
| payments | 4005 | Payment orchestration |
| customers | 4006 | CRM, store credit |
| loyalty | 4007 | Points, tiers, stamps |
| campaigns | 4008 | Email/SMS campaigns |
| notifications | 4009 | Push/email/SMS dispatch |
| integrations | 4010 | App marketplace, webhooks |
| automations | 4011 | Workflow automation |
| ai | 4012 | AI copilot (Anthropic Claude) |
| hardware-bridge | 9999 | Local printer/drawer bridge |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js 22 + Fastify + TypeScript |
| Database | PostgreSQL 16 (via Drizzle ORM) |
| Cache | Redis 7 |
| Events | Kafka (Confluent) |
| Search | Typesense |
| Workflows | Temporal.io |
| Frontend | Next.js 14 + TailwindCSS + Radix UI |
| Mobile | React Native + Expo |
| AI | Anthropic Claude API |
| Infrastructure | AWS EKS + Terraform |
| CI/CD | GitHub Actions |

## Development

```bash
# Run all tests
pnpm test

# Type check everything
pnpm typecheck

# Lint everything
pnpm lint

# Build all packages
pnpm build
```

## License

Proprietary — All rights reserved.
