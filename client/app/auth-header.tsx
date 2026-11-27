'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AUTH_STATE_CHANGED, AuthUser } from './auth-state';
import { LogoutButton } from './logout-button';

export function AuthHeader() {
  const [user, setUser] = useState<AuthUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
      if (!response.ok) {
        setUser(null);
        return;
      }
      const body = await response.json();
      setUser(body.data as AuthUser);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onAuthChanged = (event: Event) => {
      const changed = event as CustomEvent<AuthUser | null>;
      if (changed.detail === null) setUser(null);
      else if (changed.detail) setUser(changed.detail);
      else void refresh();
    };
    window.addEventListener(AUTH_STATE_CHANGED, onAuthChanged);
    return () => window.removeEventListener(AUTH_STATE_CHANGED, onAuthChanged);
  }, [refresh]);

  return <div className="flex flex-wrap items-center gap-5 text-base font-semibold">
    <Link className="hover:underline" href="/products">Menu</Link>
    {user?.role === 'ADMIN'
      ? <Link className="hover:underline" href="/admin/orders">Manage orders</Link>
      : <Link className="hover:underline" href="/order">Place an order</Link>}
    {user
      ? <><span aria-label="Signed-in user" className="text-sm text-stone-700">{user.name} · {user.role}</span><LogoutButton /></>
      : <Link className="hover:underline" href="/login">Sign in</Link>}
  </div>;
}
