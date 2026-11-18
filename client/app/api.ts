export type Product = { id: string; name: string; description: string | null; price: string; stockQuantity: number; imageUrl: string | null; category: string | null };
export type Order = { id: string; userId: string; status: string; totalAmount: string; createdAt: string; items: { productId: string; quantity: number; unitPrice: string }[] };
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers }, cache: 'no-store' });
  if (!response.ok) { let message = `Request failed (${response.status})`; try { const body = await response.json(); message = body.error?.message || message; } catch {} throw new Error(message); }
  if (response.status === 204) return undefined as T;
  const body = await response.json(); return body.data as T;
}
