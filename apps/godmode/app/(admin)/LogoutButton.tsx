'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <button
      onClick={handleLogout}
      className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:text-red-400 transition-colors rounded hover:bg-[#1e1e2e]"
    >
      Sign out
    </button>
  );
}
