# Part C: System-Level Software Design Specification (System-Level SDS)

## 1. System Architecture & Data Stack

### 1.1 Architecture & Stack Choice
ระบบถูกออกแบบโดยใช้สถาปัตยกรรมแบบ Monolithic Web Application เพื่อความคล่องตัวในการพัฒนาและการทำ Integration Testing ใน Sprint 1 โดยแบ่ง Layer การทำงานออกเป็น:
- **Presentation Layer (Frontend):** Next.js (React Framework) พร้อม Tailwind CSS สำหรับสร้าง User Interface
- **Application & API Layer (Backend):** Node.js ร่วมกับ Express.js Framework ในการจัดการ RESTful API Endpoints และ Business Logic Validations
- **Persistence Layer (Database):** PostgreSQL เป็น Relational Database จัดการ Schema Migration และ Query ผ่าน Prisma ORM

---

### 1.2 Data Model & Prisma Schema Definition
โครงสร้างฐานข้อมูล (Entity-Relationship) ประกอบด้วย 4 ตารางหลัก ได้แก่ `User`, `Product`, `Order`, และ `OrderItem` โดยมีสเปกดังนี้:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  CUSTOMER
  ADMIN
}

enum OrderStatus {
  PENDING
  PAID
  SHIPPED
  CANCELLED
}

model User {
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String   @map("password_hash")
  name          String
  role          Role     @default(CUSTOMER)
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  orders        Order[]

  @@map("users")
}

model Product {
  id            String      @id @default(uuid())
  name          String
  description   String?
  price         Decimal     @db.Decimal(10, 2)
  stockQuantity Int         @map("stock_quantity")
  orderItems    OrderItem[]
  createdAt     DateTime    @default(now()) @map("created_at")
  updatedAt     DateTime    @updatedAt @map("updated_at")

  @@map("products")
}

model Order {
  id          String      @id @default(uuid())
  userId      String      @map("user_id")
  user        User        @relation(fields: [userId], references: [id])
  totalAmount Decimal     @db.Decimal(10, 2) @map("total_amount")
  status      OrderStatus @default(PENDING)
  items       OrderItem[]
  createdAt   DateTime    @default(now()) @map("created_at")
  updatedAt   DateTime    @updatedAt @map("updated_at")

  @@map("orders")
}

model OrderItem {
  id        String   @id @default(uuid())
  orderId   String   @map("order_id")
  order     Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId String   @map("product_id")
  product   Product  @relation(fields: [productId], references: [id])
  quantity  Int
  unitPrice Decimal  @db.Decimal(10, 2) @map("unit_price")

  @@map("order_items")
}

## 2. Access & Authorization Matrix

ตารางแสดงสิทธิ์การเข้าถึงและการจัดการข้อมูลตามบทบาทผู้ใช้ (Role-Based Access Control):

| Operation / Resource Endpoint | Method | Customer Scope | Admin Scope | Unauthenticated |
| :--- | :--- | :--- | :--- | :--- |
| **User Login / Logout** | `POST` | Permitted (`/api/auth/*`) | Permitted (`/api/auth/*`) | Permitted |
| **Browse Product Catalog** | `GET` | Permitted (`/api/products`) | Permitted (`/api/products`) | Permitted |
| **Create New Order** | `POST` | Permitted (Own user ID only) | Denied (403 Forbidden) | Denied (401 Unauthorized) |
| **View Order History** | `GET` | Permitted (Own orders only) | Permitted (All system orders) | Denied (401 Unauthorized) |
| **View Order Detail** | `GET` | Permitted (Own order ID only) | Permitted (Any order ID) | Denied (401 Unauthorized) |
| **Update Order Status** | `PATCH` | Denied (403 Forbidden) | Permitted (`/api/admin/orders/:id/status`) | Denied (401 Unauthorized) |

---

## 3. Authentication & Session Handling

- **Credential Storage:** รหัสผ่านของผู้ใช้จะถูกทำ Hashing ก่อนบันทึกลงฐานข้อมูลด้วยอัลกอริทึม `bcrypt` (Salt Rounds = 10)
- **Token Issue & Delivery:** เมื่อทำ Authentication ผ่าน (`POST /api/auth/login`) Server จะออก JSON Web Token (JWT) ที่บรรจุ `userId` และ `role` แล้วฝังลงใน **HTTP-Only Cookie** (เพื่อป้องกันการถูกขโมยผ่าน XSS)
- **Token Verification Middleware:** ทุก Request ที่เข้าถึง Protected Routes จะต้องผ่าน Middleware ตรวจสอบ Cookie หากไม่มี หรือ Token หมดอายุ/ไม่ถูกต้อง จะปฏิเสธด้วย `HTTP 401 Unauthorized`
- **Logout Handling:** เมื่อเรียก `POST /api/auth/logout` Server จะทำการ Clear Cookie ออกจาก Browser ทันที

---

## 4. Configuration & Deployment Plan

- **Environment Variables:** ข้อมูลความลับทั้งหมด เช่น `DATABASE_URL` และ `JWT_SECRET` จะถูกเก็บไว้ในไฟล์ `.env` ที่อยู่ในสภาพแวดล้อม Local และไม่ถูก Push ขึ้น Git
- **Containerization Readiness:** ระบบถูกออกแบบให้รองรับการ Build เป็น Docker Container (จัดเตรียมไว้สำหรับ Lab 5 และ Sprint 3) โดยการแยกไร้สภาวะ (Stateless Application Server) ออกจากข้อกำหนดของนิเวศน์ฐานข้อมูล