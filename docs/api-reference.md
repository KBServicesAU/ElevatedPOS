# NEXUS API Reference

Base URL: `https://api.nexuspos.app/api/v1`

All endpoints require a Bearer token in the `Authorization` header:
```
Authorization: Bearer <jwt>
```

All responses follow RFC 7807 Problem Details for errors and use JSON.

---

## Authentication — `/auth`

### POST `/auth/login`
Authenticate with email + password.

**Request body:**
```json
{ "email": "owner@store.com", "password": "secret" }
```
**Response 200:**
```json
{ "data": { "accessToken": "eyJ...", "refreshToken": "eyJ...", "employee": { "id": "uuid", "name": "Jane", "role": "owner" } } }
```

### POST `/auth/login/pin`
Authenticate with employee PIN (POS-optimised).

**Request body:**
```json
{ "orgId": "uuid", "pin": "1234" }
```

### POST `/auth/refresh`
Exchange a refresh token for a new access token.

### POST `/auth/logout`
Invalidate the current refresh token.

### GET `/auth/employees`
List all employees for the authenticated org.

### POST `/auth/employees`
Create a new employee.

**Request body:**
```json
{
  "name": "John Smith",
  "email": "john@store.com",
  "role": "cashier",
  "pin": "5678",
  "locationIds": ["uuid"]
}
```

### GET `/auth/employees/:id`
### PUT `/auth/employees/:id`
### DELETE `/auth/employees/:id`

---

## Catalog — `/catalog`

### Products

| Method | Path | Description |
|--------|------|-------------|
| GET | `/catalog/products` | List products (supports `?search=`, `?category=`, `?page=`) |
| POST | `/catalog/products` | Create product |
| GET | `/catalog/products/:id` | Get product |
| PUT | `/catalog/products/:id` | Update product |
| DELETE | `/catalog/products/:id` | Delete product |
| GET | `/catalog/products/barcode/:barcode` | Look up by barcode |

**Product object:**
```json
{
  "id": "uuid",
  "name": "Flat White",
  "sku": "COFFEE-FW",
  "productType": "standard",
  "basePrice": "4.5000",
  "barcodes": [],
  "tags": ["coffee", "hot"],
  "trackStock": true,
  "isActive": true,
  "isSoldInstore": true,
  "isSoldOnline": false
}
```

### Categories

| Method | Path | Description |
|--------|------|-------------|
| GET | `/catalog/categories` | List categories (tree) |
| POST | `/catalog/categories` | Create category |
| GET | `/catalog/categories/:id` | Get category |
| PUT | `/catalog/categories/:id` | Update category |
| DELETE | `/catalog/categories/:id` | Delete category |

### Price Lists

| Method | Path | Description |
|--------|------|-------------|
| GET | `/catalog/price-lists` | List price lists |
| POST | `/catalog/price-lists` | Create price list |
| GET | `/catalog/price-lists/:id` | Get price list with entries |
| PUT | `/catalog/price-lists/:id` | Update price list |
| DELETE | `/catalog/price-lists/:id` | Delete price list |
| POST | `/catalog/price-lists/:id/entries` | Add entry |

### Modifiers

| Method | Path | Description |
|--------|------|-------------|
| GET | `/catalog/modifier-groups` | List modifier groups |
| POST | `/catalog/modifier-groups` | Create modifier group |
| PUT | `/catalog/modifier-groups/:id` | Update group |
| DELETE | `/catalog/modifier-groups/:id` | Delete group |

---

## Inventory — `/inventory`

### Stock

| Method | Path | Description |
|--------|------|-------------|
| GET | `/inventory/stock` | List stock levels (`?location=`, `?product=`) |
| GET | `/inventory/stock/:productId` | Get stock for a product across all locations |
| POST | `/inventory/adjustments` | Create a stock adjustment |

**Stock adjustment:**
```json
{
  "locationId": "uuid",
  "productId": "uuid",
  "quantityDelta": -2,
  "reason": "shrinkage",
  "notes": "Damaged in storage"
}
```

### Purchase Orders

| Method | Path | Description |
|--------|------|-------------|
| GET | `/inventory/purchase-orders` | List POs |
| POST | `/inventory/purchase-orders` | Create PO |
| GET | `/inventory/purchase-orders/:id` | Get PO |
| PUT | `/inventory/purchase-orders/:id` | Update PO |
| POST | `/inventory/purchase-orders/:id/receive` | Mark as received |

### Stock Transfers

| Method | Path | Description |
|--------|------|-------------|
| GET | `/inventory/transfers` | List transfers |
| POST | `/inventory/transfers` | Create transfer |
| POST | `/inventory/transfers/:id/confirm` | Confirm receipt |

---

## Orders — `/orders`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/orders` | List orders (`?status=`, `?location=`, `?from=`, `?to=`) |
| POST | `/orders` | Create order |
| GET | `/orders/:id` | Get order |
| PUT | `/orders/:id/status` | Update order status |
| POST | `/orders/:id/refund` | Issue refund |

**Order statuses:** `pending` → `confirmed` → `preparing` → `ready` → `completed` / `cancelled`

**Create order body:**
```json
{
  "locationId": "uuid",
  "orderType": "dine_in",
  "channel": "pos",
  "customerId": "uuid",
  "tableNumber": "12",
  "lines": [
    {
      "productId": "uuid",
      "quantity": 2,
      "unitPrice": "4.50",
      "modifiers": []
    }
  ]
}
```

---

## Payments — `/payments`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/payments` | Initiate payment |
| GET | `/payments/:id` | Get payment status |
| POST | `/payments/:id/capture` | Capture pre-authorised payment |
| POST | `/payments/:id/refund` | Refund payment |

**Payment methods:** `card`, `cash`, `afterpay`, `alipay`, `wechat_pay`, `store_credit`, `gift_card`

---

## Customers — `/customers`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/customers` | List customers (`?search=`, `?page=`) |
| POST | `/customers` | Create customer |
| GET | `/customers/:id` | Get customer |
| PUT | `/customers/:id` | Update customer |
| DELETE | `/customers/:id` | GDPR delete (anonymise) |
| GET | `/customers/:id/orders` | Customer order history |
| GET | `/customers/:id/store-credit` | Store credit balance |
| POST | `/customers/:id/store-credit/adjust` | Adjust store credit |

---

## Loyalty — `/loyalty`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/loyalty/programs` | List loyalty programs |
| POST | `/loyalty/programs` | Create program |
| GET | `/loyalty/accounts/:customerId` | Get customer loyalty account |
| POST | `/loyalty/accounts/:id/earn` | Award points (idempotent) |
| POST | `/loyalty/accounts/:id/redeem` | Redeem points |
| GET | `/loyalty/accounts/:id/transactions` | Transaction history |

**Earn request (idempotent via `idempotencyKey`):**
```json
{
  "orderId": "uuid",
  "points": 45,
  "idempotencyKey": "order_uuid_earn"
}
```

---

## Integrations — `/integrations`

### Webhooks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/integrations/webhooks` | List webhooks |
| POST | `/integrations/webhooks` | Create webhook |
| GET | `/integrations/webhooks/:id` | Get webhook |
| PUT | `/integrations/webhooks/:id` | Update webhook |
| DELETE | `/integrations/webhooks/:id` | Delete webhook |
| POST | `/integrations/webhooks/:id/test` | Send test ping |
| GET | `/integrations/webhooks/:id/deliveries` | Last 50 delivery attempts |

**Available webhook events:**
`order.created`, `order.completed`, `order.cancelled`, `order.refunded`,
`payment.captured`, `payment.failed`, `payment.refunded`,
`customer.created`, `customer.updated`,
`product.created`, `product.updated`, `product.deleted`,
`inventory.low_stock`, `inventory.out_of_stock`, `inventory.adjusted`,
`loyalty.points_earned`, `loyalty.points_redeemed`, `loyalty.tier_changed`

**Webhook signature verification:**
```
X-Nexus-Signature: sha256=<hmac-sha256-hex>
X-Nexus-Timestamp: <unix-epoch-ms>
```

### Marketplace Apps

| Method | Path | Description |
|--------|------|-------------|
| GET | `/integrations/apps` | List marketplace apps |
| GET | `/integrations/apps/:id` | Get app detail |
| POST | `/integrations/apps/:id/install` | Install app |
| DELETE | `/integrations/apps/:id/uninstall` | Uninstall app |

---

## AI — `/ai`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/ai/chat` | Send message to AI copilot (streaming SSE) |
| POST | `/ai/insights` | Generate business insights report |
| POST | `/ai/predict/demand` | Demand forecasting for products |

**Chat request:**
```json
{
  "message": "What were my top 5 selling products last week?",
  "context": { "locationId": "uuid" }
}
```

---

## Error Format

All errors follow RFC 7807:
```json
{
  "type": "https://nexuspos.app/errors/validation",
  "title": "Validation Error",
  "status": 422,
  "detail": "sku: Required"
}
```

**Common status codes:**
- `400` Bad Request
- `401` Unauthorized (missing/invalid token)
- `403` Forbidden (insufficient role)
- `404` Not Found
- `409` Conflict (duplicate key)
- `422` Unprocessable Entity (validation failed)
- `429` Too Many Requests (rate limited)
- `500` Internal Server Error
