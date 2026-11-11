# Feature Contract: F-03 Server-side Stock & Pricing Engine

## 1. Feature Design & Business Rules

- **Linked Requirements:** BR-01 (primary; traceability: BR-01 → F-03 → AC-04 / TEST-04), BR-02 (primary; traceability: BR-02 → F-03 → AC-05 / TEST-05), NFR-02 (primary; traceability: NFR-02 → F-03 → AC-08 / TEST-08), FR-02 (ผู้เรียกใช้ Engine ผ่าน Order Creation), FR-01 (ความสอดคล้องของสต็อกที่แสดงใน Catalog), NFR-01 (Engine ถูกเรียกได้เฉพาะผ่าน Protected Order Path), Decision-01 (Prisma ORM + PostgreSQL), Decision-03 (Order เริ่มต้นสถานะ PENDING)

- **Behavior & Workflow:**
  1. F-02 API Layer รับ Request ที่ผ่าน Authentication แล้ว และส่งเฉพาะ `items[{ productId, quantity }]` เข้าสู่ F-03
  2. F-03 เปิด Prisma Interactive Transaction (`prisma.$transaction`)
  3. ภายใน Transaction: ตรวจสอบ Payload ซ้ำอีกชั้น (Defense in Depth) ว่า `quantity` เป็น Integer > 0 และไม่มี `productId` ซ้ำ
  4. โหลดข้อมูล `Product` ที่จำเป็นจากฐานข้อมูล เพื่อยืนยันว่าสินค้ามีอยู่จริงและเพื่ออ่านราคาปัจจุบัน
  5. ทำ Atomic Stock Decrement ด้วย Conditional Update (`updateMany` โดยมีเงื่อนไข `stockQuantity >= quantity`) หรือ Row Lock (`SELECT ... FOR UPDATE`) ภายใน Transaction; หาก Update ไม่สำเร็จเพราะสต็อกไม่พอ ให้ Throw Business Error และ Rollback
  6. คำนวณ `unitPrice` จาก `Product.price` ในฐานข้อมูล และคำนวณ `totalAmount = SUM(quantity × unitPrice)` ด้วย `Decimal`
  7. สร้าง `Order` (สถานะ `PENDING`) และ `OrderItem` ทุกรายการพร้อม Snapshot `unitPrice`
  8. Commit Transaction เมื่อทุกขั้นตอนสำเร็จ; หากขั้นตอนใดล้มเหลว ให้ Rollback ทั้งหมด
  9. ส่งผลลัพธ์กลับให้ F-02 เพื่อแปลงเป็น HTTP Response

- **Dependencies:**
  - F-02 Customer Order Placement (ผู้เรียกใช้ Engine และผู้ Map Error เป็น HTTP Status)
  - F-05 Role-Based Access Control & Auth (รับประกันว่าผู้เรียกเป็น Customer ที่ผ่านการยืนยันตัวตน)
  - F-01 Product Catalog Browsing (แหล่งข้อมูลสินค้าและสต็อกที่ผู้ใช้เห็น)
  - Prisma Client และ PostgreSQL (`Product`, `Order`, `OrderItem`)
  - Decimal Arithmetic ของ Prisma/PostgreSQL สำหรับการคำนวณเงิน

- **Business Rules & Validation:**
  - **BR-01:** `quantity` ต้องเป็น Integer และ `quantity > 0`; หาก `quantity <= 0` หรือไม่ใช่ Integer ต้องปฏิเสธด้วย `400 VALIDATION_ERROR`
  - **BR-01:** `quantity` ต้องไม่เกิน `Product.stockQuantity` ณ เวลาที่ทำ Transaction; หากเกินต้องปฏิเสธด้วย `409 INSUFFICIENT_STOCK`
  - **BR-01:** สต็อกต้องไม่ติดลบในทุกกรณี; การตัดสต็อกต้องเป็น Atomic Operation ภายใน Transaction
  - **BR-02:** `unitPrice` ต้องถูกอ่านจาก `Product.price` ในฐานข้อมูลเท่านั้น; ห้ามใช้ราคาจาก Client
  - **BR-02:** `totalAmount` ต้องคำนวณฝั่ง Server ด้วย `Decimal` และบันทึกเป็น `Decimal(10,2)`; ห้ามใช้ Floating Point
  - **BR-02:** `OrderItem.unitPrice` เป็น Snapshot ณ เวลาสร้าง Order; การเปลี่ยนราคาสินค้าภายหลังต้องไม่กระทบ Order เดิม
  - **NFR-02:** การตรวจสอบสต็อก, การตัดสต็อก, การสร้าง `Order` และ `OrderItem` ต้องอยู่ใน Transaction เดียวกันแบบ All-or-Nothing
  - **NFR-02:** ต้องป้องกัน Race Condition ด้วย Atomic Conditional Update หรือ Row Lock; ห้ามใช้รูปแบบ Read-then-Write ที่ไม่มี Lock
  - **Contract-level:** `productId` ต้องไม่ซ้ำภายใน Request; หากซ้ำให้ปฏิเสธด้วย `400 DUPLICATE_ITEM` (F-02 ตรวจชั้นแรก และ F-03 ตรวจซ้ำเพื่อ Defense in Depth)
  - **Contract-level:** `productId` ต้องมีอยู่จริง; หากไม่พบให้ปฏิเสธด้วย `404 PRODUCT_NOT_FOUND`

- **Failure / Boundary Cases:**
  - `quantity = 0`, `quantity < 0`, `quantity` เป็นทศนิยม หรือไม่ใช่ตัวเลข → `400 VALIDATION_ERROR`; ไม่มีการตัดสต็อก
  - `quantity = stockQuantity` → สำเร็จ และสต็อกเหลือ `0` (Boundary ที่ถูกต้อง)
  - `quantity = stockQuantity + 1` → `409 INSUFFICIENT_STOCK`; ไม่มีการตัดสต็อกหรือสร้าง Order
  - `stockQuantity = 0` และมีคำสั่งซื้อ → `409 INSUFFICIENT_STOCK`
  - `productId` ไม่มีในฐานข้อมูล → `404 PRODUCT_NOT_FOUND`
  - มี Request พร้อมกัน 2 รายการสำหรับสินค้าเดียวกันที่สต็อกเหลือ `1` → สำเร็จเพียง 1 รายการ, อีก รายการได้ `409`; สต็อกสุดท้ายต้องเป็น `0` และต้องไม่มี Oversell
  - Multiple Items ที่รายการใดรายการหนึ่งสต็อกไม่พอ → Rollback ทั้ง Transaction; สต็อกของทุกรายการต้องไม่เปลี่ยน
  - Database Error ระหว่างสร้าง `Order` หรือ `OrderItem` → Rollback ทั้งหมด; ต้องไม่มี Order/OrderItem ค้าง และสต็อกต้องไม่ถูกตัด
  - ราคาสินค้าถูกเปลี่ยนหลังสร้าง Order → `OrderItem.unitPrice` และ `Order.totalAmount` ของ Order เดิมต้องคงเดิม
  - Client พยายามส่งราคา → ถูกปฏิเสธก่อนถึง Engine ด้วย `400 CLIENT_PRICE_NOT_ALLOWED` จาก F-02; Engine ต้องไม่ใช้ค่านี้แม้จะหลุดเข้ามา
  - ค่า `totalAmount` เกินขอบเขต `Decimal(10,2)` → ปฏิเสธด้วย `400 AMOUNT_OUT_OF_RANGE` และ Rollback (Contract-level boundary)

- **Permissions:**
  - **System (Backend Engine):** ทำงานภายใน Server เท่านั้น; ไม่มี Public Endpoint โดยตรง
  - **Customer:** เรียกใช้ทางอ้อมผ่าน `POST /api/orders` ของ F-02 หลังผ่าน F-05
  - **Admin:** ไม่สามารถเรียกใช้ Engine ผ่าน `POST /api/orders` ได้ (`403 Forbidden` ตาม Access Matrix)
  - **Unauthenticated:** ไม่สามารถเข้าถึง Path ที่ทำให้เกิดการตัดสต็อกได้ (`401 Unauthorized`)

## 2. Technical Specification

- **UI Behavior:**
  - **No change needed for this layer.** F-03 เป็น Backend Engine ไม่มี UI โดยตรง; UI ทั้งหมดเป็นความรับผิดชอบของ F-02 และ F-01

- **API Methods & Paths:**
  - **No change needed for this layer.** ไม่มี Public API Endpoint ใหม่; F-03 ถูกเรียกใช้ภายในผ่าน Service Layer ของ `POST /api/orders` (F-02)
  - Internal Contract: `createOrderWithStockAndPricing({ userId, items })`
  - Error ที่ Engine โยนออกมาจะถูก Map เป็น HTTP Status โดย F-02 ตามตาราง Error Codes

- **Request, Response & Error Shapes:** (JSON)

  **Internal Input — `createOrderWithStockAndPricing`**
  ```json
  {
    "userId": "7d6c5b4a-3e2f-4a1b-9c8d-7e6f5a4b3c2d",
    "items": [
      { "productId": "c4f1c2f0-8d8a-4f4e-9f0e-2f7a6b1c9d01", "quantity": 2 }
    ]
  }
  ```

  **Internal Success Result**
  ```json
  {
    "orderId": "0f9e8d7c-6b5a-4c3d-2e1f-0a9b8c7d6e5f",
    "userId": "7d6c5b4a-3e2f-4a1b-9c8d-7e6f5a4b3c2d",
    "status": "PENDING",
    "totalAmount": "250.00",
    "items": [
      {
        "productId": "c4f1c2f0-8d8a-4f4e-9f0e-2f7a6b1c9d01",
        "quantity": 2,
        "unitPrice": "125.00"
      }
    ]
  }
  ```

  **Internal Business Error**
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

  **Error Codes ที่ Engine ต้องสร้าง**
  | Error Code | HTTP Status (Map โดย F-02) | Condition |
  | :--- | :--- | :--- |
  | `VALIDATION_ERROR` | 400 | `quantity` ไม่ถูกต้อง หรือ Payload ผิดรูปแบบ |
  | `DUPLICATE_ITEM` | 400 | `productId` ซ้ำใน Request |
  | `CLIENT_PRICE_NOT_ALLOWED` | 400 | ตรวจพบราคาจาก Client (Defense in Depth) |
  | `AMOUNT_OUT_OF_RANGE` | 400 | `totalAmount` เกิน `Decimal(10,2)` |
  | `PRODUCT_NOT_FOUND` | 404 | `productId` ไม่มีในฐานข้อมูล |
  | `INSUFFICIENT_STOCK` | 409 | `quantity` มากกว่าสต็อก ณ เวลา Transaction |
  | `INTERNAL_ERROR` | 500 | Database/Transaction Error ที่ไม่คาดคิด |

- **Data Fields, Constraints & Migrations:**
  - **Schema/Migration: No change needed for this layer.** ใช้ Schema baseline จาก System SDS โดยไม่มีการเพิ่มตารางหรือคอลัมน์ใหม่ใน Sprint 1
  - `Product.stockQuantity` (`Int`): ถูกอ่านและลดภายใน Transaction; Application-level Invariant คือต้อง `>= 0`
  - `Product.price` (`Decimal(10,2)`): แหล่งข้อมูลราคาเพียงแหล่งเดียวสำหรับ `unitPrice`
  - `Order.totalAmount` (`Decimal(10,2)`): คำนวณจาก `SUM(quantity × unitPrice)` ฝั่ง Server
  - `OrderItem.quantity` (`Int`): ต้องเป็น Integer > 0
  - `OrderItem.unitPrice` (`Decimal(10,2)`): Snapshot ราคา ณ เวลาสร้าง Order; ห้ามอัปเดตย้อนหลัง
  - `Order.status` (`OrderStatus`): Engine กำหนดเป็น `PENDING` เท่านั้น
  - Transaction Scope: ครอบคลุม Stock Decrement + Order Insert + OrderItem Insert ทั้งหมด
  - ไม่มีการเพิ่ม Database Check Constraint ใน Sprint 1 ตาม Schema ที่ระบุใน System SDS; การรักษา Invariant ทำที่ Application Layer

## 3. Acceptance Criteria (AC)

| AC ID | Observable Expected Outcome | Relevant Negative / Boundary Behavior | Role Restrictions |
| :--- | :--- | :--- | :--- |
| **AC-04** | Engine ตรวจสอบสต็อกก่อนสร้าง Order และปฏิเสธเมื่อ `quantity` มากกว่าสต็อก โดยไม่มีการตัดสต็อกหรือสร้าง Order | `quantity > stock` → `409 INSUFFICIENT_STOCK`; `stock = 0` → `409`; `quantity = stock` → สำเร็จและสต็อกเหลือ `0`; `quantity <= 0` → `400` | ถูกเรียกได้เฉพาะผ่าน Customer Order Path; Admin/Unauthenticated ถูกปฏิเสธก่อนถึง Engine |
| **AC-04.1** | การตรวจสอบและตัดสต็อกเป็น Atomic และป้องกัน Oversell ภายใต้การเรียกพร้อมกัน | สต็อก `1` มี 2 Request พร้อมกัน → สำเร็จ 1, `409` 1; สต็อกสุดท้าย `0`; ไม่มีค่าสต็อกติดลบ | Customer เท่านั้น (ผ่าน F-02) |
| **AC-05** | `unitPrice` ถูกดึงจากฐานข้อมูล, `totalAmount` คำนวณฝั่ง Server ด้วย `Decimal` และ `OrderItem.unitPrice` ถูก Snapshot ณ เวลาสร้าง Order | Client ส่งราคา → `400 CLIENT_PRICE_NOT_ALLOWED`; Multiple Items คำนวณยอดรวมถูกต้อง; ราคาที่เปลี่ยนภายหลังไม่กระทบ Order เดิม | Customer เท่านั้น (ผ่าน F-02) |
| **AC-05.1** | ราคาและยอดรวมของ Order เดิมไม่เปลี่ยนแปลงเมื่อราคาสินค้าในฐานข้อมูลถูกแก้ไขภายหลัง | เปลี่ยน `Product.price` หลังสร้าง Order → `OrderItem.unitPrice` และ `Order.totalAmount` ของ Order เดิมต้องคงเดิม; Order ใหม่ใช้ราคาใหม่ | Customer เท่านั้นสำหรับการสร้าง Order; Admin ไม่สามารถแก้ราคา Order ย้อนหลังผ่าน F-03 |
| **AC-08** | Stock Decrement, Order Insert และ OrderItem Insert ถูก Commit หรือ Rollback พร้อมกันแบบ All-or-Nothing | จำลอง Error ระหว่างสร้าง `OrderItem` → ไม่มี Order/OrderItem ค้างและสต็อกไม่ถูกตัด; Multiple Items ที่รายการหนึ่งล้มเหลว → ทุกรายการ Rollback | Customer เท่านั้น (ผ่าน F-02) |
| **AC-08.1** | Transaction Isolation ป้องกัน Race Condition และข้อมูลไม่สอดคล้องกันเมื่อมีคำสั่งซื้อพร้อมกัน | Concurrent Requests บนสินค้าเดียวกันต้องไม่ทำให้สต็อกติดลบหรือมี Order เกินสต็อก; Request ที่แพ้ต้องได้ `409` | Customer เท่านั้น (ผ่าน F-02) |

## 4. Software Test Specification (STS)

| Test ID | Linked AC | Test Level | Precondition / Input | Action | Expected Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **STS-F03-01** | AC-04 | DB Integration (Negative) | Product A `stockQuantity = 3`, `price = 125.00`; Customer ที่ผ่าน Auth | เรียก Engine ด้วย `quantity = 4` | ได้ `INSUFFICIENT_STOCK` (Map เป็น `409`); ไม่มี Order/OrderItem; `stockQuantity` ยังเป็น `3` |
| **STS-F03-02** | AC-04 | DB Integration / Boundary | Product A `stockQuantity = 3`; Customer ที่ผ่าน Auth | เรียก Engine ด้วย `quantity = 3` | สำเร็จ; `stockQuantity = 0`; Order มี `totalAmount = "375.00"`; OrderItem `unitPrice = "125.00"` |
| **STS-F03-03** | AC-04 | Unit / DB Integration (Negative) | Product A มีสต็อก; Customer ที่ผ่าน Auth | เรียก Engine ด้วย `quantity = 0`, `-1`, `1.5`, `"2"` ตามลำดับ | ทุกกรณีได้ `VALIDATION_ERROR` (Map เป็น `400`); ไม่มีการตัดสต็อกหรือสร้าง Order |
| **STS-F03-04** | AC-04.1 | Concurrency / DB Integration | Product B `stockQuantity = 1`; Customer 2 คนผ่าน Auth | ยิง Engine พร้อมกัน 2 Request ด้วย `quantity = 1` | สำเร็จ 1 รายการ; อีก 1 รายการได้ `INSUFFICIENT_STOCK`; `stockQuantity = 0`; มี Order 1 รายการ; ไม่มี Oversell |
| **STS-F03-05** | AC-05 | DB Integration | Product A `price = 125.00`, Product B `price = 100.00`; Customer ที่ผ่าน Auth | เรียก Engine ด้วย Product A จำนวน `2` และ Product B จำนวน `1` | `totalAmount = "350.00"`; `unitPrice` ของแต่ละ OrderItem ตรงกับราคาใน DB; ไม่มี Client Price ถูกใช้ |
| **STS-F03-06** | AC-05 | Unit / Integration (Negative) | Product A `price = 125.00`; Request มี `unitPrice: "1.00"` หรือ `totalAmount: "1.00"` | เรียก Engine โดยตรง (Defense in Depth) | ได้ `CLIENT_PRICE_NOT_ALLOWED` (Map เป็น `400`); ไม่มี Order; ราคาใน DB ไม่เปลี่ยน |
| **STS-F03-07** | AC-05.1 | DB Integration | สร้าง Order สำหรับ Product A ที่ `price = 125.00` สำเร็จ; จากนั้น Admin/Seed เปลี่ยน `Product.price = 150.00` | อ่าน Order เดิม และสร้าง Order ใหม่สำหรับ Product A | Order เดิมยังมี `unitPrice = "125.00"` และ `totalAmount` เดิม; Order ใหม่ใช้ `unitPrice = "150.00"` |
| **STS-F03-08** | AC-08 | DB Integration (Negative / Rollback) | Product A `stockQuantity = 10`; Customer ที่ผ่าน Auth; จำลอง Error ระหว่างสร้าง `OrderItem` รายการที่สอง | เรียก Engine ด้วย Order ที่มี 2 Items | Transaction Rollback; ไม่มี Order/OrderItem ค้าง; `stockQuantity` ของ Product A ยังเป็น `10` |
| **STS-F03-09** | AC-08 | DB Integration (Negative / Atomicity) | Product A `stockQuantity = 10`, Product B `stockQuantity = 1`; Customer ที่ผ่าน Auth | เรียก Engine ด้วย Product A จำนวน `2` และ Product B จำนวน `2` | ได้ `INSUFFICIENT_STOCK`; ไม่มี Order/OrderItem; สต็อก Product A และ B ไม่เปลี่ยน |
| **STS-F03-10** | AC-08.1 | Concurrency / DB Integration | Product C `stockQuantity = 5`; Customer 5 คนผ่าน Auth | ยิง Engine พร้อมกัน 5 Request ด้วย `quantity = 1` | ทั้ง 5 Request สำเร็จ; `stockQuantity = 0`; มี Order 5 รายการ; ไม่มี Oversell และไม่มี Lost Update |
| **STS-F03-11** | AC-04 | DB Integration (Negative) | Customer ที่ผ่าน Auth | เรียก Engine ด้วย `productId` ที่ไม่มีในฐานข้อมูล | ได้ `PRODUCT_NOT_FOUND` (Map เป็น `404`); ไม่มี Order; ไม่มีการตัดสต็อก |
| **STS-F03-12** | AC-05 | Unit (Negative / Boundary) | Product A `price = 99999999.99`; Customer ที่ผ่าน Auth | เรียก Engine ด้วย `quantity` ที่ทำให้ `totalAmount` เกิน `Decimal(10,2)` | ได้ `AMOUNT_OUT_OF_RANGE` (Map เป็น `400`); Transaction Rollback; ไม่มี Order; สต็อกไม่เปลี่ยน |

## 5. Completion Evidence
- **TDD Evidence:**
  - Red Phase (Failing Tests): https://github.com/supxrpoxm/cpe334-food-ordering/commit/a3f67a7
  - Green Phase (Passing Implementation): https://github.com/supxrpoxm/cpe334-food-ordering/commit/72e50da
- **Merged PR:** [รอใส่ลิงก์ GitHub PR หลังเพื่อนกด Merge เข้า staging]
