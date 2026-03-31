# ElevatedPOS — Architecture Guide

## Overview

ElevatedPOS is a cloud-native, microservices-based unified commerce platform built for Australian retail and hospitality operators. It is designed to run on AWS EKS with full offline-capable POS clients.

## System Architecture

```
                        ┌─────────────────────────────────────────┐
                        │            AWS ALB (HTTPS)               │
                        └───────────┬─────────────────────────────┘
                                    │
              ┌─────────────────────┼──────────────────────────┐
              │                     │                          │
     ┌────────▼──────┐    ┌────────▼──────┐         ┌────────▼──────┐
     │ web-backoffice│    │  kds-display  │         │  API Gateway  │
     │ (Next.js 14)  │    │ (Next.js 14)  │         │  /api/v1/*    │
     │   port 3000   │    │   port 3001   │         └──────┬────────┘
     └───────────────┘    └───────────────┘                │
                                                           │
                    ┌──────────────────────────────────────┤
                    │                                      │
          ┌─────────┴──────────────────────────────────────┐
          │              Kubernetes (EKS) — namespace: elevatedpos│
          │                                                 │
          │  auth:4001      catalog:4002   inventory:4003   │
          │  orders:4004    payments:4005  customers:4006   │
          │  loyalty:4007   campaigns:4008 notifications:4009│
          │  integrations:4010  automations:4011  ai:4012   │
          │  hardware-bridge:9999                           │
          └──────────┬──────────────────────────────────────┘
                     │
          ┌──────────┼──────────────────────────────────┐
          │          │                                  │
   ┌──────▼────┐ ┌───▼───────────┐             ┌───────▼──────┐
   │ RDS       │ │ ElastiCache   │             │ MSK (Kafka)  │
   │ PostgreSQL│ │ Redis         │             │              │
   │ (per svc) │ │ (sessions,    │             │ (events)     │
   │           │ │  rate limits) │             │              │
   └───────────┘ └───────────────┘             └──────────────┘
```

## Monorepo Structure

The codebase uses **Turborepo** with **pnpm workspaces**:

```
elevatedpos/
├── apps/
│   ├── web-backoffice/     Next.js 14 App Router — merchant back office
│   ├── pos-client/         Expo Router — iOS/Android POS terminal
│   ├── kiosk/              Expo Router — customer self-service kiosk
│   └── kds-display/        Next.js 14 — kitchen display system
├── services/               13 Fastify microservices
├── packages/
│   ├── config/             Shared tsconfig, eslint, prettier
│   ├── event-schemas/      Kafka event type definitions (Zod)
│   ├── api-client/         ky-based typed API client
│   ├── sdk/                External developer SDK (npm package)
│   ├── test-utils/         Vitest factories + helpers
│   └── ui-components/      Shared React component library
└── infrastructure/
    ├── docker/             Local dev Docker Compose stack
    ├── terraform/          AWS infrastructure (EKS, RDS, Redis, MSK)
    └── k8s/                Kubernetes manifests (Deployments, Services, HPAs)
```

## Services

| Service | Port | Database | Responsibilities |
|---------|------|----------|-----------------|
| auth | 4001 | PostgreSQL | JWT issuance, employee management, RBAC, PIN auth |
| catalog | 4002 | PostgreSQL | Products, categories, modifiers, price lists, tax classes |
| inventory | 4003 | PostgreSQL | Stock levels, purchase orders, transfers, suppliers |
| orders | 4004 | PostgreSQL | Order lifecycle, line items, refunds, order numbers |
| payments | 4005 | PostgreSQL | Payment orchestration, Tyro/Square/Stripe, settlements |
| customers | 4006 | PostgreSQL | CRM, store credit, GDPR compliance |
| loyalty | 4007 | PostgreSQL | Points programs, tiers, idempotent transactions |
| campaigns | 4008 | PostgreSQL | Email/SMS campaign management and scheduling |
| notifications | 4009 | PostgreSQL | Multi-channel dispatch (push, email, SMS) |
| integrations | 4010 | PostgreSQL | App marketplace, webhook CRUD, delivery tracking |
| automations | 4011 | PostgreSQL | Trigger-based workflow rules and execution history |
| ai | 4012 | — | Anthropic Claude copilot for insights and chat |
| hardware-bridge | 9999 | — | Local USB/network printer, cash drawer, scanner bridge |

## Technology Stack

### Backend
- **Runtime**: Node.js 20 LTS
- **Framework**: Fastify 4 with TypeScript
- **ORM**: Drizzle ORM with PostgreSQL
- **Validation**: Zod
- **Authentication**: @fastify/jwt (RS256)
- **Message bus**: Apache Kafka (MSK) via kafkajs
- **Cache/sessions**: Redis (ElastiCache) via ioredis
- **Workflows**: Temporal (self-hosted)

### Frontend
- **Back office**: Next.js 14 App Router, Tailwind CSS, Zustand
- **POS / Kiosk**: React Native + Expo SDK 51, Expo Router, Zustand
- **KDS Display**: Next.js 14, Tailwind CSS, WebSockets

### Infrastructure
- **Cloud**: AWS (ap-southeast-2 primary)
- **Compute**: EKS (Kubernetes 1.29) with m6i.xlarge nodes
- **Database**: RDS PostgreSQL 16 (Multi-AZ in prod)
- **Cache**: ElastiCache Redis 7 (cluster mode)
- **Messaging**: MSK (Kafka 3.5.1)
- **Container registry**: ECR (per-service repositories)
- **TLS**: ACM with ALB ingress
- **IaC**: Terraform 1.6+

## Event-Driven Architecture

Services communicate via Kafka events defined in `packages/event-schemas`:

```
order.created       → inventory (reserve), loyalty (evaluate), notifications
order.completed     → loyalty (award points), campaigns (trigger), analytics
payment.captured    → orders (update status), notifications
customer.created    → loyalty (enroll), campaigns (welcome)
inventory.low_stock → automations (trigger rules), notifications
loyalty.tier_changed → automations (trigger rules), notifications
```

## Multi-Tenancy

All tables include an `org_id` (UUID) column. Every API request is scoped to the authenticated organisation extracted from the JWT. Row-level filtering is enforced at the service layer, never at the database layer.

## Offline Capability

The POS client (`pos-client`) uses a local SQLite store (via `expo-sqlite`) to queue orders when network connectivity is unavailable. A background sync service reconciles queued transactions when connectivity is restored.

## Security

- All inter-service HTTP calls are authenticated with short-lived service JWTs
- Secrets are stored in AWS Secrets Manager and injected as Kubernetes secrets
- Database connections use SSL in production
- All API routes are rate-limited (100 req/15min by default)
- Webhook payloads are signed with HMAC-SHA256 (`sha256=<hex>`)
- Passwords are hashed with bcrypt (12 rounds)
- PINs are hashed with bcrypt (10 rounds)
