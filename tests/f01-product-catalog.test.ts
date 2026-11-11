import { beforeEach, describe, expect, it } from 'vitest';
import { api, errorCode } from './support/http';
import {
  createCategory,
  createProduct,
  resetDatabase,
} from './support/db';

const PRODUCTS_URL = '/api/v1/products';

beforeEach(async () => {
  await resetDatabase();
});

describe('F-01 Product Catalog Browsing', () => {
  it('STS-F01-01 returns only active products with pagination metadata', async () => {
    const category = await createCategory('Main Course');

    const activeProducts = await Promise.all(
      ['ข้าวผัดกุ้ง', 'ผัดไทย', 'ต้มยำกุ้ง', 'ข้าวมันไก่', 'ส้มตำ'].map(
        (name, index) =>
          createProduct({
            name,
            price: `${80 + index}.00`,
            stockQuantity: 10 + index,
            categoryId: category.id,
            isActive: true,
          }),
      ),
    );

    await Promise.all([
      createProduct({
        name: 'สินค้าถูกซ่อน 1',
        price: '99.00',
        stockQuantity: 5,
        categoryId: category.id,
        isActive: false,
      }),
      createProduct({
        name: 'สินค้าถูกซ่อน 2',
        price: '99.00',
        stockQuantity: 5,
        categoryId: category.id,
        isActive: false,
      }),
    ]);

    const response = await api().get(PRODUCTS_URL);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(5);
    expect(response.body.data.map((product: { id: string }) => product.id).sort())
      .toEqual(activeProducts.map((product) => product.id).sort());
    expect(
      response.body.data.some(
        (product: { name: string }) =>
          product.name === 'สินค้าถูกซ่อน 1' ||
          product.name === 'สินค้าถูกซ่อน 2',
      ),
    ).toBe(false);
    expect(response.body.pagination).toMatchObject({
      page: 1,
      limit: 10,
      totalItems: 5,
      totalPages: 1,
    });
  });

  it('AC-F01-02 searches products by name keyword', async () => {
    await createProduct({
      name: 'ข้าวผัดกุ้ง',
      price: '85.00',
      stockQuantity: 15,
      categoryName: 'Main Course',
    });
    await createProduct({
      name: 'ผัดไทยกุ้งสด',
      price: '75.00',
      stockQuantity: 8,
      categoryName: 'Main Course',
    });
    await createProduct({
      name: 'ชาไทย',
      price: '35.00',
      stockQuantity: 30,
      categoryName: 'Beverage',
    });

    const response = await api()
      .get(PRODUCTS_URL)
      .query({ search: 'ข้าวผัดกุ้ง' });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('ข้าวผัดกุ้ง');
    expect(response.body.pagination.totalItems).toBe(1);
  });

  it('AC-F01-02 filters products by category', async () => {
    await createProduct({
      name: 'ข้าวผัดกุ้ง',
      price: '85.00',
      stockQuantity: 15,
      categoryName: 'Main Course',
    });
    await createProduct({
      name: 'ชาไทย',
      price: '35.00',
      stockQuantity: 30,
      categoryName: 'Beverage',
    });

    const response = await api()
      .get(PRODUCTS_URL)
      .query({ category: 'Main Course' });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('ข้าวผัดกุ้ง');
    expect(response.body.data[0].category).toBe('Main Course');
    expect(response.body.pagination.totalItems).toBe(1);
  });

  it('STS-F01-02 returns an empty list for a keyword that does not exist', async () => {
    await createProduct({
      name: 'ข้าวผัดกุ้ง',
      price: '85.00',
      stockQuantity: 15,
      categoryName: 'Main Course',
    });

    const response = await api()
      .get(PRODUCTS_URL)
      .query({ search: 'ไม่มีในระบบ' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual([]);
    expect(response.body.pagination.totalItems).toBe(0);
    expect(response.body.pagination.totalPages).toBe(0);
  });

  it('AC-F01-01 reports out-of-stock products with inStock=false', async () => {
    const product = await createProduct({
      name: 'สินค้าหมด',
      price: '120.00',
      stockQuantity: 0,
      categoryName: 'Main Course',
    });

    const response = await api().get(`${PRODUCTS_URL}/${product.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: product.id,
      stockQuantity: 0,
      inStock: false,
    });
  });

  it('STS-F01-03 returns 404 PRODUCT_NOT_FOUND for an unknown product id', async () => {
    const response = await api().get(
      `${PRODUCTS_URL}/00000000-0000-4000-8000-000000000000`,
    );

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(errorCode(response)).toBe('PRODUCT_NOT_FOUND');
  });

  it('STS-F01-03 returns 404 for an inactive product detail', async () => {
    const product = await createProduct({
      name: 'สินค้าถูกซ่อน',
      price: '99.00',
      stockQuantity: 5,
      categoryName: 'Main Course',
      isActive: false,
    });

    const response = await api().get(`${PRODUCTS_URL}/${product.id}`);

    expect(response.status).toBe(404);
    expect(errorCode(response)).toBe('PRODUCT_NOT_FOUND');
  });

  it('returns an empty page with 200 when pagination exceeds total pages', async () => {
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        createProduct({
          name: `สินค้า ${index + 1}`,
          price: '50.00',
          stockQuantity: 10,
          categoryName: 'Main Course',
        }),
      ),
    );

    const response = await api()
      .get(PRODUCTS_URL)
      .query({ page: 3, limit: 10 });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.pagination).toMatchObject({
      page: 3,
      limit: 10,
      totalItems: 12,
      totalPages: 2,
    });
  });

  it('AC-F01-01 allows unauthenticated public browsing', async () => {
    await createProduct({
      name: 'ข้าวผัดกุ้ง',
      price: '85.00',
      stockQuantity: 15,
      categoryName: 'Main Course',
    });

    const response = await api().get(PRODUCTS_URL);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
