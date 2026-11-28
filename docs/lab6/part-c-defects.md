# CPE334 Lab 6 Part C — Defect Reporting & Triage

**รายงาน defect และการคัดแยกผล UAT / Defect reporting and triage**

**Product Team:** `TH-048` · **Partner UAT Team:** `TH-040 Pun&Ice`
**Corrected code commit:** `ab3e0cc1990d1bb4bfdd841fabbd9d3cfab84e95`

> **Credential safety / ความปลอดภัย:** No passwords, cookies, tokens, or secret values belong in this report or its evidence. The product team reported Secret Manager synchronization and successful migration/seed execution; do not copy account credentials into this file or the PDF.

## 1. Outbound Finding Reported to Partner Team (`TH-040 Pun&Ice`)

| Finding ID | GitHub Issue URL | Linked Case & AC | Tested Commit | Summary of Finding | Partner Triage Classification & Rationale | UAT Retest & Final Issue Status |
|---|---|---|---|---|---|---|
| `DEF-OUT-01` | [Issue #48](https://github.com/Davidice23/event-registration-attendance/issues/48) | `UAT-04` Step 5 (`NFR-01`; `AC-01`, `AC-03`, `AC-07`, `AC-11`) | `b56826459da848342028a5b93e885f9cceaa3dcd` | Initial unauthenticated request to `/api/my/registrations` returned `NOT_FOUND` (`EVID-B-04-api`). | **not-defect** — TH-040 identified the accidental Markdown-link suffix `](https://...)` in the browser address bar. The clean URL returned `401 UNAUTHENTICATED`; no application code change was needed. | Clean URL retested `27 Nov 2026, 22:00 GMT+7` in a fresh Incognito session (`EVID-B-04-retest`); `UAT-04` is PASS. Issue #48 closed as not-defect. |

Evidence: [initial malformed URL](../evidence/part-b/EVID-B-04-api.png), [clean URL retest](../evidence/part-b/EVID-B-04-retest.png), and [Part B execution record](part-b-execution.md).

## 2. Inbound Findings Reported by Partner Team (`supxrpoxm/cpe334-food-ordering`)

| Issue # & URL | Reported Case / AC | Triage Classification | Root Cause / Rationale | Action Taken (Fix Commit or Explanation) | Retest Status |
|---|---|---|---|---|---|
| [Issue #23](https://github.com/supxrpoxm/cpe334-food-ordering/issues/23) | `UAT-01` Step 4; F-02 contract (confirmation/redirect) | **defect — Minor** | `POST /api/orders` returns the created ID as `data.id`, but `client/app/order/page.tsx` read `result.orderId`. The UI therefore displayed `Order number undefined`, omitted the required status, and did not navigate to a detail/confirmation page. | Commit `ab3e0cc1990d1bb4bfdd841fabbd9d3cfab84e95` reads `result.data?.id ?? result.id ?? result.orderId` and navigates to `/orders/[id]`. The detail page loads the server-owned order and displays the full UUID, actual status (`PENDING` for a new order), and server total; `GET /api/orders/:id` enforces owner access. | **Ready for partner retest on updated Cloud Run revision.** Record the active revision/digest and independent retest evidence before closure. |
| [Issue #24](https://github.com/supxrpoxm/cpe334-food-ordering/issues/24) | `UAT-03` Steps 1–4 and `UAT-05` Steps 1–5; F-05 contract | **defect — Major** | `prisma.user.upsert` in `server/prisma/seed.ts` used `update: {}`, so rerunning seed did not refresh an existing account's `passwordHash`, `name`, or `role`. The header also lacked live session awareness after reload/login/logout. | Commit `ab3e0cc1990d1bb4bfdd841fabbd9d3cfab84e95` updates `passwordHash`, `name`, and `role` in the seed upsert; adds `GET /api/auth/me` and `app.set('trust proxy', 1)`; and implements a role-aware navigation/auth-state refresh and logout redirect. Product Team reported synchronizing the Secret Manager credential mappings and rerunning `food-ordering-migrate`; the seed log was reported as ensuring 7 menu items and 3 accounts, with `customer-b@example.com` login verified. No password value is recorded here. | **Ready for partner retest on updated Cloud Run revision.** Attach exact revision/image digest and independent test evidence. Do not close until Customer/ Admin navigation, login/logout, seeded login, and role boundaries are retested. |

## 3. Triage and closure summary / สรุปผลการคัดแยก

- Outbound: `1` finding — Issue #48 classified **not-defect**, clean-URL retest PASS, closed by partner team.
- Inbound: `2` accepted defects — Issue #23 **Minor**, Issue #24 **Major**; both fixes are in commit `ab3e0cc1990d1bb4bfdd841fabbd9d3cfab84e95` and were reported deployed.
- Seed/deployment evidence reported for Issue #24: migration/seed Job ensured 7 menu items and 3 accounts; Customer B login was verified. Keep the actual log/screenshot attached in the final PDF if available.
- Independent partner retest for Issues #23 and #24 remains outstanding. Capture Cloud Run active revision and image digest before the partner retests; do not mark these issues closed based only on code changes.
- No credentials or secret values are included in this report.
