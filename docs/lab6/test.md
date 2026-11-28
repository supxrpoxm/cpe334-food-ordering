# Good Table — Sprint 1 Test Strategy and Lab 6 Checklist

**CPE334 Lab 6 · Product Team TH-048 · Test strategy / แนวทางทดสอบ**

## 1. Test levels and execution / ระดับและวิธีรันทดสอบ

| Level | Scope | Repository suite |
|---|---|---|
| Unit/service and integration | Pricing, stock invariants, transactions, API validation, auth, RBAC, order ownership, and admin transitions against PostgreSQL. | Root Vitest suite (`npm test`) with `tests/support/global-setup.ts`; Docker Compose provides the local PostgreSQL service. CI runs backend tests with its PostgreSQL service. |
| Client build/type validation | Next.js route compilation and client type checking. This is not a browser E2E assertion suite. | `npm --prefix client run build`; root TypeScript check is `npm run typecheck`. |
| Deployment smoke/stub tests | Public service smoke checks and deployment/release scripts without modifying live resources. | `deploy/tests/test_smoke.py`, `deploy/tests/test_deploy_stub.sh`, `deploy/tests/test_release_stub.sh`; deploy workflow runs its configured smoke check. |
| Independent UAT | Human partner executes the published cases against the exact deployment, records actual observations and evidence, and makes the acceptance decision. | `docs/lab6/lab-6-uat-pack.md` and `docs/lab6/part-b-execution.md`. |

No Playwright configuration or browser E2E suite is currently present in this repository. Do not describe the frontend production build as E2E coverage. A failed local test bootstrap caused by unavailable Docker/PostgreSQL is an environment-blocked run, not a passing test result.

## 2. Acceptance criteria mapping / ตารางเชื่อมโยงเกณฑ์รับงาน

| Feature | Acceptance scope | Automated coverage |
|---|---|---|
| **F-01 / FR-01** Product Catalog | Public active catalog, search/filter, detail and empty/not-found boundaries. | `tests/f01-product-catalog.test.ts` |
| **F-02 / FR-02** Customer Order Placement | Valid order, response UUID/status/total, validation, authorization and ownership. | `tests/f02-order-placement.test.ts` |
| **F-03 / BR-01, BR-02, NFR-02** Stock & Pricing Engine | Positive/in-stock quantities, server price snapshot, decimal totals, no overselling, all-or-nothing rollback and concurrent stock boundary. | `tests/f03-stock-pricing-engine.test.ts`; related order API integration cases in `tests/f02-order-placement.test.ts` |
| **F-04 / FR-03, BR-03** Admin Status Management | Admin list/filter, allowed transitions, terminal state rejection, transactionally recorded history. | `tests/f04-admin-order-status.test.ts` |
| **F-05 / NFR-01** Auth/RBAC | Login/logout cookie, generic credential errors, role boundaries, customer ownership isolation and protected endpoints. | `tests/f05-auth-rbac.test.ts` plus authorization cases in F-02/F-04 suites |

## 3. Lab 6 execution checklist / เช็กลิสต์การทดสอบ

### Before test

- [ ] Confirm the tested repository, branch/commit, Cloud Run service, region, active revision and image digest. Stop if release identity is unknown or mismatched.
- [ ] Confirm `/api/health` and database readiness independently; record exact actual output and timestamp.
- [ ] Confirm seeded synthetic accounts and roles with the Product Team. Obtain credentials privately; never write them into Markdown, screenshots, issues, or PDF.
- [ ] Prepare isolated browser sessions for Guest, Customer A, Customer B, and Admin. Ensure no production customer data is used.
- [ ] Record starting stock and order IDs; coordinate any reset of shared data with the Product Team.

### Execute and record

- [ ] Perform each case in `lab-6-uat-pack.md` against its preconditions; record actual behavior, timestamp, commit/revision and evidence ID.
- [ ] UAT-01: normal catalog-to-order journey; verify response ID, `PENDING`, server total and stock decrement.
- [ ] UAT-02: over-stock request; verify rejection and no partial stock/order change.
- [ ] UAT-03: role and ownership denials; verify another customer and non-admin cannot read/mutate protected resources.
- [ ] UAT-04: forged client price and invalid quantity; verify rejection and unchanged state.
- [ ] UAT-05: Admin lifecycle, persistence, invalid transition, and customer's own order view.
- [ ] For every failure, preserve exact observed message/status, safe URL, before/after state, and redacted evidence. Never fabricate a failure or mark a blocked case as pass.

### Closeout

- [ ] Triage inbound/outbound findings in `part-c-defects.md`; link issue, requirement, tested release, severity rationale, disposition and independent retest.
- [ ] Complete `part-d-signoff.md`; record the exact deployed revision/digest and human sign-off before declaring final release acceptance.
- [ ] Verify screenshot paths and readability, remove secrets/PII, and compile the approved Lab 6 artifacts into the final PDF.

## 4. Evidence and reporting rules

Evidence must support observed outcomes and be reproducible without exposing passwords, cookies, bearer tokens, password hashes, database credentials, or unrelated personal information. Separate local automated test output from cloud deployment/UAT evidence. Record blocked tests and environmental constraints accurately.
