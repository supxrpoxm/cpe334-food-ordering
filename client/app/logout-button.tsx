'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notifyAuthStateChanged } from './auth-state';

export function LogoutButton() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function logout() {
    setMessage('');
    setBusy(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('Sign out failed');
      notifyAuthStateChanged(null);
      router.push('/login');
      router.refresh();
    } catch {
      setMessage('Could not sign out. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return <span className="flex items-center gap-2"><button onClick={logout} disabled={busy} className="min-h-11 rounded-lg border border-stone-400 px-4 text-base hover:bg-stone-100 disabled:opacity-60">Sign out</button><span role="status" className="sr-only">{message}</span></span>;
}
