'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, MapPin, ShoppingBag, Store, ArrowRight } from 'lucide-react';
import { apiFetch } from '@/lib/api';

// ---------------------------------------------------------------------------
// Lightweight confetti animation (no extra dependency)
// ---------------------------------------------------------------------------

function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const COLORS = ['#6272f5', '#4f52e8', '#8198fa', '#f59e0b', '#10b981', '#ef4444', '#ec4899'];
    const PARTICLE_COUNT = 80;

    interface Particle {
      x: number;
      y: number;
      w: number;
      h: number;
      color: string;
      vx: number;
      vy: number;
      rotation: number;
      rotationSpeed: number;
      opacity: number;
    }

    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 8 + 4,
      h: Math.random() * 6 + 2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      vx: (Math.random() - 0.5) * 3,
      vy: Math.random() * 3 + 2,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
      opacity: 1,
    }));

    let animationId: number;
    let frame = 0;

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frame++;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        // Fade out after falling past 70%
        if (p.y > canvas.height * 0.7) {
          p.opacity = Math.max(0, p.opacity - 0.02);
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      // Stop after ~3 seconds of animation
      if (frame < 180) {
        animationId = requestAnimationFrame(draw);
      }
    }

    draw();
    return () => cancelAnimationFrame(animationId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Completion page
// ---------------------------------------------------------------------------

export default function SetupCompletePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [posted, setPosted] = useState(false);
  const [industry, setIndustry] = useState('');
  const [location, setLocation] = useState('');
  const [productCount, setProductCount] = useState('0');

  // Read setup summary from sessionStorage
  useEffect(() => {
    setIndustry(sessionStorage.getItem('elevatedpos_setup_industry') ?? '');
    setLocation(sessionStorage.getItem('elevatedpos_setup_location') ?? '');
    setProductCount(sessionStorage.getItem('elevatedpos_setup_products') ?? '0');
  }, []);

  // POST completion step once on mount
  useEffect(() => {
    if (posted) return;
    setPosted(true);

    apiFetch('organisations/onboarding', {
      method: 'POST',
      body: JSON.stringify({ step: 'completed' }),
    }).catch(() => {
      // Best-effort — don't block the user
    });
  }, [posted]);

  function handleGoToDashboard() {
    setLoading(true);
    // Clear setup session data
    sessionStorage.removeItem('elevatedpos_setup_industry');
    sessionStorage.removeItem('elevatedpos_setup_location');
    sessionStorage.removeItem('elevatedpos_setup_products');
    router.push('/dashboard');
  }

  const industryLabel = industry ? industry.charAt(0).toUpperCase() + industry.slice(1) : null;
  const numProducts = parseInt(productCount, 10);

  return (
    <div className="relative overflow-hidden">
      <ConfettiCanvas />

      <div className="relative z-10 text-center">
        {/* Success icon */}
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
          <CheckCircle2 className="h-9 w-9 text-green-600 dark:text-green-400" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          You&apos;re all set!
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Your ElevatedPOS account is ready to go. Here&apos;s a summary of what we set up:
        </p>

        {/* Summary cards */}
        <div className="mx-auto mt-8 max-w-sm space-y-3 text-left">
          {industryLabel && (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/40">
                <Store className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Industry</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{industryLabel}</p>
              </div>
            </div>
          )}

          {location && (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/40">
                <MapPin className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Location</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{location}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/40">
              <ShoppingBag className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Products</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {numProducts > 0 ? `${numProducts} sample products created` : 'None added yet'}
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-8">
          <button
            type="button"
            onClick={handleGoToDashboard}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading...
              </>
            ) : (
              <>
                Go to Dashboard
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
