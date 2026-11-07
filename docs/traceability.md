# Requirements to Feature Traceability Matrix

## 1. Baseline Requirements Coverage (Sprint 1)

ตารางแสดงการครอบคลุม Requirements ทั้งหมดจาก Part A (SRS) ไปยัง Feature ID และรหัสการสอบทาน (AC / TEST):

| Requirement ID | Requirement Description (from SRS Part A) | Linked Feature ID | Sprint & Verification Method | Ref. Artifact / Target Test |
| :--- | :--- | :--- | :--- | :--- |
| **FR-01** | Product Catalog Browsing (แสดงรายการสินค้า ราคา และสต็อกจริง) | **F-01** | Sprint 1; AC-01 / TEST-01 | `docs/sprints/sprint-1/` (API Test `GET /api/products`) |
| **FR-02** | Order Creation (ลูกค้าสร้างคำสั่งซื้อสินค้า) | **F-02** | Sprint 1; AC-02 / TEST-02 | `docs/sprints/sprint-1/` (E2E / API Test `POST /api/orders`) |
| **FR-03** | Admin Order Status Management (Admin เรียกดูและเปลี่ยนสถานะออเดอร์) | **F-04** | Sprint 1; AC-03 / TEST-03 | `docs/sprints/sprint-1/` (API Test `PATCH /api/admin/orders/:id/status`) |
| **BR-01** | Stock Validation (ปฏิเสธคำสั่งซื้อหากสต็อกไม่พอหรือจำนวน <= 0) | **F-03** | Sprint 1; AC-04 / TEST-04 | `docs/sprints/sprint-1/` (Unit/Integration Test for Stock Rule) |
| **BR-02** | Authoritative Server-side Pricing (คำนวณราคาสุดท้ายและ Snapshot บน Server) | **F-03** | Sprint 1; AC-05 / TEST-05 | `docs/sprints/sprint-1/` (Integration Test for Pricing preservation) |
| **BR-03** | Order State Transition Constraint (ควบคุมลำดับการเปลี่ยนสถานะ PENDING -> PAID -> SHIPPED) | **F-04** | Sprint 1; AC-06 / TEST-06 | `docs/sprints/sprint-1/` (Unit Test for State Machine validation) |
| **NFR-01** | Security & RBAC (ปฏิเสธการเข้าถึง Resource ข้ามสิทธิ์ คืนค่า 401/403) | **F-05** | Sprint 1; AC-07 / TEST-07 | `docs/sprints/sprint-1/` (Automated API Permission Test) |
| **NFR-02** | Data Integrity & Transactional Consistency (ใช้ DB Transaction ในการตัดสต็อก) | **F-03** | Sprint 1; AC-08 / TEST-08 | `docs/sprints/sprint-1/` (Concurrency / Integration Test) |

---

## 2. Explicit Exclusions & Future Sprints Allocation

| Exclusion ID | Description / Scope | Responsible Feature | Planned Sprint | Allocation Status |
| :--- | :--- | :--- | :--- | :--- |
| **EX-01** | Real Payment Gateway Integration | External Payment Gateway Service | Sprint 2 | Deferred (Mock Status used in Sprint 1) |
| **EX-02** | Advanced Inventory & Supplier Management | **F-06** Advanced Inventory | Sprint 3 | Planned for Sprint 3 |
| **EX-03** | Product Refund & Return Workflow | Order Refund Responsibility | Sprint 3 | Planned for Sprint 3 |