import { OrderStatus, Prisma } from '@prisma/client';
import { ApiError, validationError } from '../lib/errors';
import { hasOwn, isPlainObject, isUuid } from '../lib/http';
import { prisma } from '../lib/prisma';

export type CreateOrderItemInput = {
  productId: string;
  quantity: number;
};

export type CreateOrderInput = {
  userId: string;
  items: CreateOrderItemInput[];
  [key: string]: unknown;
};

export type CreatedOrderItemResult = {
  productId: string;
  quantity: number;
  unitPrice: string;
};

export type CreatedOrderResult = {
  orderId: string;
  userId: string;
  status: string;
  totalAmount: string;
  items: CreatedOrderItemResult[];
  createdAt: string;
};

const MAX_AMOUNT = new Prisma.Decimal('99999999.99');
const PRICE_FIELDS = [
  'unitPrice',
  'price',
  'totalAmount',
  'subtotal',
  'lineTotal',
];

function hasClientPriceField(value: Record<string, unknown>): boolean {
  return PRICE_FIELDS.some((field) => hasOwn(value, field));
}

function assertNoClientPrice(input: unknown): void {
  if (!isPlainObject(input)) {
    return;
  }

  if (hasClientPriceField(input)) {
    throw new ApiError(
      400,
      'CLIENT_PRICE_NOT_ALLOWED',
      'Client-supplied prices are not allowed',
    );
  }

  if (!Array.isArray(input.items)) {
    return;
  }

  for (const item of input.items) {
    if (isPlainObject(item) && hasClientPriceField(item)) {
      throw new ApiError(
        400,
        'CLIENT_PRICE_NOT_ALLOWED',
        'Client-supplied prices are not allowed',
      );
    }
  }
}

export function validateOrderItems(rawItems: unknown): CreateOrderItemInput[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw validationError('items must be a non-empty array');
  }

  const items: CreateOrderItemInput[] = [];
  const seenProductIds = new Set<string>();

  for (const rawItem of rawItems) {
    if (!isPlainObject(rawItem)) {
      throw validationError('Each item must be an object');
    }

    const productId = rawItem.productId;
    const quantity = rawItem.quantity;

    if (typeof productId !== 'string' || productId.trim() === '') {
      throw validationError('productId is required');
    }

    if (
      typeof quantity !== 'number' ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      throw validationError('quantity must be a positive integer');
    }

    if (seenProductIds.has(productId)) {
      throw new ApiError(
        400,
        'DUPLICATE_ITEM',
        `Duplicate productId ${productId} in order`,
      );
    }

    seenProductIds.add(productId);
    items.push({ productId, quantity });
  }

  return items;
}

function formatAmount(value: Prisma.Decimal): string {
  return new Prisma.Decimal(value).toFixed(2);
}

export async function createOrderWithStockAndPricing(
  input: CreateOrderInput,
): Promise<CreatedOrderResult> {
  try {
    assertNoClientPrice(input);

    if (!isPlainObject(input)) {
      throw validationError('Request body must be an object');
    }

    const userId = input.userId;

    if (typeof userId !== 'string' || userId.trim() === '') {
      throw validationError('userId is required');
    }

    const items = validateOrderItems(input.items);

    for (const item of items) {
      if (!isUuid(item.productId)) {
        throw new ApiError(
          404,
          'PRODUCT_NOT_FOUND',
          `Product ${item.productId} was not found`,
        );
      }
    }

    const order = await prisma.$transaction(
      async (tx) => {
        const productIds = items.map((item) => item.productId);
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
        });
        const productsById = new Map(
          products.map((product) => [product.id, product]),
        );

        for (const item of items) {
          if (!productsById.has(item.productId)) {
            throw new ApiError(
              404,
              'PRODUCT_NOT_FOUND',
              `Product ${item.productId} was not found`,
            );
          }
        }

        let totalAmount = new Prisma.Decimal(0);
        const orderItems: Array<{
          productId: string;
          quantity: number;
          unitPrice: Prisma.Decimal;
        }> = [];

        for (const item of items) {
          const product = productsById.get(item.productId);
          if (!product) {
            continue;
          }

          const unitPrice = new Prisma.Decimal(product.price);
          totalAmount = totalAmount.plus(unitPrice.times(item.quantity));
          orderItems.push({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice,
          });
        }

        if (totalAmount.greaterThan(MAX_AMOUNT)) {
          throw new ApiError(
            400,
            'AMOUNT_OUT_OF_RANGE',
            'Order total exceeds the supported amount range',
          );
        }

        // Decrement in a deterministic order to reduce deadlock risk between
        // concurrent orders that touch the same set of products.
        const decrementOrder = [...items].sort((left, right) =>
          left.productId.localeCompare(right.productId),
        );

        for (const item of decrementOrder) {
          const stockUpdate = await tx.product.updateMany({
            where: {
              id: item.productId,
              stockQuantity: { gte: item.quantity },
            },
            data: {
              stockQuantity: { decrement: item.quantity },
            },
          });

          if (stockUpdate.count !== 1) {
            const currentProduct = await tx.product.findUnique({
              where: { id: item.productId },
              select: { stockQuantity: true },
            });

            throw new ApiError(
              409,
              'INSUFFICIENT_STOCK',
              `Insufficient stock for product ${item.productId}`,
              [
                {
                  productId: item.productId,
                  requested: item.quantity,
                  available: currentProduct?.stockQuantity ?? 0,
                },
              ],
            );
          }
        }

        return tx.order.create({
          data: {
            userId,
            status: OrderStatus.PENDING,
            totalAmount,
            items: {
              create: orderItems,
            },
          },
          include: { items: true },
        });
      },
      {
        maxWait: 10_000,
        timeout: 20_000,
      },
    );

    return {
      orderId: order.id,
      userId: order.userId,
      status: order.status,
      totalAmount: formatAmount(order.totalAmount),
      items: order.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: formatAmount(item.unitPrice),
      })),
      createdAt: order.createdAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      500,
      'INTERNAL_ERROR',
      'Failed to create order',
    );
  }
}
