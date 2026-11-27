'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, Order } from '../../api';

export default function OrderConfirmationPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orderId) return;
    api<Order>(`/orders/${encodeURIComponent(orderId)}`)
      .then(setOrder)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load this order.'));
  }, [orderId]);

  if (error) return <section className="mx-auto max-w-2xl" role="alert"><h1 className="text-3xl font-bold">Order unavailable</h1><p className="mt-4 text-stone-700">{error}</p></section>;
  if (!order) return <p role="status">Loading order confirmation…</p>;

  return <section className="mx-auto max-w-2xl rounded-2xl border border-green-300 bg-white p-8 shadow-sm sm:p-12">
    <p className="font-bold uppercase tracking-widest text-green-800">Order confirmed</p>
    <h1 className="mt-2 text-4xl font-bold">Thank you for your order</h1>
    <dl className="mt-8 space-y-5 text-lg">
      <div><dt className="font-semibold text-stone-600">Order ID</dt><dd className="mt-1 break-all font-mono" data-testid="order-id">{order.id}</dd></div>
      <div><dt className="font-semibold text-stone-600">Status</dt><dd className="mt-1 font-bold">{order.status}</dd></div>
      <div><dt className="font-semibold text-stone-600">Total</dt><dd className="mt-1 text-2xl font-bold">฿{Number(order.totalAmount).toFixed(2)}</dd></div>
    </dl>
  </section>;
}
