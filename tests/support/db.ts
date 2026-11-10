import {
  OrderStatus,
  Prisma,
  PrismaClient,
  Role,
  type Category,
  type Order,
  type Product,
  type User,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  BCRYPT_SALT_ROUNDS,
  TEST_PASSWORD,
} from './env';

export const prisma = new PrismaClient();

export async function dropTestTriggers(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'DROP TRIGGER IF EXISTS test_fail_order_item_trigger ON order_items',
  );
  await prisma.$executeRawUnsafe(
    'DROP FUNCTION IF EXISTS test_fail_order_item()',
  );
}

export async function resetDatabase(): Promise<void> {
  await dropTestTriggers();

  await prisma.$transaction([
    prisma.orderStatusHistory.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

export type CreateUserInput = {
  email: string;
  name?: string;
  role?: Role;
  password?: string;
};

export async function createUser(input: CreateUserInput): Promise<User> {
  const password = input.password ?? TEST_PASSWORD;
  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  return prisma.user.create({
    data: {
      email: input.email.trim().toLowerCase(),
      name: input.name ?? input.email.split('@')[0],
      role: input.role ?? Role.CUSTOMER,
      passwordHash,
    },
  });
}

export async function createCategory(name: string): Promise<Category> {
  return prisma.category.create({ data: { name } });
}

async function findOrCreateCategory(name: string): Promise<string> {
  const existing = await prisma.category.findUnique({ where: { name } });

  if (existing) {
    return existing.id;
  }

  try {
    const created = await prisma.category.create({ data: { name } });
    return created.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const found = await prisma.category.findUniqueOrThrow({
        where: { name },
      });
      return found.id;
    }

    throw error;
  }
}

export type CreateProductInput = {
  name: string;
  price: string | number;
  stockQuantity: number;
  categoryName?: string;
  categoryId?: string;
  description?: string;
  imageUrl?: string;
  isActive?: boolean;
};

export async function createProduct(
  input: CreateProductInput,
): Promise<Product> {
  let categoryId = input.categoryId;

  if (!categoryId && input.categoryName) {
    categoryId = await findOrCreateCategory(input.categoryName);
  }

  return prisma.product.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      price: new Prisma.Decimal(input.price),
      stockQuantity: input.stockQuantity,
      isActive: input.isActive ?? true,
      imageUrl:
        input.imageUrl ??
        `https://cdn.example.com/images/${input.name.replace(/\s+/g, '-').toLowerCase()}.jpg`,
      categoryId: categoryId ?? null,
    },
  });
}

export type CreateOrderSeedItem = {
  productId: string;
  quantity: number;
  unitPrice?: string | number;
};

export type CreateOrderSeedInput = {
  userId: string;
  status?: OrderStatus;
  items: CreateOrderSeedItem[];
};

export async function createOrder(
  input: CreateOrderSeedInput,
): Promise<Order> {
  const items = await Promise.all(
    input.items.map(async (item) => {
      let unitPrice = item.unitPrice;

      if (unitPrice === undefined) {
        const product = await prisma.product.findUniqueOrThrow({
          where: { id: item.productId },
        });
        unitPrice = product.price.toString();
      }

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: new Prisma.Decimal(unitPrice),
      };
    }),
  );

  const totalAmount = items.reduce((total, item) => {
    return total.plus(item.unitPrice.times(item.quantity));
  }, new Prisma.Decimal(0));

  return prisma.order.create({
    data: {
      userId: input.userId,
      status: input.status ?? OrderStatus.PENDING,
      totalAmount,
      items: {
        create: items,
      },
    },
  });
}

export async function getStock(productId: string): Promise<number> {
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
  });

  return product.stockQuantity;
}

export async function setProductPrice(
  productId: string,
  price: string | number,
): Promise<Product> {
  return prisma.product.update({
    where: { id: productId },
    data: { price: new Prisma.Decimal(price) },
  });
}

export async function installOrderItemFailureTrigger(
  productId: string,
): Promise<void> {
  await dropTestTriggers();

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION test_fail_order_item() RETURNS trigger AS $$
    BEGIN
      IF NEW.product_id = '${productId}' THEN
        RAISE EXCEPTION 'simulated order item insert failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER test_fail_order_item_trigger
    BEFORE INSERT ON order_items
    FOR EACH ROW
    EXECUTE FUNCTION test_fail_order_item();
  `);
}
