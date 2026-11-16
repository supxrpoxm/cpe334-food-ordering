export type Product = { id: string; name: string; description: string | null; price: string; stockQuantity: number; imageUrl: string | null; category: string | null };
export type Order = { id: string; userId: string; status: string; totalAmount: string; createdAt: string; items: { productId: string; quantity: number; unitPrice: string }[] };

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers }, cache: 'no-store' });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let code: string | undefined;
    try {
      const body = await response.json();
      message = body.error?.message || message;
      code = body.error?.code;
    } catch {}
    throw new ApiRequestError(message, response.status, code);
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json(); return body.data as T;
}
