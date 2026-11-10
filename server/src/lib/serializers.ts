import { Prisma } from '@prisma/client';

function formatAmount(value: Prisma.Decimal): string {
  return new Prisma.Decimal(value).toFixed(2);
}

export type SerializableProduct = {
  id: string;
  name: string;
  description: string | null;
  price: Prisma.Decimal;
  stockQuantity: number;
  isActive: boolean;
  imageUrl: string | null;
  categoryId: string | null;
  category?: { name: string } | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeProduct(product: SerializableProduct) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: formatAmount(product.price),
    category: product.category?.name ?? null,
    categoryId: product.categoryId,
    imageUrl: product.imageUrl,
    inStock: product.stockQuantity > 0,
    stockQuantity: product.stockQuantity,
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export type SerializableOrder = {
  id: string;
  userId: string;
  status: string;
  totalAmount: Prisma.Decimal;
  items?: Array<{
    productId: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeOrder(order: SerializableOrder) {
  return {
    id: order.id,
    userId: order.userId,
    status: order.status,
    totalAmount: formatAmount(order.totalAmount),
    items: (order.items ?? []).map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: formatAmount(item.unitPrice),
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
