import type { ReactNode } from 'react';

/**
 * Fullscreen layout — no sidebar, no dashboard shell.
 * Used by /pos, /kds, and /kiosk routes.
 */
export default function FullscreenLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-black">
      {children}
    </div>
  );
}
