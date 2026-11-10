# Feature Contract: F-02 Customer Order Placement

## 1. Feature Design & Business Rules

- **Linked Requirements:** FR-02 (primary; traceability: FR-02 → F-02 → AC-02 / TEST-02), BR-01, BR-02, NFR-02 (บังคับใช้ผ่าน F-03), NFR-01 (Authentication/Authorization boundary), Decision-01 (Next.js + Express + Prisma + PostgreSQL), Decision-02 (JWT ใน HTTP-Only Cookie), Decision-03 (Order เริ่มต้นสถานะ PENDING), Assumption-01 (Seeded Test Accounts), EX-01 (ไม่เชื่อมต่อ Real Payment Gateway ใน Sprint 1)

- **Behavior & Workflow:**
  1. Customer ต้อง Login ผ่าน F-05 ก่อนทำการสั่งซื้อ และระบบต้องอ่าน `userId` จาก JWT ใน HTTP-Only Cookie เท่านั้น
  2. Customer เลือกสินค้าจาก Catalog (F-01) และระบุ `productId` พร้อม `quantity`
  3. Client ส่ง `POST /api/orders` โดยส่งเฉพาะ `items[{ productId, quantity }]` ห้ามส่งราคา (`unitPrice`) หรือยอดรวม (`totalAmount`) จาก Client
  4. API Layer ตรวจสอบ Payload เบื้องต้น แล้วเรียก F-03 Server-side Stock & Pricing Engine ภายใต้ Database Transaction
  5. F-03 ตรวจสอบสต็อก, ตัดสต็อก, ดึงราคาจากฐานข้อมูล, คำนวณ `totalAmount` ฝั่ง Server และสร้าง `Order` + `OrderItem`
  6. ระบบบันทึก Order ด้วยสถานะเริ่มต้น `PENDING` และส่งคืน `201 Created` พร้อม Order ที่สร้างสำเร็จ
  7. Sprint 1 ไม่มีการเรียก Payment Gateway จริง; สถานะ `PAID` จะถูกเปลี่ยนโดย Admin ผ่าน F-04 ตาม Lifecycle เท่านั้น

- **Dependencies:**
  - F-01 Product Catalog Browsing สำหรับแสดงสินค้าและสต็อกล่าสุด
  - F-03 Server-side Stock & Pricing Engine สำหรับ Stock Validation, Price Snapshot และ Transaction
  - F-05 Role-Based Access Control & Auth สำหรับยืนยันตัวตนและระบุ `userId`/`role`
  - PostgreSQL + Prisma Schema baseline (`User`, `Product`, `Order`, `OrderItem`)
  - Seed Script (`prisma/seed.ts`) ตาม Assumption-01 สำหรับ Test Accounts และสินค้าตั้งต้น

- **Business Rules & Validation:**
  - **BR-02:** Server ต้องเป็นผู้กำหนด `unitPrice` และ `totalAmount` ทั้งหมด โดยดึง `Product.price` ณ เวลาที่สร้าง Order และ Snapshot ลง `OrderItem.unitPrice`
  - **BR-02:** หาก Request มีฟิลด์ราคาจาก Client (`unitPrice`, `totalAmount`, `price`, หรือฟิลด์ราคาอื่นใน Item) ระบบต้องปฏิเสธด้วย `400 CLIENT_PRICE_NOT_ALLOWED` และต้องไม่สร้าง Order
  - **BR-01 (delegated to F-03):** `quantity` ต้องเป็น Integer มากกว่า 0 และต้องไม่เกิน `Product.stockQuantity` ณ เวลาที่ทำ Transaction
  - `items` ต้องเป็น Array ที่มีอย่างน้อย 1 รายการ และต้องไม่มี `productId` ซ้ำใน Request เดียว (Contract-level validation เพื่อให้ผลลัพธ์ deterministic)
  - `productId` ต้องมีอยู่จริงในฐานข้อมูล; หากไม่พบต้องคืน `404 PRODUCT_NOT_FOUND`
  - `userId` ต้องมาจาก JWT เท่านั้น; หาก Body มี `userId` และไม่ตรงกับ JWT ต้องคืน `403 FORBIDDEN_RESOURCE`
  - Order ที่สร้างใหม่ต้องมีสถานะ `PENDING` เท่านั้น; Client ไม่สามารถกำหนด `status` เองได้; หากส่ง `status` มาใน Request ต้องปฏิเสธด้วย `400 VALIDATION_ERROR`
  - ค่าเงินต้องใช้ `Decimal(10,2)` และคำนวณฝั่ง Server เท่านั้น; ห้ามใช้ Floating Point ในการคำนวณราคา

- **Failure / Boundary Cases:**
  - `items` ว่างหรือไม่ใช่ Array → `400 VALIDATION_ERROR`
  - `quantity = 0`, `quantity < 0`, หรือไม่ใช่ Integer → `400 VALIDATION_ERROR` (BR-01)
  - `productId` ซ้ำใน Request → `400 DUPLICATE_ITEM`
  - `productId` ไม่มีในฐานข้อมูล → `404 PRODUCT_NOT_FOUND`
  - `quantity > stockQuantity` → `409 INSUFFICIENT_STOCK` และต้องไม่มีการตัดสต็อกหรือสร้าง Order
  - `quantity = stockQuantity` → สำเร็จ และสต็อกเหลือ `0` (Boundary ที่ถูกต้อง)
  - Client ส่ง `unitPrice`/`totalAmount` → `400 CLIENT_PRICE_NOT_ALLOWED` (BR-02)
  - Client ส่ง `status` มาใน Request → `400 VALIDATION_ERROR`; Server ต้องกำหนด `PENDING` เท่านั้น
  - ไม่มี Cookie หรือ JWT ไม่ถูกต้อง/หมดอายุ → `401 UNAUTHORIZED`
  - Login ด้วย Role `ADMIN` แล้วเรียก `POST /api/orders` → `403 FORBIDDEN_ROLE`
  - มีการแก้ไข `userId` ใน Body เพื่อสร้าง Order แทนผู้อื่น → `403 FORBIDDEN_RESOURCE`
  - มี Request พร้อมกันจนสต็อกไม่พอ → Request ที่ชนะได้ `201`, Request ที่แพ้ได้ `409 INSUFFICIENT_STOCK` (ประสานงานกับ F-03/NFR-02)
  - Database Error ระหว่างสร้าง Order → `500 INTERNAL_ERROR`, Transaction ต้อง Rollback ทั้งหมด และไม่มี Order/Stock เปลี่ยนแปลง

- **Permissions:**
  - **Customer:** Permitted เฉพาะการสร้าง Order ของตนเอง (`userId` จาก JWT)
  - **Admin:** Denied `403 Forbidden` สำหรับ `POST /api/orders` ตาม Access Matrix ใน System SDS
  - **Unauthenticated:** Denied `401 Unauthorized`
  - **Data Isolation:** Customer ต้องไม่สามารถสร้าง Order แทน Customer ท่านอื่นได้

## 2. Technical Specification

- **UI Behavior:**
  - เพิ่ม Order Form ในหน้า Catalog/Product Detail หรือหน้า Checkout สำหรับ Sprint 1 (ยังไม่มี Persistent Cart ซึ่งเป็น Scope ของ Sprint 2)
  - แสดงชื่อสินค้า, ราคาต่อหน่วย, สต็อกคงเหลือ และช่องกรอก `quantity`
  - แสดงยอดรวมเป็น Preview ฝั่ง Client ได้ แต่ต้องระบุว่าเป็นเพียงการแสดงผล; ยอดจริงมาจาก Response ของ Server
  - ปุ่ม Submit ต้องถูก Disable ระหว่าง Request เพื่อป้องกัน Double Submit
  - เมื่อสำเร็จ: แสดง Confirmation พร้อม Order ID, สถานะ `PENDING` และยอดรวมจาก Server แล้ว Redirect ไปยัง Order Detail/Confirmation Page
  - เมื่อ `409 INSUFFICIENT_STOCK`: แสดงข้อความสต็อกไม่พอ, Refresh ข้อมูลสต็อกจาก F-01 และไม่ล้างรายการที่เลือกทั้งหมด
  - เมื่อ `401`: Redirect ไปหน้า Login; เมื่อ `403`: แสดงข้อความไม่มีสิทธิ์และไม่แสดงปุ่มสั่งซื้อสำหรับ Admin

- **API Methods & Paths:**
  - `POST /api/orders` — Protected Endpoint (Customer เท่านั้น)
  - Dependency ที่มีอยู่แล้ว: `GET /api/products` (F-01) สำหรับดึงข้อมูลสินค้าและสต็อก
  - ไม่มี Public Endpoint ใหม่สำหรับ F-02 นอกเหนือจาก `POST /api/orders`

- **Request, Response & Error Shapes:** (JSON)

  **Request — `POST /api/orders`**
  ```json
  {
    "items": [
      { "productId": "c4f1c2f0-8d8a-4f4e-9f0e-2f7a6b1c9d01", "quantity": 2 },
      { "productId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", "quantity": 1 }
    ]
  }
  ```

  **Response — `201 Created`**
  ```json
  {
    "data": {
      "id": "0f9e8d7c-6b5a-4c3d-2e1f-0a9b8c7d6e5f",
      "userId": "7d6c5b4a-3e2f-4a1b-9c8d-7e6f5a4b3c2d",
      "status": "PENDING",
      "totalAmount": "350.00",
      "items": [
        {
          "productId": "c4f1c2f0-8d8a-4f4e-9f0e-2f7a6b1c9d01",
          "quantity": 2,
          "unitPrice": "125.00"
        },
        {
          "productId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
          "quantity": 1,
          "unitPrice": "100.00"
        }
      ],
      "createdAt": "2026-11-09T10:00:00.000Z"
    }
  }
  ```

  **Error Shape**
  ```json
  {
    "error": {
      "code": "INSUFFICIENT_STOCK",
      "message": "Insufficient stock for product c4f1c2f0-8d8a-4f4e-9f0e-2f7a6b1c9d01",
      "details": [
        {
          "productId": "c4f1c2f0-8d8a-4f4e-9f0e-2f7a6b1c9d01",
          "requested": 5,
          "available": 3
        }
      ]
    }
  }
  ```

  **Error Codes ที่กำหนด**
  | HTTP Status | Error Code | Condition |
  | :--- | :--- | :--- |
  | 400 | `VALIDATION_ERROR` | Payload ไม่ถูกต้อง, `items` ว่าง, `quantity` ไม่ถูกต้อง |
  | 400 | `DUPLICATE_ITEM` | มี `productId` ซ้ำใน Request |
  | 400 | `CLIENT_PRICE_NOT_ALLOWED` | Client ส่งฟิลด์ราคาหรือยอดรวมมา |
  | 401 | `UNAUTHORIZED` | ไม่มี JWT หรือ JWT ไม่ถูกต้อง/หมดอายุ |
  | 403 | `FORBIDDEN_ROLE` | Role ไม่ใช่ Customer |
  | 403 | `FORBIDDEN_RESOURCE` | พยายามสร้าง Order แทน `userId` อื่น |
  | 404 | `PRODUCT_NOT_FOUND` | `productId` ไม่มีในฐานข้อมูล |
  | 409 | `INSUFFICIENT_STOCK` | `quantity` มากกว่าสต็อก ณ เวลา Transaction |
  | 500 | `INTERNAL_ERROR` | Database/Transaction Error ที่ไม่คาดคิด |

  หมายเหตุ: `Decimal` ถูก Serialize เป็น String เพื่อรักษาความแม่นยำของราคา

- **Data Fields, Constraints & Migrations:**
  - **Schema/Migration: No change needed for this layer.** ใช้ Schema baseline จาก System SDS; ไม่มีการเพิ่มตารางหรือคอลัมน์ใหม่สำหรับ F-02
  - `Order`: `id` (UUID), `userId` (FK → `User.id`), `totalAmount` (`Decimal(10,2)`), `status` (`OrderStatus`, default `PENDING`), `createdAt`, `updatedAt`
  - `OrderItem`: `id` (UUID), `orderId` (FK → `Order.id`, `onDelete: Cascade`), `productId` (FK → `Product.id`), `quantity` (`Int`), `unitPrice` (`Decimal(10,2)`)
  - Constraint: `quantity` ต้องเป็น Integer > 0 (Application-level validation ร่วมกับ F-03)
  - Constraint: `unitPrice` ต้องเป็น Snapshot จาก `Product.price` ณ เวลาสร้าง Order และต้องไม่ถูกแก้ไขย้อนหลังเมื่อราคาสินค้าเปลี่ยน
  - Constraint: `totalAmount = SUM(OrderItem.quantity × OrderItem.unitPrice)` และคำนวณฝั่ง Server เท่านั้น
  - ไม่มีตาราง `Cart` ใน Sprint 1 เนื่องจาก Cart Management ถูกจัดสรรใน Sprint 2

## 3. Acceptance Criteria (AC)

| AC ID | Observable Expected Outcome | Relevant Negative / Boundary Behavior | Role Restrictions |
| :--- | :--- | :--- | :--- |
| **AC-02** | Customer ที่ Login แล้วส่ง Order ที่ถูกต้องได้รับ `201 Created`, Order มีสถานะ `PENDING`, `totalAmount` คำนวณจากราคาในฐานข้อมูล, `OrderItem.unitPrice` เป็น Snapshot และสต็อกลดลงตามจำนวน | `items` ว่าง → `400`; `quantity > stock` → `409`; ไม่มี Token → `401`; Admin → `403` | Customer เท่านั้น; Admin และ Unauthenticated ถูกปฏิเสธ |
| **AC-02.1** | Payload ที่ถูกต้องผ่าน Validation และสร้าง Order ได้เมื่อ `productId` มีอยู่จริงและ `quantity` เป็น Integer > 0 | `quantity = 0`, ติดลบ, ทศนิยม, `productId` ซ้ำ, `items` ไม่ใช่ Array → `400`; `productId` ไม่มี → `404`; ต้องไม่มีการเขียนฐานข้อมูลเมื่อ Validation ล้มเหลว | Customer เท่านั้น |
| **AC-02.2** | ระบบใช้ราคาจากฐานข้อมูลและไม่ยอมรับราคาจาก Client | Client ส่ง `unitPrice` หรือ `totalAmount` → `400 CLIENT_PRICE_NOT_ALLOWED`; ต้องไม่มี Order ถูกสร้าง | Customer เท่านั้น |
| **AC-02.3** | ระบบระบุตัวตนจาก JWT Cookie และผูก Order กับ `userId` ของผู้ใช้ที่ Login | Body `userId` ไม่ตรงกับ JWT → `403 FORBIDDEN_RESOURCE`; ไม่มี/หมดอายุ/แก้ไข Token → `401`; Admin → `403` | Customer เท่านั้น; ห้ามสร้างแทนผู้อื่น |
| **AC-02.4** | Boundary ของสต็อกทำงานถูกต้อง: `quantity = stockQuantity` สั่งซื้อสำเร็จและสต็อกเหลือ `0`; Multiple Items ถูกตัดสต็อกแบบ All-or-Nothing | `quantity = stockQuantity + 1` → `409`; Multiple Items ที่มีรายการหนึ่งสต็อกไม่พอ → ทั้ง Request ถูก Rollback | Customer เท่านั้น |
| **AC-02.5** | Sprint 1 สร้าง Order สถานะ `PENDING` โดยไม่เรียก Real Payment Gateway และไม่มีฟิลด์ Payment ใน Response | Client กำหนด `status` → `400 VALIDATION_ERROR`; Client ส่ง `totalAmount` → `400 CLIENT_PRICE_NOT_ALLOWED`; ไม่มีการเปลี่ยนสถานะเป็น `PAID` อัตโนมัติ | Customer เท่านั้น; การเปลี่ยนสถานะเป็น `PAID` เป็นสิทธิ์ของ Admin ผ่าน F-04 |

## 4. Software Test Specification (STS)

| Test ID | Linked AC | Test Level | Precondition / Input | Action | Expected Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **STS-F02-01** | AC-02 | API Integration | Seed Customer, Product A ราคา `125.00` สต็อก `10`; Login แล้ว | ส่ง `POST /api/orders` ด้วย Product A จำนวน `2` | `201 Created`; `status = PENDING`; `totalAmount = "250.00"`; `OrderItem.unitPrice = "125.00"`; สต็อก Product A เหลือ `8`; Order ผูกกับ `userId` จาก JWT |
| **STS-F02-02** | AC-02, AC-02.1 | API Integration (Negative) | Seed Customer และ Product; Login แล้ว | ส่ง `items: []`, `quantity: 0`, `quantity: -1`, `quantity: 1.5`, `items` ไม่ใช่ Array, และ `productId` ซ้ำ ตามลำดับ | ทุกกรณีได้ `400` (`VALIDATION_ERROR` หรือ `DUPLICATE_ITEM`); ไม่มี Order/OrderItem ใหม่; สต็อกไม่เปลี่ยน |
| **STS-F02-03** | AC-02.1 | API Integration (Negative) | Seed Customer; Login แล้ว | ส่ง `POST /api/orders` ด้วย `productId` ที่ไม่มีในฐานข้อมูล | `404 PRODUCT_NOT_FOUND`; ไม่มี Order ถูกสร้าง; สต็อกไม่เปลี่ยน |
| **STS-F02-04** | AC-02.2, AC-02.5 | API Integration (Negative) | Seed Customer, Product ราคา `125.00`; Login แล้ว | ส่ง Request ที่มี `unitPrice: "1.00"` หรือ `totalAmount: "1.00"` ใน Item/Body; และอีกกรณีส่ง `status: "PAID"` | ราคา → `400 CLIENT_PRICE_NOT_ALLOWED`; `status` → `400 VALIDATION_ERROR`; ไม่มี Order ถูกสร้าง; ราคาในฐานข้อมูลไม่ถูกแก้ไข |
| **STS-F02-05** | AC-02.3 | Security / API Integration (Negative) | ไม่มี Cookie; และอีกกรณี Login เป็น Admin; และอีกกรณี Customer ส่ง `userId` ของผู้อื่น | เรียก `POST /api/orders` | ไม่มี Cookie → `401 UNAUTHORIZED`; Admin → `403 FORBIDDEN_ROLE`; `userId` ไม่ตรง JWT → `403 FORBIDDEN_RESOURCE`; ไม่มี Order ถูกสร้างในทุกกรณี |
| **STS-F02-06** | AC-02.3 | Security / API Integration (Negative) | Customer มี JWT ที่หมดอายุ, JWT ที่ถูกแก้ไข Signature, และ JWT ที่ไม่มีอยู่ใน Cookie | เรียก `POST /api/orders` | ทุกกรณีได้ `401 UNAUTHORIZED`; ไม่มี Order ถูกสร้าง |
| **STS-F02-07** | AC-02.4 | DB Integration / Boundary | Seed Product B สต็อก `5`; Login เป็น Customer | ส่ง Order Product B จำนวน `5` | `201 Created`; สต็อกเหลือ `0`; `totalAmount` ถูกต้อง; OrderItem ถูกสร้างครบ |
| **STS-F02-08** | AC-02.4 | DB Integration (Negative) | Seed Product B สต็อก `5`; Login เป็น Customer | ส่ง Order Product B จำนวน `6` | `409 INSUFFICIENT_STOCK`; ไม่มี Order; สต็อกยังเป็น `5` |
| **STS-F02-09** | AC-02.4 | DB Integration (Negative / Atomicity) | Seed Product C สต็อก `10`, Product D สต็อก `1`; Login เป็น Customer | ส่ง Order ที่มี Product C จำนวน `2` และ Product D จำนวน `2` | `409 INSUFFICIENT_STOCK`; ไม่มี Order/OrderItem ใหม่; สต็อก Product C และ D ไม่เปลี่ยน (All-or-Nothing) |
| **STS-F02-10** | AC-02.5 | API Integration / E2E | Seed Customer, Product; Login แล้ว; ตั้ง Spy/Mock ยืนยันว่าไม่มีการเรียก External Payment Gateway | ส่ง Order ที่ถูกต้อง | `201 Created`; `status = PENDING`; Response ไม่มีฟิลด์ Payment; ไม่มี External Payment Call; ไม่มีการเปลี่ยนสถานะเป็น `PAID` |
| **STS-F02-11** | AC-02, AC-02.4 | Concurrency / DB Integration | Seed Product E สต็อก `1`; Login เป็น Customer 2 คน | ยิง `POST /api/orders` พร้อมกันสำหรับ Product E จำนวน `1` ทั้งสอง Request | มีเพียง 1 Request ที่ได้ `201`; อีก Request ได้ `409 INSUFFICIENT_STOCK`; สต็อกสุดท้ายเป็น `0`; มี Order เพียง 1 รายการ (ประสานงาน F-03/NFR-02) |
| **STS-F02-12** | AC-02 | API Integration (Negative / Rollback) | Seed Customer, Product; Login แล้ว; จำลอง Database Error ระหว่างสร้าง `OrderItem` | ส่ง Order ที่ผ่าน Validation | ได้ `500 INTERNAL_ERROR`; Transaction Rollback; ไม่มี Order/OrderItem ค้าง; สต็อกไม่ถูกตัด |

## 5. Completion Evidence
- **TDD Evidence:**
  - Red Phase (Failing Tests): https://github.com/supxrpoxm/cpe334-food-ordering/commit/a3f67a7
  - Green Phase (Passing Implementation): https://github.com/supxrpoxm/cpe334-food-ordering/commit/72e50da
- **Merged PR:** [รอใส่ลิงก์ GitHub PR หลังเพื่อนกด Merge เข้า staging]
