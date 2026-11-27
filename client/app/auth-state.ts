export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: 'CUSTOMER' | 'ADMIN';
};

export const AUTH_STATE_CHANGED = 'good-table:auth-state-changed';

export function notifyAuthStateChanged(user: AuthUser | null): void {
  window.dispatchEvent(new CustomEvent<AuthUser | null>(AUTH_STATE_CHANGED, { detail: user }));
}
