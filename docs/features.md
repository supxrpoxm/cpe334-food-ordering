Feature Inventory
| Feature ID | Feature Name | Description | Related Requirements | Planned Sprint | Primary Actor |
| :--- | :--- | :--- | :--- | :--- | :--- |
| F-01 | Product Catalog Browsing | แสดงรายการสินค้า/อาหาร ราคาสินค้า และจำนวนสต็อกคงเหลือจริง | FR-01 | Sprint 1 | Customer / Admin |
| F-02 | Customer Order Placement | ให้ลูกค้าเลือกสินค้า ระบุจำนวน และทำการส่งคำสั่งซื้อเข้าสู่ระบบ | FR-02 | Sprint 1 | Customer |
| F-03 | Server-side Stock & Pricing Engine | ตรวจสอบสต็อก ตัดสต็อก และคำนวณราคาสุดท้ายบน Server ภายใต้ DB Transaction | BR-01, BR-02, NFR-02 | Sprint 1 | System (Backend) |
| F-04 | Admin Order Status Management | หน้าสำหรับ Admin เรียกดูรายการคำสั่งซื้อทั้งหมด และอัปเดตสถานะตาม Lifecycle | FR-03, BR-03 | Sprint 1 | Admin |
| F-05 | Role-Based Access Control & Auth | ระบบ Login/Logout และจำกัดสิทธิ์ API Endpoints ตามบทบาทผู้ใช้ | NFR-01 | Sprint 1 | All Actors |
| F-06 | Advanced Inventory & Supplier Management | ระบบจัดการซัพพลายเออร์และการนำเข้าสต็อกระดับสูง (Explicit Exclusion for Sprint 1) | EX-02 | Sprint 3 | Admin |
.
.
.
traceability.md