'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('[Godmode] Logout request failed:', err);
    }
    router.push('/login');
  }

  return (
    <button
      onClick={() => { void handleLogout(); }}
      className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:text-red-400 transition-colors rounded hover:bg-[#1e1e2e]"
    >
      Sign out
    </button>
  );
}
