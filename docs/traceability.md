# Requirements to Feature Traceability Matrix

## 1. Baseline Requirements Coverage (Sprint 1)

ตารางแสดงการครอบคลุม Requirements ทั้งหมดจาก Part A (SRS) ไปยัง Feature ID และรหัสการสอบทาน (AC / TEST):

| Requirement ID | Requirement Description (from SRS Part A) | Linked Feature ID | Sprint & Verification Method | Ref. Artifact / Target Test |
| :--- | :--- | :--- | :--- | :--- |
| **FR-01** | Product Catalog Browsing (แสดงรายการสินค้า ราคา และสต็อกจริง) | **F-01** | Sprint 1; AC-F01-01–03 | `tests/f01-product-catalog.test.ts`; `GET /api/products` และ versioned alias `/api/v1/products` |
| **FR-02** | Customer Order Creation (ลูกค้าสร้างคำสั่งซื้อสินค้า) | **F-02** | Sprint 1; AC-02, AC-02.1–02.5 | `tests/f02-order-placement.test.ts`; `POST /api/orders`, `GET /api/orders`, `GET /api/orders/:id` |
| **FR-03** | Admin Order Status Management (Admin ดูและเปลี่ยนสถานะออเดอร์) | **F-04** | Sprint 1; AC-F04-01–03 | `tests/f04-admin-order-status.test.ts`; `GET /api/v1/admin/orders`, `PATCH /api/v1/admin/orders/:id/status` |
| **BR-01** | Stock Validation (ปฏิเสธคำสั่งซื้อหากสต็อกไม่พอหรือจำนวนไม่ถูกต้อง) | **F-03** (called by F-02) | Sprint 1; F-03 stock validation AC/STS | `tests/f03-stock-pricing-engine.test.ts`, `tests/f02-order-placement.test.ts` |
| **BR-02** | Server-authoritative Pricing (snapshot ราคาจากฐานข้อมูลและคำนวณยอดรวมบน Server) | **F-03** (called by F-02) | Sprint 1; F-03 pricing AC/STS | `tests/f03-stock-pricing-engine.test.ts`, `tests/f02-order-placement.test.ts` |
| **BR-03** | Order State Transition Constraint (อนุญาตเฉพาะ transition ใน state machine; terminal states เปลี่ยนต่อไม่ได้) | **F-04** | Sprint 1; AC-F04-02–03 | `tests/f04-admin-order-status.test.ts`; integration test for transitions and history |
| **NFR-01** | Security & RBAC (ยืนยันตัวตน, role authorization, ownership isolation) | **F-05** and authorization boundaries in F-02/F-04 | Sprint 1; F-05 AC-07 and feature security ACs | `tests/f05-auth-rbac.test.ts`, `tests/f02-order-placement.test.ts`, `tests/f04-admin-order-status.test.ts` |
| **NFR-02** | Data Integrity & Transactional Consistency (ใช้ DB transaction สำหรับ order, items และ stock deduction) | **F-03** (called by F-02) | Sprint 1; F-03 transaction/concurrency ACs | `tests/f03-stock-pricing-engine.test.ts`, `tests/f02-order-placement.test.ts` |

> **Role baseline:** Sprint 1 Prisma `Role` enum รองรับ `CUSTOMER` และ `ADMIN` เท่านั้น. เอกสารและ access matrix จึงใช้ `ADMIN` สำหรับงานผู้ดูแล; `STAFF` ยังไม่ใช่ role ที่ระบบ implement.

---

## 2. Explicit Exclusions & Future Sprints Allocation

| Exclusion ID | Description / Scope | Responsible Feature | Planned Sprint | Allocation Status |
| :--- | :--- | :--- | :--- | :--- |
| **EX-01** | Real Payment Gateway Integration | External Payment Gateway Service | Sprint 2 | Deferred (Mock Status used in Sprint 1) |
| **EX-02** | Advanced Inventory & Supplier Management | **F-06** Advanced Inventory | Sprint 3 | Planned for Sprint 3 |
| **EX-03** | Product Refund & Return Workflow | Order Refund Responsibility | Sprint 3 | Planned for Sprint 3 |
