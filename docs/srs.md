# Part A: Software Requirements Specification (SRS) and Product Scope

## 1. Stakeholder Problem & Context
ร้านค้าขนาดเล็กต้องการระบบรับรายการสั่งซื้อและบริหารจัดการสินค้าออนไลน์ (E-Commerce & Food Ordering System) เพื่อเพิ่มช่องทางการขายและติดตามสถานะการจัดส่งได้อย่างแม่นยำ ปัจจุบันการสั่งซื้อสินค้าหรืออาหารผ่านช่องทางดั้งเดิมประสบปัญหาเรื่องความผิดพลาดในการคำนวณราคา การจัดการสต็อกสินค้าไม่ทันสมัย และขาดระบบติดตามสถานะคำสั่งซื้อที่มีประสิทธิภาพ

ระบบนี้ถูกออกแบบมาเพื่อแก้ปัญหาดังกล่าว โดยทำหน้าที่เป็นสื่อกลางระหว่างลูกค้าและพนักงานร้านค้า ช่วยให้ขั้นตอนการเลือกสินค้า การตรวจสอบสต็อก การบันทึกราคาที่ถูกต้อง และการเปลี่ยนสถานะคำสั่งซื้อเป็นไปอย่างมีระบบและมีความปลอดภัยสูง

---

## 2. Actors & Responsibilities

### 2.1 Customer (ลูกค้า)
- **ความรับผิดชอบ:**
  - เข้าสู่ระบบด้วยบัญชีผู้ใช้ของตนเอง
  - ค้นหาและเลือกดูรายการสินค้า/อาหารพร้อมสต็อกที่มีจำหน่าย
  - ทำการสั่งซื้อสินค้า (Place Order) โดยเลือกสินค้าและระบุจำนวนที่ต้องการ
  - เรียกดูประวัติและรายละเอียดคำสั่งซื้อของตนเอง (Data Isolation)

### 2.2 Admin / Store Staff (ผู้ดูแลระบบ / พนักงานร้านค้า)
- **ความรับผิดชอบ:**
  - เข้าสู่ระบบด้วยบัญชีระดับผู้ดูแลระบบ
  - เรียกดูรายการคำสั่งซื้อทั้งหมดที่เกิดขึ้นในระบบ
  - อัปเดตและควบคุมการเปลี่ยนสถานะคำสั่งซื้อ (Order State Transition) เช่น จาก PENDING -> PAID -> SHIPPED
  - ตรวจสอบความถูกต้องของสต็อกและออเดอร์ในระบบ

---

## 3. Product Scope & Exclusions

### 3.1 In-Scope (Sprint 1 Baseline)
- **Authentication & Identity:** ระบบยืนยันตัวตนผ่าน Login/Logout และแยกบทบาทสิทธิ์การใช้งาน (RBAC) ระหว่าง Customer และ Admin/Operator ชัดเจน
- **Catalog Display:** การดึงและแสดงรายการสินค้า/อาหารพร้อมสต็อกจริงจากฐานข้อมูล
- **Order Placement & Stock Transaction:** ระบบสร้างคำสั่งซื้อที่ตัดสต็อกและคำนวณราคาสุทธิบน Server (Authoritative Server-Side Pricing) ภายใต้ Database Transaction
- **Order State Management:** ระบบให้ Admin เปลี่ยนสถานะคำสั่งซื้อตาม Lifecycle ที่กำหนด
- **Access Control & Data Isolation:** การจำกัดสิทธิ์ไม่ให้ Customer เข้าถึงข้อมูลของ Customer ท่านอื่น หรือเข้าถึง API ของ Admin

### 3.2 Explicit Exclusions (ขอบเขตที่ยกเว้นใน Sprint 1)
- **Real Payment Gateway Integration:** ไม่มีการเชื่อมต่อระบบตัดเงินจริงใน Sprint 1 (ใช้นโยบาย Mock Payment Status)
- **Self-Registration & Password Recovery:** ไม่ทำระบบสมัครสมาชิกใหม่หรือลืมรหัสผ่าน (ใช้ระบบ Seeded Test Accounts ตามที่ระบุในข้อกำหนด)
- **Advanced Inventory & Supplier Management:** ระบบจัดการซัพพลายเออร์และการนำเข้าสต็อกระดับสูง (ยกยอดไป Sprint 3)
- **Product Refund & Return Workflow:** ระบบการขอคืนเงินและการคืนสินค้า

---

## 4. Requirements Breakdown

### 4.1 Functional Requirements (FR)
- **FR-01 (Product Catalog Browsing):** ระบบต้องรองรับการดึงข้อมูลและแสดงรายการสินค้า ชื่อสินค้า ราคา และจำนวนสต็อกคงเหลือ ให้แก่ Customer ได้อย่างถูกต้อง
- **FR-02 (Order Creation):** Customer ต้องสามารถเลือกสินค้า ระบุจำนวน และทำการส่งคำสั่งซื้อ (Place Order) เข้าสู่ระบบได้
- **FR-03 (Admin Order Status Management):** Admin ต้องสามารถเรียกดูรายการคำสั่งซื้อทั้งหมด และทำการเปลี่ยนสถานะคำสั่งซื้อได้ตามสิทธิ์

### 4.2 Business Rules (BR)
- **BR-01 (Stock Validation):** ระบบต้องปฏิเสธการสร้างคำสั่งซื้อ หากจำนวนสินค้าที่สั่งซื้อมากกว่าสต็อกคงเหลือที่มีอยู่ในฐานข้อมูล (quantity > stock_quantity) หรือจำนวนสั่งซื้อไม่ถูกต้อง (quantity <= 0)
- **BR-02 (Authoritative Price Preservation & Server Calculation):** ราคาสินค้าใน OrderItem ต้องถูกดึงมาจากฐานข้อมูลและบันทึก ณ เวลาที่กดสั่งซื้อ (Snapshot Price) โดยคำนวณราคารวมสุทธิ (total_amount) ที่ฝั่ง Server เท่านั้น และปฏิเสธราคาใดๆ ที่ส่งมาจากฝั่ง Client
- **BR-03 (Order State Transition Constraint):** การเปลี่ยนสถานะคำสั่งซื้อต้องเป็นไปตามลำดับ Lifecycle ที่ถูกต้อง โดยคำสั่งซื้อที่ถูกยกเลิก (CANCELLED) แล้ว ไม่สามารถเปลี่ยนสถานะไปเป็น SHIPPED ได้

### 4.3 Non-Functional Requirements (NFR)
- **NFR-01 (Security & Role-Based Access Control):** API Endpoints สำหรับการจัดการออเดอร์ของผู้อื่น หรือเมนูของ Admin ต้องปฏิเสธการเข้าถึงจาก Customer โดยส่งคืนค่า HTTP 403 Forbidden ตรวจสอบและยืนยันโดย Automated API Test ใน Sprint 1
- **NFR-02 (Data Integrity & Transactional Consistency):** การตรวจสอบสต็อก การลดจำนวนสต็อก และการบันทึก Order/OrderItem ต้องทำผ่าน Database Transaction (ACID) เพื่อป้องกันปัญหา Race Condition และข้อมูลไม่สอดคล้องกัน

---

## 5. Significant Assumptions & Architectural Decisions

### 5.1 Design Decisions
- **Decision-01 (Technology Stack):** เลือกใช้ Next.js สำหรับ Frontend และ Node.js/Express ร่วมกับ Prisma ORM และ PostgreSQL สำหรับ Backend เพื่อรองรับการเขียน Type-safe Code และทำ Database Integration Test ได้ง่าย
- **Decision-02 (Session/Token Security):** ใช้ JSON Web Token (JWT) ฝังใน HTTP-Only Cookie เพื่อป้องกันการโจมตีแบบ Cross-Site Scripting (XSS) ในการระบุตัวตนและตรวจสอบสิทธิ์
- **Decision-03 (State Machine for Orders):** กำหนดสถานะออเดอร์แบบ Explicit Enums ได้แก่ PENDING, PAID, SHIPPED, และ CANCELLED เพื่อควบคุม Lifecycle ของ Order ให้มีความชัดเจน

### 5.2 Assumptions
- **Assumption-01:** ข้อมูลผู้ใช้และข้อมูลสินค้าเริ่มต้นใน Sprint 1 จะถูกสร้างผ่าน Database Seed Script (prisma/seed.ts) เพื่อใช้ในการทดสอบระบบและ Automated Tests
- **Assumption-02:** การทดสอบระบบใน Sprint 1 ทำบนสภาพแวดล้อม Local Machine ก่อนจะทำการ Package ลง Docker Container ใน Lab ถัดไป