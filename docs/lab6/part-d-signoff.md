# CPE334 Lab 6 Part D — Summary, Release Readiness & Sign-off

**รายงานสรุปและลงนาม / Summary and sign-off**

**Product:** Good Table (Food Ordering System) · **Product Team:** `TH-048`
**Report date:** `28 Nov 2026` · **Prepared for PDF export**

> This document consolidates Part A product handoff, Part B independent UAT performed by TH-048 against partner product TH-040 Pun&Ice, and Part C inbound/outbound defect triage. Final deployment acceptance remains evidence-based: record the exact active revision and digest and obtain the partner's independent retest for Issues #23 and #24 before unconditional release sign-off.

## 1. Part A — Product and handoff metadata / ข้อมูลผลิตภัณฑ์

| Metadata | Record |
|---|---|
| Product | Good Table — Food Ordering System |
| Product Team | `TH-048` (Panuwat Boonsak / ภานุวัฒน์ บุญศักดิ์; Rattananan Siripolwat / รัตนนันทน์ สิริพลวัฒน์) |
| Product repository | [supxrpoxm/cpe334-food-ordering](https://github.com/supxrpoxm/cpe334-food-ordering) |
| UAT partner for this product | `TH-040 Pun&Ice`; contacts `Khawpun124`, `Davidice23` (confirm the named student sign-off in the handoff). |
| Partner UAT plan | [TH-040 Lab 6 Sprint 1 UAT plan](https://github.com/Davidice23/event-registration-attendance/blob/staging/docs/labs/lab-06/uat-plan.md) |
| Deployment workflow | `Deploy demo`; automatic trigger is push to `main` after its required CI job passes; manual `workflow_dispatch` is also configured. |
| Cloud Run service | `food-ordering` |
| GCP project / region | `cpe334-th-048-p4` / `asia-southeast1` |
| Application URL | `https://food-ordering-905668196750.asia-southeast1.run.app` |
| Corrected source commit | `ab3e0cc1990d1bb4bfdd841fabbd9d3cfab84e95` |
| Active Cloud Run revision / traffic | `[Record from current Cloud Run service; confirm traffic allocation]` |
| Deployed image digest | `[Record exact sha256 digest from active revision]` |
| Seed execution | Product Team reported `food-ordering-migrate` completed with 7 menu items and 3 accounts; Customer B login was reported verified. Attach the redacted execution log/screenshot. |
| UAT credentials | Shared privately with authorized testers only; no password values in this report or repository. |

## 2. Part B — Independent UAT result / ผล UAT อิสระ

| Item | Recorded result |
|---|---|
| UAT team and tester | `TH-048` · ภานุวัฒน์ (sole tester) |
| Product under test | `TH-040 Pun&Ice` event-registration application, per Part B report |
| Tested commit / revision | `b56826459da848342028a5b93e885f9cceaa3dcd` / `sbdec8d5b-00007-ld2` |
| Execution window | `27 Nov 2026, 14:48–22:00 GMT+7`; UAT-04 clean-URL retest at 22:00 |
| Cases | `UAT-01` through `UAT-05`: **5 PASS**, **0 FAIL**, **0 BLOCKED** after UAT-04 retest |
| Independent decision in Part B record | **Accepted** by the recorded UAT tester for the TH-040 partner product. |
| Evidence | `docs/evidence/part-b/EVID-B-00.png` through `EVID-B-05.png`, including `EVID-B-03-api`, `EVID-B-04-api`, and `EVID-B-04-retest`. |

The Part B acceptance applies to TH-040's partner application and the recorded test run. It is distinct from acceptance of the Good Table Cloud Run release described in this Part D.

## 3. Part C — Defect triage and correction / สรุป defect

| Direction | Finding | Classification / status |
|---|---|---|
| Outbound to TH-040 Pun&Ice | Issue #48 — malformed URL led to `NOT_FOUND`; clean URL retest returned `UNAUTHENTICATED`. | `not-defect`; clean-URL retest PASS; closed by partner team. |
| Inbound to Good Table | Issue #23 — order confirmation showed undefined ID and did not complete the detail redirect. | **Minor defect**; corrected in commit `ab3e0cc1990d1bb4bfdd841fabbd9d3cfab84e95`; reported deployed; partner retest pending. |
| Inbound to Good Table | Issue #24 — seed upsert left stale account hashes; navigation did not reflect session/role changes. | **Major defect**; corrected in the same commit; Secret Manager/seed update and successful Customer B login reported; partner retest pending. |

Detailed reproduction, rationale, resolution and disposition are in [Part C — Defects](part-c-defects.md). Keep the updated deployment's exact active revision and digest with the final evidence set.

## 4. Verification record / ผลตรวจสอบ

The local verification record for the code change is:

- Root TypeScript check: passed.
- Server TypeScript build: passed.
- Client Next.js compile and type validation: passed; final standalone packaging was blocked by a Windows `EPERM` error while creating directories under `client/.next/standalone`.
- Vitest: not completed locally because Docker Desktop/PostgreSQL was unavailable. Do not record the local Vitest suite as passed. Check the GitHub Actions CI result for the pushed commit and attach its run URL/output.
- Playwright: this repository has no Playwright configuration or browser E2E suite; do not claim Playwright coverage.

## 5. Final release readiness sign-off / การลงนามความพร้อมรุ่น

### Readiness decision

**Status: Implementation and deployment reported complete; ready for partner retest. Final Good Table release acceptance is pending.** The Product Team must verify the active revision/traffic/digest and the UAT partner must independently retest Issue #23 and Issue #24 on that exact revision. Do not treat the separate Part B `5/5 PASS` result as acceptance of this Good Table release.

### Required final checks

- [ ] GitHub Actions CI for commit `ab3e0cc1990d1bb4bfdd841fabbd9d3cfab84e95` passed; attach the workflow run URL.
- [ ] Active Cloud Run revision receives the intended traffic allocation; record revision and exact `sha256` image digest.
- [ ] Partner retested Issue #23: full UUID Order ID, `PENDING`, server total and detail route/ownership behavior verified.
- [ ] Partner retested Issue #24: login, `/api/auth/me`, role-aware header/logout, correct seeded accounts and access control verified.
- [ ] Attach retest evidence and update final issue statuses; close issues only after verified retest.
- [ ] Remove/redact credentials, cookies, tokens, unrelated PII, and any unverified claims from the PDF evidence.

### Sign-off record

| Sign-off field | Record |
|---|---|
| Exact accepted source commit | `[Complete after CI and partner retest]` |
| Exact deployed revision and traffic | `[Complete from Cloud Run]` |
| Exact deployed image digest | `[Complete from Cloud Run]` |
| Partner retest result for #23 / #24 | `[Pending independent retest]` |
| Open Critical/Major defects | `Issue #24 is Major until partner retest and verified closure.` |
| Final product-release decision | `[Pending — Accepted / Accepted with documented limitations / Not Accepted]` |
| Product Team approver and date/time (ICT) | `[Name, signature/approval, timestamp]` |
| Independent UAT partner approver and date/time (ICT) | `[Name, signature/approval, timestamp]` |

**PDF assembly:** Include the completed Part A handoff, Part B execution/evidence, Part C triage, this Part D record, CI and deployment evidence, plus partner retests. Preserve this pending sign-off state until every required item above has evidence.
