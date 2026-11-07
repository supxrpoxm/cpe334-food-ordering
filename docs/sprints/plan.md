# Part D: Three-Sprint Plan

## 1. Product Sprint Roadmap Summary

การพัฒนาโปรเจกต์แบ่งออกเป็น 3 Sprints ครอบคลุมฟีเจอร์และข้อกำหนดทั้งหมดของระบบ (Baseline SRS):

| Sprint | Target Date / Checkpoint | Focus Area / Outcome & Scope | Included Feature / Scope IDs | Key Dependencies |
| :--- | :--- | :--- | :--- | :--- |
| **Sprint 1** | **15 Nov 2026**<br>*(Deliverable 1)* | **Core Slice Baseline:** ระบบแกนหลักที่ทำงานได้จริง ตั้งแต่ UI, API ไปจนถึง Database การยืนยันตัวตนด้วย Cookie JWT, การจัดการสิทธิ์ (RBAC), การแสดงรายการสินค้า, การสร้างคำสั่งซื้อพร้อมตัดสต็อกฝั่ง Server และการเปลี่ยนสถานะออเดอร์โดย Admin | **F-01**, **F-02**, **F-03**, **F-04**, **F-05** | PostgreSQL, Prisma Schema Setup, Express API Structure |
| **Sprint 2** | **29 Nov 2026**<br>*(Deliverable 2)* | **Core Expansion & Gateway Integration:** ขยายระบบให้รองรับระบบตะกร้าสินค้า (Cart Management), การค้นหาและกรองสินค้า (Advanced Search & Filter), การจำลองระบบชำระเงิน (Mock Payment Gateway Integration) และการปรับปรุงประสิทธิภาพ Query | **EX-01** (Mock Payment Status), Core Features Enhancement | Completed Sprint 1 Baseline API & Database Schema |
| **Sprint 3** | **13 Dec 2026**<br>*(Final Complete)* | **Product Hardening & Advanced Modules:** เพิ่มระบบจัดการซัพพลายเออร์และคลังสินค้าขั้นสูง, ระบบกระบวนการคืนสินค้า/คืนเงิน, ระบบวิเคราะห์ข้อมูล (Analytics Dashboard), การทำ Docker Containerization และ GCP Cloud Deployment | **F-06** (Advanced Inventory), **EX-02**, **EX-03** (Refunds Workflow) | Completed Sprint 2 Engine & Stable API Contracts |

---

## 2. Detailed Sprint Objectives & Scope Boundaries

### Sprint 1: Core Slice Baseline (Target: 15 Nov 2026)
- **Goal:** ส่งมอบ Vertical Slice แกนหลักที่ทำงานได้จริง end-to-end พร้อมการตรวจสอบความถูกต้องฝั่ง Server
- **Key Features & Scope Justification:**
  1. **Product Catalog & Order Creation (`F-01`, `F-02`, `F-03`):** ครอบคลุมการแสดงรายการสินค้าพร้อมสต็อกจริง การส่งคำสั่งซื้อ และการตรวจสอบ/ตัดสต็อกฝั่ง Server (Authoritative Server-Side Pricing) ภายใต้ Database Transaction เพื่อรักษา Data Integrity และป้องกัน Race Condition
  2. **Admin Operations (`F-04`):** ให้ Admin สามารถเรียกดูคำสั่งซื้อทั้งหมดในระบบ และทำการอัปเดตสถานะออเดอร์ตาม Lifecycle ที่กำหนด (`PENDING` -> `PAID` -> `SHIPPED`) ได้ตาม Business Rules
  3. **Security Boundary (`F-05`):** บังคับใช้ระบบ Authentication (JWT ฝังใน HTTP-Only Cookie) และ Authorization (Role-Based Access Control) เพื่อป้องกันการเข้าถึง API ข้ามสิทธิ์ และกั้นแยกข้อมูลระหว่างผู้ใช้ (Data Isolation)

### Sprint 2: Core Expansion & Gateway Integration (Target: 29 Nov 2026)
- **Goal:** เพิ่มประสิทธิภาพประสบการณ์ผู้ใช้ ขยายฟังก์ชันการเลือกซื้อสินค้า และจำลองระบบชำระเงิน
- **Key Features & Scope Justification:**
  1. **Cart Management:** ระบบจัดการตะกร้าสินค้าแบบ Persistent (เพิ่ม/ลบ/แก้ไขจำนวนสินค้า)
  2. **Search & Multi-Category Filter:** ระบบค้นหาสินค้าขั้นสูงและการกรองสินค้าตามหมวดหมู่
  3. **Mock Payment Integration (`EX-01`):** การเชื่อมต่อและจำลองสถานะการชำระเงินจาก External Payment Gateway

### Sprint 3: Production Hardening & Cloud Deployment (Target: 13 Dec 2026)
- **Goal:** เติมเต็มระบบการบริหารจัดการระดับสูง ทำการทดสอบความแข็งแกร่งของระบบ Package แอปพลิเคชัน และนำขึ้น Cloud
- **Key Features & Scope Justification:**
  1. **Advanced Inventory & Supplier Management (`F-06` / `EX-02`):** ระบบจัดการซัพพลายเออร์และการนำเข้าสต็อกระดับสูง
  2. **Refund & Return Workflow (`EX-03`):** ระบบการจัดการคำขอคืนสินค้าและการคืนเงิน
  3. **System Hardening & GCP Deployment:** การทำ Analytics Dashboard สำหรับสรุปยอดขาย, การเตรียม Docker Containerization และการปรับแต่งระบบเพื่อ Deploy ขึ้น Google Cloud Platform (GCP)