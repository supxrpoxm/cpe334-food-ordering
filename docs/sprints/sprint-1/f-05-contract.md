# Feature Contract: F-05 Role-Based Access Control & Auth

## 1. Feature Design & Business Rules

- **Linked Requirements:** NFR-01 (primary; traceability: NFR-01 → F-05 → AC-07 / TEST-07), FR-01 (Public Catalog Access Boundary), FR-02 (Customer-only Order Creation Boundary), FR-03 (Admin-only Order Status Management Boundary), Decision-02 (JWT ใน HTTP-Only Cookie), Assumption-01 (Seeded Test Accounts), SRS §3.2 (Self-Registration และ Password Recovery อยู่นอก Scope ของ Sprint 1)

- **Behavior & Workflow:**
  1. **Login:** ผู้ใช้ส่ง `POST /api/auth/login` ด้วย `email` และ `password`
  2. ระบบค้นหา `User` จาก `email`, ตรวจสอบรหัสผ่านด้วย `bcrypt.compare` กับ `passwordHash`
  3. หากถูกต้อง ระบบออก JWT ที่บรรจุ `userId` และ `role` แล้วฝังใน HTTP-Only Cookie ชื่อ `access_token`
  4. ระบบส่งคืนข้อมูลผู้ใช้ที่ไม่มีความลับ (`id`, `email`, `name`, `role`) เพื่อให้ UI ใช้แสดงผล; ห้ามส่ง `passwordHash`
  5. **Protected Request:** Middleware `authenticate` อ่าน Cookie, ตรวจสอบ Signature และ Expiry; หากผ่านจะแนบ `req.user = { userId, role }`
  6. **Authorization:** Middleware `authorize(role)` ตรวจสอบ Role; หากไม่ตรงต้องคืน `403 Forbidden`
  7. **Data Isolation:** Endpoint ที่เป็นของ Customer ต้อง Filter ด้วย `userId` จาก JWT; Admin เท่านั้นที่เข้าถึง Order ของทุกคนได้
  8. **Logout:** `POST /api/auth/logout` ทำการ Clear Cookie `access_token` และส่งคืน `204 No Content`
  9. UI Route Guard เป็นเพียง UX; Server Middleware เป็นผู้บังคับใช้สิทธิ์จริงเสมอ

- **Dependencies:**
  - `User` Table และ Seed Script (`prisma/seed.ts`) ตาม Assumption-01 สำหรับ Seeded Test Accounts
  - `bcrypt` (Salt Rounds = 10) สำหรับ Password Hashing
  - `jsonwebtoken` และ Environment Variable `JWT_SECRET`
  - F-01 Product Catalog Browsing (Public Endpoint)
  - F-02 Customer Order Placement (Customer-only Endpoint)
  - F-03 Server-side Stock & Pricing Engine (ถูกเรียกผ่าน F-02)
  - F-04 Admin Order Status Management (Admin-only Endpoint)
  - Next.js Frontend สำหรับ Login/Logout UI และ Route Guard

- **Business Rules & Validation:**
  - **NFR-01:** Protected Endpoint ต้องปฏิเสธผู้ใช้ที่ไม่มีสิทธิ์ด้วย `401 Unauthorized` (ยังไม่ยืนยันตัวตน) หรือ `403 Forbidden` (ยืนยันตัวตนแล้วแต่ Role/Ownership ไม่ถูกต้อง)
  - **NFR-01:** Customer ต้องเข้าถึงได้เฉพาะ Order ของตนเอง; การเข้าถึง Order ของ Customer ท่านอื่นต้องได้ `403 Forbidden`
  - **NFR-01:** Customer ต้องไม่สามารถเรียก Admin Endpoint (`PATCH /api/admin/orders/:id/status`) ได้; ต้องได้ `403 Forbidden`
  - **NFR-01:** Admin ต้องไม่สามารถสร้าง Order ผ่าน `POST /api/orders` ได้; ต้องได้ `403 Forbidden` ตาม Access Matrix
  - **Decision-02:** JWT ต้องถูกเก็บใน HTTP-Only Cookie เท่านั้น; ห้ามเก็บใน `localStorage` หรือ `sessionStorage`
  - Cookie ต้องตั้งค่า `HttpOnly`, `SameSite=Lax`, `Path=/`, และ `Secure` ใน Production
  - `JWT_SECRET` ต้องอ่านจาก Environment Variable เท่านั้น; ห้าม Hardcode หรือ Commit ลง Repository
  - JWT ต้องมี Claims `userId` และ `role`; Role ต้องเป็นค่าใน Enum `CUSTOMER` หรือ `ADMIN`
  - รหัสผ่านต้องถูก Hash ด้วย `bcrypt` (Salt Rounds = 10); ห้ามเก็บหรือ Log Plaintext Password
  - Login ที่ล้มเหลวต้องคืนข้อความ Generic เช่น `Invalid email or password` เพื่อป้องกัน User Enumeration
  - `email` ต้องถูก Normalize (Trim และ Lowercase) ก่อนค้นหา; `User.email` มี Constraint `@unique`
  - Logout ต้องเป็น Idempotent; หากไม่มี Cookie อยู่แล้วต้องยังคืน `204 No Content`
  - **Sprint 1 Limitation:** JWT เป็น Stateless; Logout ทำเพียง Clear Cookie ไม่สามารถ Revoke Token ที่ถูกออกไปแล้วได้ จนกว่า Token จะหมดอายุ (ไม่มี Token Blocklist/Session Table ใน Sprint 1)
  - **Out of Scope:** Self-Registration, Password Recovery, MFA, Rate Limiting และ Dedicated CSRF Token ไม่อยู่ใน Sprint 1 ตาม SRS §3.2

- **Failure / Boundary Cases:**
  - ไม่ส่ง `email` หรือ `password` → `400 VALIDATION_ERROR`
  - `email` ไม่มีในระบบ หรือ `password` ไม่ถูกต้อง → `401 INVALID_CREDENTIALS` พร้อมข้อความ Generic; ต้องไม่เปิดเผยว่าอีเมลมีอยู่หรือไม่
  - ไม่มี Cookie `access_token` → `401 UNAUTHORIZED` สำหรับ Protected Endpoint
  - JWT หมดอายุ, Signature ไม่ถูกต้อง, รูปแบบผิด, หรือ Role ไม่ถูกต้อง → `401 UNAUTHORIZED`
  - JWT ถูกต้องแต่ Role ไม่พอ → `403 FORBIDDEN_ROLE`
  - Customer พยายามเข้าถึง Order ของ Customer ท่านอื่น → `403 FORBIDDEN_RESOURCE`
  - Admin เรียก `POST /api/orders` → `403 FORBIDDEN_ROLE`
  - Customer เรียก `PATCH /api/admin/orders/:id/status` → `403 FORBIDDEN_ROLE`
  - Logout โดยไม่มี Cookie หรือ Logout ซ้ำ → `204 No Content` (Idempotent)
  - หลัง Logout แล้วนำ Token เดิมมาใช้ → Token ยังใช้ได้จนหมดอายุ (Sprint 1 Limitation ที่ต้องบันทึกและทดสอบตามพฤติกรรมจริง)
  - JWT ที่ถูกแก้ไข Claim `role` เป็น `ADMIN` โดยไม่มี Secret → Signature Verification ล้มเหลว → `401 UNAUTHORIZED`
  - Public Endpoint (`GET /api/products`, `POST /api/auth/login`, `POST /api/auth/logout`) ต้องเข้าถึงได้โดยไม่ต้องมี Token ตาม Access Matrix

- **Permissions:**
  | Operation / Resource Endpoint | Method | Customer | Admin | Unauthenticated |
  | :--- | :--- | :--- | :--- | :--- |
  | User Login / Logout | `POST` | Permitted (`/api/auth/*`) | Permitted (`/api/auth/*`) | Permitted |
  | Browse Product Catalog | `GET` | Permitted (`/api/products`) | Permitted (`/api/products`) | Permitted |
  | Create New Order | `POST` | Permitted (Own `userId` only) | Denied (`403`) | Denied (`401`) |
  | View Order History | `GET` | Permitted (Own orders only) | Permitted (All system orders) | Denied (`401`) |
  | View Order Detail | `GET` | Permitted (Own order ID only) | Permitted (Any order ID) | Denied (`401`) |
  | Update Order Status | `PATCH` | Denied (`403`) | Permitted (`/api/admin/orders/:id/status`) | Denied (`401`) |

## 2. Technical Specification

- **UI Behavior:**
  - เพิ่มหน้า `/login` สำหรับกรอก `email` และ `password`; แสดง Loading State ระหว่างรอผลลัพธ์
  - เมื่อ Login สำเร็จ: Redirect ตาม Role — `CUSTOMER` ไปหน้า Catalog, `ADMIN` ไปหน้า Admin Orders
  - แสดงข้อความ Error แบบ Generic เมื่อ Login ล้มเหลว; ห้ามระบุว่า Email หรือ Password ผิดแยกกัน
  - เพิ่ม Logout Control ใน Navigation; เมื่อกดแล้วเรียก `POST /api/auth/logout`, ล้าง Client State ที่ไม่ใช่ HttpOnly Cookie และ Redirect ไป `/login`
  - Navigation แสดงเมนูตาม Role: Customer เห็น Catalog/My Orders; Admin เห็น Admin Orders; ซ่อนปุ่มที่ Role ไม่มีสิทธิ์
  - Route Guard ฝั่ง Client ใช้เพื่อ UX เท่านั้น; ทุก Protected Page ต้องพึ่งพา Server Response (`401` → Redirect Login, `403` → Forbidden State)
  - ห้ามเก็บ JWT ใน `localStorage`/`sessionStorage`; ใช้ HttpOnly Cookie เท่านั้น
  - ไม่แสดงลิงก์ Self-Registration หรือ Password Recovery ใน Sprint 1
  - เมื่อได้รับ `401` จาก Protected API ระหว่างใช้งาน: ล้าง Client State และ Redirect ไป `/login`; เมื่อได้รับ `403`: แสดงข้อความไม่มีสิทธิ์โดยไม่ Logout ผู้ใช้

- **API Methods & Paths:**
  - `POST /api/auth/login` — Public
  - `POST /api/auth/logout` — Public (Idempotent)
  - Protected Endpoints ที่ F-05 บังคับใช้สิทธิ์:
    - `POST /api/orders` — Customer เท่านั้น (F-02)
    - `GET /api/orders` — Customer (Own only) / Admin (All)
    - `GET /api/orders/:id` — Customer (Own only) / Admin (Any)
    - `PATCH /api/admin/orders/:id/status` — Admin เท่านั้น (F-04)
  - `GET /api/products` — Public (F-01)
  - **No additional Auth Endpoint:** ไม่มี `GET /api/auth/me` ใน Sprint 1 ตาม System SDS; UI ใช้ข้อมูลผู้ใช้จาก Login Response และใช้ Server Response ของ Protected Endpoint ในการตรวจสอบ Session หลัง Reload

- **Request, Response & Error Shapes:** (JSON)

  **Request — `POST /api/auth/login`**
  ```json
  {
    "email": "customer@example.com",
    "password": "TestPassword123!"
  }
  ```

  **Response — `200 OK`**
  ```json
  {
    "data": {
      "id": "7d6c5b4a-3e2f-4a1b-9c8d-7e6f5a4b3c2d",
      "email": "customer@example.com",
      "name": "Customer One",
      "role": "CUSTOMER"
    }
  }
  ```

  **Response Header — `Set-Cookie` (ตัวอย่างรูปแบบ)**
  ```http
  Set-Cookie: access_token=<jwt>; HttpOnly; Path=/; SameSite=Lax; Max-Age=<token-ttl>
  ```

  **Request — `POST /api/auth/logout`**
  ```http
  POST /api/auth/logout
  Cookie: access_token=<jwt>
  ```

  **Response — `204 No Content`**
  ```http
  Set-Cookie: access_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0
  ```

  **Error Shape**
  ```json
  {
    "error": {
      "code": "FORBIDDEN_ROLE",
      "message": "You do not have permission to perform this action"
    }
  }
  ```

  **Error Codes ที่กำหนด**
  | HTTP Status | Error Code | Condition |
  | :--- | :--- | :--- |
  | 400 | `VALIDATION_ERROR` | ไม่ส่ง `email`/`password` หรือรูปแบบไม่ถูกต้อง |
  | 401 | `INVALID_CREDENTIALS` | Email ไม่มีในระบบ หรือ Password ไม่ถูกต้อง |
  | 401 | `UNAUTHORIZED` | ไม่มี Cookie, JWT หมดอายุ, Signature ผิด, หรือ JWT ไม่ถูกต้อง |
  | 403 | `FORBIDDEN_ROLE` | Role ไม่มีสิทธิ์สำหรับ Endpoint |
  | 403 | `FORBIDDEN_RESOURCE` | Customer พยายามเข้าถึง Resource ของผู้อื่น |

- **Data Fields, Constraints & Migrations:**
  - **Schema/Migration: No change needed for this layer.** ใช้ Schema baseline จาก System SDS; ไม่มีการเพิ่ม Session Table หรือคอลัมน์ใหม่ใน Sprint 1
  - `User.id` (`String`, UUID): Primary Key
  - `User.email` (`String`, `@unique`): ใช้เป็น Login Identifier; ต้อง Normalize เป็น Trim/Lowercase
  - `User.passwordHash` (`String`, map `password_hash`): เก็บเฉพาะ `bcrypt` Hash; ห้ามส่งกลับ API หรือ Log
  - `User.name` (`String`): ข้อมูลแสดงผล
  - `User.role` (`Role` Enum: `CUSTOMER`, `ADMIN`; default `CUSTOMER`): ใช้สำหรับ Authorization
  - `User.createdAt` / `User.updatedAt`: Audit Timestamp
  - ไม่มี `Session`/`RefreshToken` Table ใน Sprint 1; JWT เป็น Stateless และใช้ `JWT_SECRET` จาก Environment Variable
  - Seed Script ต้องสร้าง Seeded Test Accounts ตาม Assumption-01 โดยรหัสผ่านต้องถูก Hash ด้วย `bcrypt` และไม่ถูก Commit เป็น Plaintext ใน Source Code

## 3. Acceptance Criteria (AC)

| AC ID | Observable Expected Outcome | Relevant Negative / Boundary Behavior | Role Restrictions |
| :--- | :--- | :--- | :--- |
| **AC-07** | ระบบบังคับใช้ Access Matrix ตาม NFR-01: Protected Endpoint ต้องตรวจสอบ JWT และ Role ทุกครั้ง; Customer เข้าถึงได้เฉพาะ Resource ของตนเอง; Admin เข้าถึง Admin Resource ได้ | ไม่มี Token → `401`; Token ไม่ถูกต้อง/หมดอายุ → `401`; Role ไม่พอ → `403`; Customer เข้าถึง Order ของผู้อื่น → `403`; Admin สร้าง Order → `403` | Customer, Admin และ Unauthenticated ถูกจำกัดตาม Matrix |
| **AC-07.1** | Login ด้วย Credential ที่ถูกต้องสำเร็จ, ออก JWT ใน HTTP-Only Cookie, และส่งคืนเฉพาะข้อมูลผู้ใช้ที่ไม่มีความลับ | Email/Password ผิด → `401 INVALID_CREDENTIALS` แบบ Generic; ไม่ส่ง `email`/`password` → `400`; Response ต้องไม่มี `passwordHash` | Public Endpoint; ทุก Role ใช้ได้ |
| **AC-07.2** | Protected Endpoint ปฏิเสธ Request ที่ไม่มี JWT หรือ JWT ไม่ถูกต้อง/หมดอายุ ด้วย `401 Unauthorized` | ไม่มี Cookie, JWT หมดอายุ, Signature ผิด, JWT รูปแบบผิด, Role ใน Token ไม่ถูกต้อง → `401`; ต้องไม่ประมวลผล Business Logic ต่อ | Protected Endpoint ทั้งหมด |
| **AC-07.3** | Logout Clear Cookie `access_token` และคืน `204 No Content`; การ Logout ซ้ำต้องไม่ Error | ไม่มี Cookie ขณะ Logout → `204`; Logout ซ้ำ → `204`; Token เดิมยังใช้ได้จนหมดอายุ (Sprint 1 Stateless Limitation) | Public Endpoint; ทุก Role ใช้ได้ |
| **AC-07.4** | Customer เห็นเฉพาะ Order ของตนเอง; Admin เห็น Order ทั้งหมด; Customer ไม่สามารถดู Order ของ Customer ท่านอื่นได้ | Customer A เรียก `GET /api/orders/:id` ของ Customer B → `403 FORBIDDEN_RESOURCE`; Customer เรียก `GET /api/orders` ต้องได้เฉพาะของตนเอง; Admin เรียกได้ทุก Order | Customer: Own only; Admin: All; Unauthenticated: `401` |
| **AC-07.5** | การแบ่งแยกสิทธิ์ระหว่าง Customer และ Admin ทำงานตาม Access Matrix | Admin เรียก `POST /api/orders` → `403`; Customer เรียก `PATCH /api/admin/orders/:id/status` → `403`; Admin เรียก `PATCH` ได้; Customer เรียก `POST /api/orders` ได้เฉพาะของตนเอง | Customer: Order Creation/Own Read; Admin: All Orders/Status Update; ห้ามข้ามสิทธิ์ |
| **AC-07.6** | Public Endpoint (`GET /api/products`, `POST /api/auth/login`, `POST /api/auth/logout`) เข้าถึงได้โดยไม่ต้องมี Token; Protected Endpoint ต้องมี Token ที่ถูกต้อง | Unauthenticated เรียก Protected Endpoint → `401`; Unauthenticated เรียก `GET /api/products` → `200`; Unauthenticated เรียก Login/Logout → ทำงานตาม Contract | Public vs Protected แยกชัดเจน |
| **AC-07.7** | ระบบป้องกันการปลอมแปลง JWT และการยกระดับสิทธิ์ (Privilege Escalation) | แก้ไข Claim `role` เป็น `ADMIN` โดยไม่มี Secret → Signature Verification ล้มเหลว → `401`; ใช้ JWT ที่ Sign ด้วย Secret อื่น → `401`; ต้องไม่สามารถเข้าถึง Admin Resource ได้ | ทุก Role; ต้องไม่มีการยกระดับสิทธิ์ |

## 4. Software Test Specification (STS)

| Test ID | Linked AC | Test Level | Precondition / Input | Action | Expected Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **STS-F05-01** | AC-07.1 | API Integration | Seed Customer `customer@example.com` พร้อม `bcrypt` Hash; ไม่มี Cookie | ส่ง `POST /api/auth/login` ด้วย Email/Password ที่ถูกต้อง | `200 OK`; Response มี `id`, `email`, `name`, `role = CUSTOMER`; ไม่มี `passwordHash`; มี `Set-Cookie: access_token=...; HttpOnly`; Cookie ไม่สามารถอ่านได้ด้วย JavaScript |
| **STS-F05-02** | AC-07.1 | API Integration (Negative) | Seed Customer; ไม่มี Cookie | ส่ง Login ด้วย Password ผิด, Email ไม่มีในระบบ, ไม่ส่ง `email`, และไม่ส่ง `password` ตามลำดับ | Password ผิด/Email ไม่มี → `401 INVALID_CREDENTIALS` พร้อมข้อความ Generic; ไม่ส่งฟิลด์ → `400 VALIDATION_ERROR`; ไม่มี Cookie ถูกตั้งค่าในทุกกรณี |
| **STS-F05-03** | AC-07.2 | Security / API Integration (Negative) | Protected Endpoint `GET /api/orders`; เตรียมกรณีไม่มี Cookie, JWT หมดอายุ, JWT Signature ผิด, JWT รูปแบบผิด | เรียก Endpoint ในแต่ละกรณี | ทุกกรณีได้ `401 UNAUTHORIZED`; ไม่มีข้อมูล Order ถูกส่งคืน; Business Logic ไม่ถูกเรียก |
| **STS-F05-04** | AC-07.3 | API Integration / Boundary | Login สำเร็จและมี Cookie; เตรียมกรณีไม่มี Cookie | เรียก `POST /api/auth/logout` ด้วย Cookie, เรียกซ้ำอีกครั้ง, และเรียกโดยไม่มี Cookie | ทุกกรณีได้ `204 No Content`; Response มีการ Clear Cookie (`Max-Age=0`); ไม่มี Error |
| **STS-F05-05** | AC-07.3 | Security / Boundary (Documented Limitation) | Login สำเร็จ; เก็บค่า Cookie เดิมไว้; เรียก Logout | นำ Cookie เดิมกลับมาเรียก Protected Endpoint ก่อน Token หมดอายุ | Endpoint ยังตอบสนองตาม Token ที่ยังไม่หมดอายุ (Sprint 1 Stateless Limitation); Test ต้องยืนยันพฤติกรรมนี้และไม่ถือเป็นช่องโหว่ที่ต้องแก้ใน Sprint 1 |
| **STS-F05-06** | AC-07, AC-07.4 | Security / API Integration | Seed Customer A, Customer B, Admin; สร้าง Order ของ A และ B | Login เป็น A แล้วเรียก `GET /api/orders` และ `GET /api/orders/:id` ของ B; Login เป็น Admin แล้วเรียก Endpoint เดียวกัน | A เห็นเฉพาะ Order ของ A; A เรียก Order ของ B → `403 FORBIDDEN_RESOURCE`; Admin เห็น Order ทั้งหมดและเรียก Order ใดก็ได้ → `200` |
| **STS-F05-07** | AC-07, AC-07.5 | Security / API Integration (Negative) | Seed Customer และ Admin; Login ทั้งสอง Role | Admin เรียก `POST /api/orders`; Customer เรียก `PATCH /api/admin/orders/:id/status`; Customer เรียก `POST /api/orders` ของตนเอง; Admin เรียก `PATCH /api/admin/orders/:id/status` | Admin สร้าง Order → `403 FORBIDDEN_ROLE`; Customer อัปเดตสถานะ → `403 FORBIDDEN_ROLE`; Customer สร้าง Order ของตนเอง → ผ่าน Authorization; Admin อัปเดตสถานะ → ผ่าน Authorization (Business Rule ของ F-04 ตรวจต่อ) |
| **STS-F05-08** | AC-07.6 | API Integration | ไม่มี Cookie; Seed Product | เรียก `GET /api/products`, `POST /api/auth/login`, `POST /api/auth/logout`, และ Protected Endpoint `GET /api/orders` | Public Endpoint ทำงานได้ตาม Contract (`200`/`204`); Protected Endpoint ได้ `401 UNAUTHORIZED`; ไม่มีข้อมูลรั่วไหล |
| **STS-F05-09** | AC-07.7 | Security (Negative) | Seed Customer; Login แล้ว; มี JWT ที่ถูกต้อง | แก้ไข Claim `role` เป็น `ADMIN` โดยไม่ Sign ใหม่; และสร้าง JWT ใหม่ที่ Sign ด้วย Secret อื่น | ทั้งสองกรณีได้ `401 UNAUTHORIZED`; ไม่สามารถเรียก Admin Endpoint ได้; ไม่มีการยกระดับสิทธิ์ |
| **STS-F05-10** | AC-07.1 | Security / Integration | Seed Customer พร้อม `bcrypt` Hash; เปิด Log Capture | Login สำเร็จและตรวจสอบ Response/Log; ตรวจสอบค่าในฐานข้อมูล | `passwordHash` ไม่ถูกส่งใน Response และไม่ปรากฏใน Log; ค่าในฐานข้อมูลไม่ใช่ Plaintext และตรวจสอบด้วย `bcrypt.compare` ได้; Salt Rounds = 10 |
| **STS-F05-11** | AC-07.2 | Security / API Integration (Negative) | Protected Endpoint; ไม่มี Cookie | เรียก Endpoint ด้วย JWT ที่ Role เป็นค่าที่ไม่รู้จัก (เช่น `SUPERADMIN`) และ JWT ที่ไม่มี Claim `userId` | ได้ `401 UNAUTHORIZED`; ไม่มีการประมวลผล Business Logic; ไม่มีข้อมูลถูกส่งคืน |
| **STS-F05-12** | AC-07.4, AC-07.5 | Security / API Integration (Negative) | Seed Customer A และ Customer B; Login เป็น A | เรียก `GET /api/orders/:id` ของ B และ `PATCH /api/admin/orders/:id/status` ของ B | `GET` Order ของ B → `403 FORBIDDEN_RESOURCE`; `PATCH` Admin Endpoint → `403 FORBIDDEN_ROLE`; ไม่มีข้อมูลของ B ถูกเปิดเผย |

## 5. Completion Evidence
- **TDD Evidence:**
  - Red Phase (Failing Tests): https://github.com/supxrpoxm/cpe334-food-ordering/commit/a3f67a7
  - Green Phase (Passing Implementation): https://github.com/supxrpoxm/cpe334-food-ordering/commit/72e50da
- **Merged PR:** [รอใส่ลิงก์ GitHub PR หลังเพื่อนกด Merge เข้า staging]
