# Feature Contract: F-01 Product Catalog Browsing

## 1. Feature Design & Business Rules
- **Linked Requirements:** FR-01, FR-02, BR-01, BR-02, NFR-01
- **Behavior & Workflow:** ผู้ใช้งานสามารถเข้าชมรายการสินค้า ค้นหาด้วยคีย์เวิร์ด กรองตามหมวดหมู่ (Category) และดูรายละเอียดของสินค้าพร้อมสถานะคลังสินค้าแบบ Real-time ได้โดยไม่ต้องเข้าสู่ระบบ
- **Dependencies:** ไม่มี (เป็น Entry point หลักของระบบ)
- **Business Rules & Validation:** 
  - แสดงเฉพาะสินค้าที่มีสถานะ `isActive: true` เท่านั้น
  - ราคาสินค้าที่แสดงต้องเป็นราคาสุทธิล่าสุดจากระบบจัดการราคา
  - กรณีสินค้าในสต็อกเท่ากับ 0 ต้องแสดงป้าย "สินค้าหมด" (Out of Stock)
- **Failure / Boundary Cases:**
  - ค้นหาด้วยคีย์เวิร์ดที่ไม่พบข้อมูล: แสดง Empty State พร้อมข้อความแนะนำ
  - ระบุ `productId` ที่ไม่มีในระบบ หรือถูกซ่อน (`isActive: false`): ส่งคืน 404 Not Found
  - หน้าต่าง Pagination เกินจำนวนหน้าที่มีจริง: ส่งคืนรายการว่างพร้อม HTTP 200 OK
- **Permissions:** สาธารณะ (Public/Guest, Customer, Admin เข้าถึงได้ทั้งหมด)

## 2. Technical Specification
- **UI Behavior:** 
  - หน้าแสดงรายการสินค้ารองรับ Responsive Layout (Grid view)
  - มี Search Bar และ Filter Dropdown สำหรับหมวดหมู่
  - รองรับ Pagination แบบ Server-side
- **API Methods & Paths:** 
  - `GET /api/v1/products` (รายการสินค้าพร้อม Filter/Search/Pagination)
  - `GET /api/v1/products/:id` (รายละเอียดสินค้าตาม ID)
- **Request, Response & Error Shapes:**
  - `GET /api/v1/products` Success (200 OK):
    ```json
    {
      "success": true,
      "data": [
        {
          "id": "prod_123",
          "name": "ชุดข้าวผัดกุ้ง",
          "price": 85.00,
          "category": "Main Course",
          "imageUrl": "[https://cdn.example.com/images/prod_123.jpg](https://cdn.example.com/images/prod_123.jpg)",
          "inStock": true,
          "stockQuantity": 15
        }
      ],
      "pagination": {
        "page": 1,
        "limit": 10,
        "totalItems": 1,
        "totalPages": 1
      }
    }
    ```
  - Error (404 Not Found):
    ```json
    {
      "success": false,
      "error": {
        "code": "PRODUCT_NOT_FOUND",
        "message": "ไม่พบข้อมูลสินค้าที่ระบุ"
      }
    }
    ```
- **Data Fields, Constraints & Migrations:** 
  - อ่านข้อมูลจากตาราง `Product` และ `Category`
  - มีการสร้าง Index บนคอลัมน์ `name`, `categoryId`, และ `isActive` เพื่อประสิทธิภาพในการค้นหา

## 3. Acceptance Criteria (AC)
| AC ID | Observable Expected Outcome | Relevant Negative / Boundary Behavior | Role Restrictions |
| :--- | :--- | :--- | :--- |
| AC-F01-01 | ผู้ใช้สามารถดึงรายการสินค้าที่ active อยู่ทั้งหมดได้ถูกต้อง | สินค้าที่ไม่ active (`isActive: false`) ต้องไม่ถูกดึงมาแสดง | ไม่จำกัดสิทธิ์ (Public) |
| AC-F01-02 | ผู้ใช้สามารถค้นหาสินค้าด้วยชื่อ หรือกรองตามหมวดหมู่ได้ | หากค้นหาด้วยคำที่ไม่มีในระบบ ต้องแสดงรายการว่างพร้อม UI Empty State | ไม่จำกัดสิทธิ์ (Public) |
| AC-F01-03 | ผู้ใช้สามารถกดดูรายละเอียดสินค้าตาม `productId` ได้ | หากส่ง `productId` ที่ไม่มีจริง ต้องได้รับ HTTP 404 Not Found | ไม่จำกัดสิทธิ์ (Public) |

## 4. Software Test Specification (STS)
| Test ID | Linked AC | Test Level | Precondition / Input | Action | Expected Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| STS-F01-01 | AC-F01-01 | Integration | มีสินค้า active 5 รายการ และ inactive 2 รายการ | เรียก `GET /api/v1/products` | ได้รับ HTTP 200 OK พร้อมรายการสินค้าเพียง 5 รายการ |
| STS-F01-02 | AC-F01-02 | Integration | มีสินค้าชื่อ "ข้าวผัดกุ้ง" ในระบบ | เรียก `GET /api/v1/products?search=ไม่มีในระบบ` | ได้รับ HTTP 200 OK พร้อม `data: []` และ `totalItems: 0` |
| STS-F01-03 | AC-F01-03 | API | ไม่มี `productId: invalid_id` ในระบบ | เรียก `GET /api/v1/products/invalid_id` | ได้รับ HTTP 404 Not Found พร้อมรหัสข้อผิดพลาด `PRODUCT_NOT_FOUND` |

## 5. Completion Evidence
- **TDD Evidence:** [รอใส่ลิงก์ Commit ที่ Test Failed และ Passed หลังเขียนโค้ดจริง]
- **Merged PR:** [รอใส่ลิงก์ GitHub PR หลังโค้ดผ่านการรีวิว]