import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { ApiError } from '../lib/errors';
import {
  asyncHandler,
  isUuid,
  paramString,
  parsePositiveInt,
} from '../lib/http';
import { prisma } from '../lib/prisma';
import { serializeProduct } from '../lib/serializers';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = parsePositiveInt(req.query.page, 1);
    const requestedLimit = parsePositiveInt(req.query.limit, 10);
    const limit = Math.min(requestedLimit, 100);
    const search =
      typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category =
      typeof req.query.category === 'string'
        ? req.query.category.trim()
        : '';

    const where: Prisma.ProductWhereInput = {
      isActive: true,
    };

    if (search !== '') {
      where.name = {
        contains: search,
        mode: 'insensitive',
      };
    }

    if (category !== '') {
      where.category = {
        is: {
          name: {
            equals: category,
            mode: 'insensitive',
          },
        },
      };
    }

    const totalItems = await prisma.product.count({ where });
    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / limit);

    const products = await prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    res.status(200).json({
      success: true,
      data: products.map(serializeProduct),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
      },
    });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const productId = paramString(req.params.id);

    if (!isUuid(productId)) {
      throw new ApiError(
        404,
        'PRODUCT_NOT_FOUND',
        'Product was not found',
      );
    }

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        isActive: true,
      },
      include: { category: true },
    });

    if (!product) {
      throw new ApiError(
        404,
        'PRODUCT_NOT_FOUND',
        'Product was not found',
      );
    }

    res.status(200).json({
      success: true,
      data: serializeProduct(product),
    });
  }),
);

export default router;
