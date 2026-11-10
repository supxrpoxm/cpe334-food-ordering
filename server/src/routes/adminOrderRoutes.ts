import { OrderStatus, Role } from '@prisma/client';
import { Router } from 'express';
import { ApiError, validationError } from '../lib/errors';
import {
  asyncHandler,
  isPlainObject,
  isUuid,
  paramString,
} from '../lib/http';
import { prisma } from '../lib/prisma';
import { serializeOrder } from '../lib/serializers';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatus.PENDING]: [
    OrderStatus.CONFIRMED,
    OrderStatus.CANCELLED,
    OrderStatus.PAID,
  ],
  [OrderStatus.CONFIRMED]: [
    OrderStatus.PREPARING,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PREPARING]: [
    OrderStatus.READY,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.READY]: [
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PAID]: [OrderStatus.SHIPPED],
  [OrderStatus.SHIPPED]: [OrderStatus.COMPLETED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
};

function isOrderStatus(value: string): value is OrderStatus {
  return (Object.values(OrderStatus) as string[]).includes(value);
}

router.use(authenticate);
router.use(authorize(Role.ADMIN));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rawStatus = req.query.status;
    let statusFilter: OrderStatus | undefined;

    if (typeof rawStatus === 'string' && rawStatus.trim() !== '') {
      const candidate = rawStatus.trim();

      if (!isOrderStatus(candidate)) {
        throw validationError('Invalid order status filter');
      }

      statusFilter = candidate;
    }

    const orders = await prisma.order.findMany({
      where: statusFilter ? { status: statusFilter } : {},
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      success: true,
      data: orders.map(serializeOrder),
    });
  }),
);

router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const admin = req.user;

    if (!admin) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required');
    }

    const body = isPlainObject(req.body) ? req.body : {};
    const requestedStatus = body.status;

    if (
      typeof requestedStatus !== 'string' ||
      !isOrderStatus(requestedStatus)
    ) {
      throw validationError('Invalid order status');
    }

    const orderId = paramString(req.params.id);

    if (!isUuid(orderId)) {
      throw new ApiError(404, 'ORDER_NOT_FOUND', 'Order was not found');
    }

    const nextStatus = requestedStatus;

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        throw new ApiError(404, 'ORDER_NOT_FOUND', 'Order was not found');
      }

      const allowed = ALLOWED_TRANSITIONS[order.status];

      if (!allowed.includes(nextStatus)) {
        throw new ApiError(
          400,
          'INVALID_STATUS_TRANSITION',
          `Cannot change order status from ${order.status} to ${nextStatus}`,
        );
      }

      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: { status: nextStatus },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          previousStatus: order.status,
          newStatus: nextStatus,
          changedById: admin.userId,
        },
      });

      return { previousStatus: order.status, updatedOrder };
    });

    res.status(200).json({
      success: true,
      data: {
        orderId: result.updatedOrder.id,
        previousStatus: result.previousStatus,
        currentStatus: result.updatedOrder.status,
        updatedAt: result.updatedOrder.updatedAt.toISOString(),
      },
    });
  }),
);

export default router;
