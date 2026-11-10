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
};

export class ServiceNotImplementedError extends Error {
  readonly code = 'NOT_IMPLEMENTED';

  constructor(message: string) {
    super(message);
    this.name = 'ServiceNotImplementedError';
  }
}

export async function createOrderWithStockAndPricing(
  _input: CreateOrderInput,
): Promise<CreatedOrderResult> {
  throw new ServiceNotImplementedError(
    'createOrderWithStockAndPricing is intentionally not implemented yet',
  );
}
