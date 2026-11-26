# Lab 6 — Sprint 1 UAT Pack (Good Table)

This pack is the executable handoff and evidence worksheet for Lab 6. It covers the implemented Sprint 1 food ordering scope only: public catalog, customer order placement with server-side price and stock handling, order ownership, and Admin order status management. It does not assess Sprint 2/3 work.

> **Evidence integrity:** fill every `[TBD]` from the actual partner session and deployed release. Do not mark a case PASS, claim independent acceptance, invent a defect, or include passwords/tokens until the named tester has performed and recorded that work. The attached Lab 6 handout requires a real partner team to execute UAT and make the final acceptance decision.

## Release and handoff record

| Field | Record |
|---|---|
| Product / repository | Food Ordering System (Good Table) / `https://github.com/supxrpoxm/cpe334-food-ordering` |
| Product Team students / IDs | Panuwat Boonsak (ภานุวัฒน์ บุญศักดิ์), 67070501034; Rattananan Siripolwat (รัตนนันทน์ สิริพลวัฒน์), 67070501038 |
| Partner UAT Team students / IDs | [TBD] |
| Sprint 1 tested release | Release 2, `main` commit `3e1b192e0f41bd7157cb5fc4c6e686995d60a1dc`; Lab 5 evidence does not state a separate Sprint 1 tag |
| Deployment evidence | Deploy run `44583799206`; image `asia-southeast1-docker.pkg.dev/cpe334-th-048-p4/food-ordering/food-ordering@sha256:52d603df80614b81a8ed4b64434432f57b3944bc8bdf02c66a7f8abcea628bdd` |
| Cloud Run service / project / region | `food-ordering` / `cpe334-th-048-p4` / `asia-southeast1` |
| Cloud Run revision receiving traffic | Confirm from Cloud Run before UAT; the Lab 5 PDF does not record the revision name or traffic percentage |
| UAT base URL | `https://food-ordering-905668196750.asia-southeast1.run.app` |
| Readiness endpoints | `/api/health` → `{"status":"ok"}`; `/api/ready` → `{"status":"ready","db":"connected"}` when ready. Neither returns a commit SHA. |
| Scope accepted for testing | F-01 through F-05 as implemented and contracted for Sprint 1; see `docs/sprints/sprint-1/` |
| Known scope exclusions | Real payment gateway, persistent cart, supplier/advanced inventory, refunds/returns, analytics, cloud/container enhancements |
| Handoff contact/channel and date | [TBD] |
| Credentials handoff | Send privately to partner; do not put secret values in this file/PDF/Git |

### Release identity and readiness evidence

The Lab 5 PDF records deploy run `44583799206`, the commit and full image digest above, plus a screenshot of the live Release 2 page. It does not show the Cloud Run revision receiving traffic or prove the traffic percentage is 100%. Before UAT, a project owner with Cloud Run access should capture this read-only output:

```sh
gcloud run services describe food-ordering \
  --project=cpe334-th-048-p4 --region=asia-southeast1 \
  --format='yaml(status.traffic)'

gcloud run revisions describe REVISION_FROM_TRAFFIC_OUTPUT \
  --project=cpe334-th-048-p4 --region=asia-southeast1 \
  --format='value(status.imageDigest)'
```

Attach the output or a Cloud Run screenshot proving the selected revision receives 100% traffic and its image digest matches the digest above. If traffic is split, the digest differs, or the revision cannot be confirmed, pause UAT until the Product Team resolves release identity.

The observed `/api/ready` response uses the key `db`, not `database`. A 200 response with `status: ready` and `db: connected` confirms application and database readiness; the `database` spelling in the Lab 5 PDF is a documentation mismatch. This readiness result does not independently verify the deployed commit or image.

### Safe account and data setup

Use synthetic test accounts only. The seed defines `customer@example.com` (CUSTOMER) and `admin@example.com` (ADMIN); production/demo credentials must be supplied through the approved private course handoff and must never be copied here. The product seed includes Grilled Chicken Rice Bowl (฿89.00, stock 18), Basil Pork Rice (฿79.00, stock 12), and Crispy Tofu Rice Bowl (฿75.00, stock 0). Confirm actual values on the tested deployment before execution because orders decrement stock.

Only one CUSTOMER and one ADMIN account are recorded in the Lab 5 handoff. The application has no self-registration flow. Before UAT-03, the Product Team must provision a second synthetic CUSTOMER account labelled **Customer B** using an approved access-controlled procedure, then send its credentials privately. Do not use an Admin account as Customer B or share Customer A's password. Until provisioned, mark Customer-to-Customer ownership testing BLOCKED; do not claim it passed.

Before each run, record starting stock and order IDs. Cases UAT-01 through UAT-05 are designed to run in order on a disposable/test deployment. Restore seeded product stock and clear only the synthetic orders created by this run using the approved environment procedure before a rerun. Do not reset or modify a shared/live assessed environment without the Product Team's coordination. Logout and clear browser session after each role switch.

## Part A — Product Team cases and handoff

For each case record actual outcome in Part B. Execute via the deployed user interface except where a case explicitly gives an API request; browser developer tools/API calls are allowed for the stated security boundary checks. Replace `BASE_URL` with the handoff URL. Expected HTTP error codes are part of the result.

### UAT-01 — Public catalog and normal order journey

- **References:** FR-01, FR-02, BR-02; F-01 AC-F01-01, F-02 AC-F02-01; F-03 stock/pricing contract; F-05 authentication contract.
- **Purpose / role:** verify a guest can inspect the live catalog and a CUSTOMER can place a normal order.
- **Preconditions:** seeded products active; Customer A credentials available; record Grilled Chicken Rice Bowl stock as `S` (expected seed `18`).
- **Input:** Grilled Chicken Rice Bowl x 2; server catalog price expected ฿89.00 each.
- **Steps:**
  1. Open `BASE_URL/products` in a fresh signed-out browser.
  2. Confirm Grilled Chicken Rice Bowl shows ฿89.00 and available stock; confirm Crispy Tofu Rice Bowl is marked Out of stock.
  3. Open `BASE_URL/order`, select quantity 2 for Grilled Chicken Rice Bowl, and submit while signed out. Record the observed result.
  4. Sign in as Customer A, repeat the order once, and record the order number, status, total, and displayed result.
  5. Refresh the catalog and record the new stock.
- **Expected:** catalog is public; out-of-stock item is visibly unavailable. Unauthenticated order is rejected with an authentication error and creates no order. Authenticated order succeeds, is PENDING, server total is ฿178.00 (2 x ฿89.00), and stock becomes `S - 2` (expected 16 from seed).

### UAT-02 — Stock boundary and rollback

- **References:** BR-01, NFR-02; F-02/F-03 stock validation and transactional acceptance criteria.
- **Purpose / role:** verify over-stock checkout is rejected without partial writes; CUSTOMER.
- **Preconditions:** run after UAT-01 or restore a known stock value `S`; choose Basil Pork Rice and record actual stock.
- **Input:** quantity = actual stock + 1. For untouched seed stock 12, request 13.
- **Steps:**
  1. Sign in as Customer A and open the order form.
  2. Attempt to order one more Basil Pork Rice than the recorded available stock. If the UI max prevents entry, document that and submit the equivalent request from browser developer tools to `POST BASE_URL/api/orders` with JSON `{"items":[{"productId":"4ddaa64a-f1b9-4de8-8ed1-5330ae340102","quantity":13}]}` (adjust quantity to `S+1`). Use the signed-in browser cookie; do not copy its value into evidence.
  3. Refresh catalog and inspect Admin order list (with Product Team support if needed) to verify no order was created and stock is unchanged.
- **Expected:** HTTP 409 `INSUFFICIENT_STOCK`; no new order and stock remains exactly `S`. A failure must not decrement any other item in a multi-item order.

### UAT-03 — Role and ownership restrictions

- **References:** NFR-01; F-02/F-05 authorization and data-isolation criteria; System SDS access matrix.
- **Purpose / role:** confirm Admin cannot place customer orders, Customer B cannot see Customer A's order, and Customer cannot use Admin order APIs.
- **Preconditions:** UAT-01 created an order owned by Customer A; Customer B and Admin accounts available. Record Customer A's order ID privately in run notes.
- **Input:** valid one-item order request; Customer A order ID; Admin orders endpoint.
- **Steps:**
  1. Sign in as Admin and attempt `POST BASE_URL/api/orders` with a valid seeded product ID and quantity 1.
  2. Sign in as Customer B and request `GET BASE_URL/api/orders/{Customer-A-order-ID}`; also open `BASE_URL/admin/orders`.
  3. While signed in as Customer B, request `GET BASE_URL/api/v1/admin/orders` and `PATCH BASE_URL/api/v1/admin/orders/{Customer-A-order-ID}/status` with `{"status":"PAID"}`.
  4. Sign in as Customer A and confirm the original order still exists with its original status and details.
- **Expected:** Admin order creation is 403 `FORBIDDEN_ROLE`; Customer B receives 403 `FORBIDDEN_RESOURCE` or the contract's documented non-disclosing denial for another user's order; customer access to Admin endpoints is 403. Rejected attempts do not change order, status, or stock and reveal no protected order details. Record exact actual codes and any contract mismatch.

### UAT-04 — Price integrity and invalid quantity

- **References:** BR-01, BR-02; F-02/F-03 acceptance criteria.
- **Purpose / role:** verify server controls price and rejects invalid quantities; CUSTOMER.
- **Preconditions:** signed-in Customer A; record current stock/price for Grilled Chicken Rice Bowl.
- **Input:** quantity 1 with forged `unitPrice: "0.01"`; then quantity 0.
- **Steps:**
  1. From browser developer tools send `POST BASE_URL/api/orders` with `{"items":[{"productId":"4ddaa64a-f1b9-4de8-8ed1-5330ae340101","quantity":1,"unitPrice":"0.01"}]}`.
  2. Send the same endpoint with `{"items":[{"productId":"4ddaa64a-f1b9-4de8-8ed1-5330ae340101","quantity":0}]}`.
  3. Refresh catalog and inspect orders to confirm both failed calls left stock and order history unchanged.
- **Expected:** forged price rejected with 400 `CLIENT_PRICE_NOT_ALLOWED`; zero quantity rejected with 400 `VALIDATION_ERROR`; no order or stock change.

### UAT-05 — Admin lifecycle and persistence

- **References:** FR-03, BR-03; F-04 status management and F-05 RBAC.
- **Purpose / role:** verify Admin can review orders and make only permitted transitions; status persists across reload.
- **Preconditions:** a PENDING order from UAT-01; Admin credentials.
- **Input:** target order ID; transitions PENDING -> PAID -> SHIPPED.
- **Steps:**
  1. Sign in as Admin and open `BASE_URL/admin/orders`; locate the recorded order and confirm PENDING.
  2. Change status to PAID; reload the page and confirm PAID remains.
  3. Change status to SHIPPED; reload and confirm SHIPPED remains.
  4. Attempt a forbidden transition (e.g. SHIPPED -> PAID) through `PATCH BASE_URL/api/v1/admin/orders/{id}/status` with `{"status":"PAID"}`.
  5. Sign in as Customer A, open the customer order list at `BASE_URL/api/orders`, and confirm the same order/status is visible to its owner.
- **Expected:** Admin sees all orders; valid transitions succeed and persist; invalid transition returns 400 `INVALID_STATUS_TRANSITION` and leaves status SHIPPED. Customer sees own order only. No real payment action occurs; PAID is a mock administrative status.

## Part B — Independent execution record (UAT Team completes)

Record one row per case actually performed. Use local course time and exact deployed revision. Attach readable evidence IDs with timestamp and enough context; redact passwords, cookies, tokens, and private personal data.

| Case | Tester / team | Date and time | Release/revision | Actual result (observed, not copied from expected) | PASS / FAIL / BLOCKED | Evidence ID |
|---|---|---|---|---|---|---|
| UAT-01 | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] |
| UAT-02 | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] |
| UAT-03 | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] |
| UAT-04 | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] |
| UAT-05 | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] |

Both partner students must participate. For each case preserve the exact input, actual UI/API response, relevant before/after state, timestamp, and tested revision. A blocked case is not a pass.

## Parts C–D — Finding, resolution, and acceptance records

### Outgoing findings reported to partner (Product Team)

| Issue ID | Case / requirement | Reporter and date | Tested revision | Reproduction / expected vs actual | Severity and user impact | Evidence | Partner notified / disposition |
|---|---|---|---|---|---|---|---|
| None recorded yet | [Complete after UAT] | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] |

### Findings received about this product (triage by Product Team)

| Partner issue ID | Classification (accepted defect / duplicate / not-defect / enhancement) and contract-based reason | Severity / owner | Fix status and disposition | Red test / green test / release / independent retest evidence |
|---|---|---|---|---|
| No partner findings received yet | [TBD after partner execution; retain explicit “none” if none] | [TBD] | [TBD] | [TBD] |

Treat Critical and Major accepted defects as release blockers. Minor defects must be fixed or explicitly accepted by the independent UAT Team as known limitations. Do not reclassify failed specified behavior as an enhancement. If no legitimate defect occurs, request a controlled exercise from the instructor/TA on an isolated branch; never fabricate a finding or break the assessed release.

### Correction and independent retest ledger

| Issue | Fix branch from sprint staging | Regression test (file/name) | RED commit/output | GREEN commit/output | Peer PR review + CI | Corrected deployed revision / smoke check | Independent tester, retest result, evidence |
|---|---|---|---|---|---|---|---|
| [TBD per accepted defect or approved controlled exercise] | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] |

### Final independent Sprint 1 decision (UAT Team only)

- Decision: **[TBD — Accepted / Accepted with documented minor limitations / Not Accepted]**
- Exact release tag/commit and deployed revision: [TBD]
- UAT testers (names, team) and decision date/time: [TBD]
- Critical/Major defects open: [TBD — must be zero for acceptance]
- Required cases blocked: [TBD — must be zero for acceptance]
- Accepted minor limitations and conditions: [TBD]
- Evidence IDs / PDF pages: [TBD]
- Recorded by independent UAT Team: [names/sign-off or documented course handoff] [TBD]

## Version, contribution, AI use, and limitations

| Milestone | Tag/commit or deployed revision | Evidence |
|---|---|---|
| Sprint 1 baseline tested | [TBD] | [TBD] |
| Defective release (if applicable) | [TBD / N/A] | [TBD] |
| Regression test change | [TBD / N/A] | [TBD] |
| Corrected main release | [TBD / N/A] | [TBD] |
| Corrected deployed revision and smoke test | [TBD / N/A] | [TBD] |

| Contributor | Work performed / pair work |
|---|---|
| Student 1 [name / ID] | [TBD] |
| Student 2 [name / ID] | [TBD] |

- **AI use:** [TBD — disclose assistance used to prepare/edit this pack and any code; describe human review.] 
- **Known limitations:** [TBD — include accepted minor limitations or “none observed” only when supported by completed UAT.]
- **UAT/deployment dependencies:** [TBD — partner, deployment, credentials, controlled exercise, or TA support; include notification evidence where applicable.]

## PDF assembly checklist

- Identify both teams/students and IDs, project context, Sprint 1 scope, repository, baseline and tested release, deployed URL/revision.
- Include contents with Parts A–D, page ranges, and evidence IDs.
- Include the complete cases and actual execution records, selected readable screenshots/logs, every finding and disposition, and any accepted limitations.
- Include test command, test IDs/assertions, tested commits and actual RED/GREEN output for each corrected defect; include peer review, CI, redeployment, smoke check, and partner retest.
- Include the final independent acceptance record, contribution table, AI-use declaration, limitations, and unresolved dependencies.
- Export this completed pack together with the evidence into one self-contained PDF. Do not include credentials, cookies, tokens, or production secrets.
