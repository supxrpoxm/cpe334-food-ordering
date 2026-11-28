# Good Table — Sprint 1 UI Specification

**CPE334 Lab 6 · Product Team TH-048 · Thai/English UI contract**

## 1. Frontend routes / เส้นทางหน้าจอ

| Route | Purpose and access behavior |
|---|---|
| `/products` | Public catalog for guests and signed-in users; renders active product name, current price and stock. |
| `/order` | Checkout form; the server requires an authenticated `CUSTOMER`. A 401 during submit redirects to `/login`; a stock conflict preserves selection and refreshes product data. |
| `/orders/[id]` | Order confirmation/detail. Loads order through `GET /api/orders/:id`; server ownership checks limit Customers to their own order, while Admin may access any order via the API. |
| `/admin/orders` | Admin order listing and status controls. The backend API enforces `ADMIN`; hiding a link is not an authorization control. |
| `/login` | Email/password sign-in form; no self-registration or password reset in Sprint 1. |

## 2. Good Table navigation states / สถานะของแถบนำทาง

The client header reads `GET /api/auth/me` after load and listens for login/logout state changes. The API uses the HttpOnly cookie; JavaScript never reads the JWT itself. While the initial request is pending, the header may briefly render its signed-out state.

| Session state | User identity | Visible links/actions |
|---|---|---|
| Logged out | None | `Menu` → `/products`; `Place an order` → `/order`; `Sign in` → `/login`. Hide `Manage orders` and `Sign out`. |
| `CUSTOMER` | Display `{name} · CUSTOMER` | `Menu`; `Place an order`; `Sign out`. Hide `Sign in` and `Manage orders`. |
| `ADMIN` | Display `{name} · ADMIN` | `Menu`; `Manage orders` → `/admin/orders`; `Sign out`. Hide `Sign in` and `Place an order`. |

**Sign out:** call `POST /api/auth/logout`; on success clear client auth state, refresh the header/router, and redirect to `/login`. On failure, retain the signed-in view and show an accessible error.

## 3. Checkout and confirmation / ขั้นตอนยืนยันคำสั่งซื้อ

1. Show product, server catalog price, available stock, and quantity fields. A client-estimated subtotal is only a preview.
2. Disable submit while the request is pending; submit only product IDs and quantities.
3. On success, read Order ID using `result.data?.id ?? result.id ?? result.orderId`. Render the order confirmation/detail at `/orders/[id]` from the server response, showing the full UUID Order ID, actual status (new orders are `PENDING`), and server-calculated total.
4. `GET /api/orders/:id` is authoritative for the confirmation page. A customer attempting another customer's ID sees the API denial, with no protected order details.
5. On `409 INSUFFICIENT_STOCK`, show the error, refresh catalog stock, and preserve selected quantities. On 401 redirect to login; on 403 show an authorization message.

## 4. Accessibility and interaction notes / การเข้าถึงและการโต้ตอบ

- Use semantic navigation (`aria-label="Main navigation"`), headings, labels connected to inputs, visible focus, and accessible status/error announcements.
- Keep role identity text readable beside navigation. Role-aware link visibility improves UX but does not replace server RBAC.
- Do not show cookies, tokens, password hashes, or credential values in UI, logs, or screenshots.

## 5. Implementation references

`client/app/layout.tsx`, `client/app/auth-header.tsx`, `client/app/auth-state.ts`, `client/app/login/page.tsx`, `client/app/logout-button.tsx`, `client/app/order/page.tsx`, `client/app/orders/[id]/page.tsx`, `client/app/admin/orders/page.tsx`.
