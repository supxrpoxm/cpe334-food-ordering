'use client';
import { useState } from 'react';
export function LogoutButton() { const [message, setMessage] = useState(''); async function logout() { setMessage(''); try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); setMessage('Signed out.'); } catch { setMessage('Could not sign out. Please try again.'); } } return <span className="flex items-center gap-2"><button onClick={logout} className="min-h-11 rounded-lg border border-stone-400 px-4 text-base hover:bg-stone-100">Sign out</button><span role="status" className="sr-only">{message}</span></span>; }
