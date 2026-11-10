import { Role } from '@prisma/client';
import { Router } from 'express';
import { ApiError, validationError } from '../lib/errors';
import {
  asyncHandler,
  hasOwn,
  isPlainObject,
  isUuid,
  paramString,
} from '../lib/http';
import { prisma } from '../lib/prisma';
import { serializeOrder } from '../lib/serializers';
import { authenticate, authorize } from '../middleware/auth';
import {
  createOrderWithStockAndPricing,
  type CreateOrderInput,
} from '../services/orderService';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorize(Role.CUSTOMER),
  asyncHandler(async (req, res) => {
    const user = req.user;

    if (!user) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required');
    }

    const body = isPlainObject(req.body) ? req.body : {};

    if (hasOwn(body, 'status')) {
      throw validationError('status cannot be set by the client');
    }

    if (body.userId !== undefined && body.userId !== user.userId) {
      throw new ApiError(
        403,
        'FORBIDDEN_RESOURCE',
        'You cannot create an order for another user',
      );
    }

    const order = await createOrderWithStockAndPricing({
      ...body,
      userId: user.userId,
    } as CreateOrderInput);

    res.status(201).json({
      success: true,
      data: {
        id: order.orderId,
        userId: order.userId,
        status: order.status,
        totalAmount: order.totalAmount,
        items: order.items,
        createdAt: order.createdAt,
      },
    });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user;

    if (!user) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required');
    }

    const where =
      user.role === Role.ADMIN ? {} : { userId: user.userId };

    const orders = await prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      success: true,
      data: orders.map(serializeOrder),
    });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = req.user;

    if (!user) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required');
    }

    const orderId = paramString(req.params.id);

    if (!isUuid(orderId)) {
      throw new ApiError(404, 'ORDER_NOT_FOUND', 'Order was not found');
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new ApiError(404, 'ORDER_NOT_FOUND', 'Order was not found');
    }

    if (user.role !== Role.ADMIN && order.userId !== user.userId) {
      throw new ApiError(
        403,
        'FORBIDDEN_RESOURCE',
        'You do not have access to this order',
      );
    }

    res.status(200).json({
      success: true,
      data: serializeOrder(order),
    });
  }),
);

export default router;
