# Good Table — Sprint 1 System Specification

**CPE334 Lab 6 · Product Team TH-048 · Bilingual reference / เอกสารอ้างอิงสองภาษา**
**Baseline:** Sprint 1 implementation on `main`; corrected code commit `ab3e0cc1990d1bb4bfdd841fabbd9d3cfab84e95`.

This document consolidates the implemented Sprint 1 requirements and API/data contracts. Feature-level details remain in `docs/sprints/sprint-1/`. If a brief statement here conflicts with a feature contract or implementation, reconcile the source artifacts before using this document as an acceptance baseline.

## 1. Scope and actors / ขอบเขตและผู้ใช้งาน

Sprint 1 provides a public food catalog, authenticated customer orders, transactional stock and price handling, Admin order management, and account login/logout. Real payment processing, account self-registration, refunds, supplier tools, and advanced inventory are out of scope.

| Actor | Sprint 1 permissions |
|---|---|
| Guest | Browse active products; sign in. |
| `CUSTOMER` | Browse products, place an order, list own orders, and view only own order details. |
| `ADMIN` | Browse products, list all orders, and update order status through the supported state machine. |

**Role baseline:** Prisma `Role` enum contains only `CUSTOMER` and `ADMIN`. `STAFF` is not implemented; store operators requiring admin operations must be assigned `ADMIN` for this release.

## 2. Functional requirements / ข้อกำหนดด้านหน้าที่

| ID | Requirement |
|---|---|
| **FR-01 — Product Catalog Browsing** | Public users can browse active products with current name, description, category, price, and stock availability; inactive products are not exposed. |
| **FR-02 — Customer Order Creation** | Authenticated `CUSTOMER` can submit product IDs and positive integer quantities. The server creates a `PENDING` order and returns its UUID, item snapshot, and server-calculated total. A customer can read only their own orders. |
| **FR-03 — Admin Order Status Management** | Authenticated `ADMIN` can list/filter all orders and apply only permitted status transitions. |

## 3. Business rules / กฎทางธุรกิจ

| ID | Rule |
|---|---|
| **BR-01 — Stock validation** | Quantity must be a positive integer and cannot exceed available stock at transaction time. Rejected requests do not change stock or create partial orders. |
| **BR-02 — Authoritative pricing** | Product price is read from the database. `OrderItem.unitPrice` is a snapshot; the server calculates `totalAmount` with decimal arithmetic. Client-supplied price/total fields are rejected. |
| **BR-03 — Status transition constraint** | Only the transitions in F-04 are allowed. `COMPLETED` and `CANCELLED` are terminal. Each accepted status change and history record commit atomically. |

## 4. Non-functional requirements / ข้อกำหนดคุณภาพ

| ID | Requirement |
|---|---|
| **NFR-01 — Security and data isolation** | JWT is carried in an `httpOnly` cookie. Server middleware enforces authentication, role authorization, and order ownership. Unauthenticated requests receive 401; authenticated role/ownership violations receive 403 (or documented non-disclosing 404 where applicable). |
| **NFR-02 — Transactional integrity** | Order creation, stock deduction, order items, and total calculation use a database transaction; failure rolls back the whole operation and concurrent requests cannot oversell stock. |

## 5. API contracts / สัญญา API

All application API responses use the standard `{ success, data }` envelope on success and `{ success: false, error: { code, message, ... } }` for errors unless the endpoint returns `204 No Content`.

| Method and path | Access | Contract summary |
|---|---|---|
| `GET /api/products` | Public | Product list, search/filter/pagination. Alias: `GET /api/v1/products`. |
| `GET /api/v1/products/:id` | Public | Active product detail; missing/inactive ID returns 404. |
| `POST /api/orders` | `CUSTOMER` | Request `{ items: [{ productId, quantity }] }`; success `201`, `PENDING`, UUID `id`, item price snapshots, and server total. Reject invalid input, client pricing, insufficient stock, and non-Customer access. |
| `GET /api/orders` | `CUSTOMER` / `ADMIN` | Customer receives own orders; Admin receives all orders. |
| `GET /api/orders/:id` | `CUSTOMER` / `ADMIN` | Customer may view own order only; Admin may view any order. |
| `GET /api/v1/admin/orders` | `ADMIN` | Lists all orders; accepts a valid `status` filter. |
| `PATCH /api/v1/admin/orders/:id/status` | `ADMIN` | Request `{ status }`; validates the state machine and records status history atomically. The unversioned `/api/admin/orders` is not mounted in the Sprint 1 server. |
| `POST /api/auth/login` | Public | Validates credentials; sets `access_token`; returns `{ id, email, name, role }` in `data`; never returns password hash. |
| `POST /api/auth/logout` | Public / idempotent | Clears the cookie and returns `204 No Content`. |
| `GET /api/auth/me` | Cookie session | Implementation extension: returns `200` with current `{ id, email, name, role }` in `data`; missing/invalid/deleted-user session returns `401 UNAUTHENTICATED`. |
| `GET /api/health` | Public | Liveness response `{ status: "ok" }`. It does not currently provide a commit SHA or database readiness result. |
| `GET /api/ready` | Public | Database readiness probe; returns `{ status: "ready", db: "connected" }` when the database check succeeds and HTTP 503 with `db: "disconnected"` when it fails. |

### Order ID format / รูปแบบ Order ID

Prisma stores `Order.id` as a `String` with `@default(uuid())`. An ID such as `a31e74a0-d5ce-40fd-9b97-5305c17cf298` has valid UUID v4 format and satisfies the Order ID requirement. It is an example only, not a record that should be created in production.

### Authentication cookie

The `access_token` cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production. Express trusts one proxy hop for Cloud Run HTTPS termination. JWT signing uses `JWT_SECRET` from environment/secret injection; the token carries the user ID and role.

## 6. Data model summary / สรุปแบบจำลองข้อมูล

| Prisma model | Main fields and relationships |
|---|---|
| `User` | UUID `id`, unique `email`, `passwordHash`, `name`, `Role`, timestamps; owns orders and status changes. |
| `Category` | UUID `id`, unique `name`; has products. |
| `Product` | UUID `id`, name/description, `Decimal(10,2)` price, integer stock, active flag, optional category and image. |
| `Order` | UUID `id`, owner `userId`, `Decimal(10,2)` total, `OrderStatus` defaulting to `PENDING`, timestamps, items/history. |
| `OrderItem` | UUID `id`, order/product foreign keys, integer quantity, decimal unit-price snapshot. |
| `OrderStatusHistory` | UUID `id`, order, optional prior status/actor, new status, timestamp. |

Prisma `OrderStatus` includes `PENDING`, `CONFIRMED`, `PREPARING`, `READY`, `COMPLETED`, `CANCELLED`, `PAID`, and `SHIPPED`. The admin API constrains legal transitions; the enum alone does not authorize a transition.

## 7. Security and configuration notes / หมายเหตุความปลอดภัย

- Never commit real account passwords, JWT secrets, database credentials, cookies, or tokens. Inject production credentials through GCP Secret Manager and environment mappings.
- `ADMIN_PASSWORD` is required for production seeding. When `SEED_DEMO_DATA=true`, both `DEMO_USER_PASSWORD` and `DEMO_USER_B_PASSWORD` are required as well. Production seed must fail closed if required variables are missing.
- Do not paste test credential values into this specification or the PDF. Distribute approved test credentials through the private handoff channel only.
- Local/demo seed fallback values are development conveniences and are not production credentials; production configuration validation must prevent using them.

## 8. Source references / เอกสารต้นทาง

- `docs/srs.md`, `docs/traceability.md`
- `docs/sprints/sprint-1/f-01-contract.md` through `f-05-contract.md`
- `server/prisma/schema.prisma`, server route files, and automated tests under `tests/`
