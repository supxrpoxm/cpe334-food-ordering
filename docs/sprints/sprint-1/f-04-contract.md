# Feature Contract: F-04 Admin Order Status Management

## 1. Feature Design & Business Rules
- **Linked Requirements:** FR-04, BR-04, BR-05, NFR-02
- **Behavior & Workflow:** ผู้ดูแลระบบ (Admin) สามารถดูรายการออเดอร์ทั้งหมด กรองตามสถานะ และทำการอัปเดตสถานะของออเดอร์ (เช่น PENDING -> CONFIRMED -> PREPARING -> READY -> COMPLETED / CANCELLED)
- **Dependencies:** ขึ้นอยู่กับโมเดลข้อมูลคำสั่งซื้อจาก F-02 (Customer Order Placement) และระบบยืนยันตัวตน F-05 (RBAC & Auth)
- **Business Rules & Validation:**
  - เฉพาะผู้ใช้ที่มีบทบาท `ADMIN` หรือ `STAFF` เท่านั้นที่สามารถเปลี่ยนสถานะออเดอร์ได้
  - การเปลี่ยนสถานะต้องเป็นไปตาม State Machine ที่กำหนด ห้ามข้ามขั้นตอนที่ไม่ได้รับอนุญาต
  - หากออเดอร์อยู่ในสถานะ `COMPLETED` หรือ `CANCELLED` แล้ว ห้ามเปลี่ยนสถานะอีก (Terminal State)
- **Failure / Boundary Cases:**
  - ผู้ใช้งานทั่วไป (CUSTOMER) พยายามส่ง Request เปลี่ยนสถานะ: ส่งคืน 403 Forbidden
  - พยายามเปลี่ยนสถานะข้ามขั้น (เช่น จาก PENDING ไป COMPLETED โดยตรง): ส่งคืน 400 Bad Request
  - พยายามเปลี่ยนสถานะออเดอร์ที่ถูกยกเลิกไปแล้ว: ส่งคืน 400 Bad Request
- **Permissions:** เฉพาะบทบาท `ADMIN` และ `STAFF`

## 2. Technical Specification
- **UI Behavior:**
  - หน้าแดชบอร์ด Admin แสดงตารางรายการคำสั่งซื้อเรียงจากใหม่อยู่บนสุด
  - มี Dropdown เปลี่ยนสถานะในแต่ละแถวคำสั่งซื้อ พร้อมปุ่มยืนยัน
  - มี Badge สีแสดงสถานะปัจจุบันอย่างชัดเจน
- **API Methods & Paths:**
  - `GET /api/v1/admin/orders` (ดึงรายการออเดอร์ทั้งหมดสำหรับ Admin)
  - `PATCH /api/v1/admin/orders/:id/status` (อัปเดตสถานะออเดอร์)
- **Request, Response & Error Shapes:**
  - `PATCH /api/v1/admin/orders/:id/status` Request:
    ```json
    {
      "status": "CONFIRMED"
    }
    ```
  - Success (200 OK):
    ```json
    {
      "success": true,
      "data": {
        "orderId": "ord_999",
        "previousStatus": "PENDING",
        "currentStatus": "CONFIRMED",
        "updatedAt": "2026-11-10T00:00:00.000Z"
      }
    }
    ```
  - Error (400 Bad Request - Invalid Transition):
    ```json
    {
      "success": false,
      "error": {
        "code": "INVALID_STATUS_TRANSITION",
        "message": "ไม่สามารถเปลี่ยนสถานะจาก PENDING เป็น COMPLETED โดยตรงได้"
      }
    }
    ```
- **Data Fields, Constraints & Migrations:**
  - อัปเดตคอลัมน์ `status` และ `updatedAt` ในตาราง `Order`
  - บันทึก Audit Log การเปลี่ยนสถานะในตาราง `OrderStatusHistory`

## 3. Acceptance Criteria (AC)
| AC ID | Observable Expected Outcome | Relevant Negative / Boundary Behavior | Role Restrictions |
| :--- | :--- | :--- | :--- |
| AC-F04-01 | Admin สามารถดึงรายการออเดอร์ทั้งหมดและกรองตามสถานะได้ | ผู้ใช้บทบาท CUSTOMER ต้องถูกปฏิเสธด้วย 403 Forbidden | เฉพาะ ADMIN / STAFF |
| AC-F04-02 | Admin สามารถเปลี่ยนสถานะออเดอร์ตาม State Machine ที่อนุญาตได้ | การเปลี่ยนสถานะข้ามขั้นที่ไม่ถูกต้อง ต้องถูกปฏิเสธด้วย 400 Bad Request | เฉพาะ ADMIN / STAFF |
| AC-F04-03 | ออเดอร์ที่สิ้นสุดแล้ว (COMPLETED/CANCELLED) ต้องไม่สามารถเปลี่ยนสถานะได้อีก | หากพยายามอัปเดตออเดอร์ที่จบไปแล้ว ต้องได้รับ HTTP 400 Bad Request | เฉพาะ ADMIN / STAFF |

## 4. Software Test Specification (STS)
| Test ID | Linked AC | Test Level | Precondition / Input | Action | Expected Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| STS-F04-01 | AC-F04-01 | Authorization | เข้าสู่ระบบในฐานะ CUSTOMER | เรียก `GET /api/v1/admin/orders` | ได้รับ HTTP 403 Forbidden |
| STS-F04-02 | AC-F04-02 | Integration | มีออเดอร์สถานะ `PENDING` | เรียก `PATCH /api/v1/admin/orders/ord_1/status` ด้วย `{ "status": "COMPLETED" }` | ได้รับ HTTP 400 Bad Request พร้อม `INVALID_STATUS_TRANSITION` |
| STS-F04-03 | AC-F04-03 | Integration | มีออเดอร์สถานะ `CANCELLED` | เรียก `PATCH /api/v1/admin/orders/ord_2/status` ด้วย `{ "status": "CONFIRMED" }` | ได้รับ HTTP 400 Bad Request |

## 5. Completion Evidence
- **TDD Evidence:**
  - Red Phase (Failing Tests): https://github.com/supxrpoxm/cpe334-food-ordering/commit/a3f67a7
  - Green Phase (Passing Implementation): https://github.com/supxrpoxm/cpe334-food-ordering/commit/72e50da
- **Merged PR:** [รอใส่ลิงก์ GitHub PR หลังเพื่อนกด Merge เข้า staging]