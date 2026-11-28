# Feature Contract: F-04 Admin Order Status Management

## 1. Feature Design & Business Rules

- **Linked requirements:** FR-03 (primary), BR-03 (status-transition rule), NFR-01 (authorization), NFR-02 (transactional status/history update).
- **Prisma role baseline:** Sprint 1 implements only `CUSTOMER` and `ADMIN`. `STAFF` is not a supported enum value or authorized role in this release; store staff carrying out administrative tasks use an `ADMIN` account.
- **Behavior:** An authenticated Admin lists all orders, optionally filters by status, and advances an order only through an allowed state transition. Each successful change writes an `OrderStatusHistory` record in the same database transaction.
- **Allowed transitions:** `PENDING → CONFIRMED | CANCELLED | PAID`; `CONFIRMED → PREPARING | CANCELLED`; `PREPARING → READY | CANCELLED`; `READY → COMPLETED | CANCELLED`; `PAID → SHIPPED`; `SHIPPED → COMPLETED`. `COMPLETED` and `CANCELLED` are terminal states.
- **Dependencies:** F-02 Order model and F-05 authentication/authorization; Prisma and PostgreSQL.
- **Failure cases:** unauthenticated request → `401 UNAUTHORIZED`; authenticated Customer → `403 FORBIDDEN_ROLE`; unknown order → `404 ORDER_NOT_FOUND`; invalid status or transition → `400` (`VALIDATION_ERROR` or `INVALID_STATUS_TRANSITION`). Rejected transitions must not modify the order or create history.

## 2. Technical Specification

- **UI:** `/admin/orders` presents orders newest first, status, totals and allowed status choices. The UI is a convenience; the API enforces Admin authorization.
- **Implemented API:**
  - `GET /api/v1/admin/orders` — Admin only; optional `?status=<OrderStatus>` filter.
  - `PATCH /api/v1/admin/orders/:id/status` — Admin only; JSON body `{ "status": "CONFIRMED" }`.
  - The unversioned `/api/admin/orders` path is not mounted by the Sprint 1 server.
- **Successful response:** `200 OK` with `success: true` and `data` containing `orderId` (UUID), `previousStatus`, `currentStatus`, and `updatedAt`.
- **Persistence:** update `Order.status` and create `OrderStatusHistory` inside one Prisma transaction. History stores old/new status, actor user ID, and timestamp.

## 3. Acceptance Criteria

| AC ID | Observable expected outcome | Negative/boundary behavior | Role |
|---|---|---|---|
| AC-F04-01 | Admin lists all orders and may filter by a valid status. | Customer receives `403 FORBIDDEN_ROLE`; no cookie receives `401 UNAUTHORIZED`; invalid filter receives `400`. | ADMIN only |
| AC-F04-02 | Admin can make every allowed state-machine transition; response reports old/new state and history is recorded. | Skipped or otherwise disallowed transition receives `400 INVALID_STATUS_TRANSITION`; state/history remain unchanged. | ADMIN only |
| AC-F04-03 | `COMPLETED` and `CANCELLED` orders remain terminal. | Attempt to change a terminal order receives `400`; no additional history record is written. | ADMIN only |

## 4. Software Test Specification

| Test ID | AC | Level | Action | Expected result |
|---|---|---|---|---|
| STS-F04-01 | AC-F04-01 | Authorization | Customer and unauthenticated clients call `GET /api/v1/admin/orders`. | `403 FORBIDDEN_ROLE` and `401 UNAUTHORIZED`, respectively. |
| STS-F04-02 | AC-F04-02 | Integration | Admin attempts `PENDING → COMPLETED` for UUID `a31e74a0-d5ce-40fd-9b97-5305c17cf298`. | `400 INVALID_STATUS_TRANSITION`; status and history unchanged. |
| STS-F04-03 | AC-F04-03 | Integration | Admin attempts to change `CANCELLED` or `COMPLETED`. | `400`; status remains terminal. |
| STS-F04-04 | AC-F04-01/02 | Integration | Admin lists all orders, filters `CONFIRMED`, then applies the supported `PENDING → CONFIRMED → PREPARING → READY → COMPLETED` path. | Correct list/filter results; every transition succeeds and produces one history record. |

Automated coverage: `tests/f04-admin-order-status.test.ts`.

## 5. Traceability and implementation note

FR-03 maps to F-04 and AC-F04-01–03. The Sprint 1 requirement catalog defines FR-01 through FR-03 and BR-01 through BR-03; references to FR-04, BR-04, BR-05, or role `STAFF` in earlier drafts were documentation inconsistencies and are not part of this baseline.
