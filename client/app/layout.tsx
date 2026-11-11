import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { LogoutButton } from './logout-button';

export const metadata: Metadata = { title: 'Good Table | Food ordering', description: 'A simple, comfortable food ordering experience.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><header className="border-b border-stone-200 bg-[#fffefa]"><nav aria-label="Main navigation" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5"><Link href="/products" className="text-2xl font-bold tracking-tight text-stone-800">Good Table</Link><div className="flex flex-wrap items-center gap-5 text-base font-semibold"><Link className="hover:underline" href="/products">Menu</Link><Link className="hover:underline" href="/order">Place an order</Link><Link className="hover:underline" href="/admin/orders">Manage orders</Link><Link className="hover:underline" href="/login">Sign in</Link><LogoutButton /></div></nav></header><main className="mx-auto min-h-[calc(100vh-160px)] max-w-6xl px-6 py-10">{children}</main><footer className="border-t border-stone-200 bg-[#fffefa] px-6 py-6 text-center text-stone-600">Good food, made simple.</footer></body></html>;
}
