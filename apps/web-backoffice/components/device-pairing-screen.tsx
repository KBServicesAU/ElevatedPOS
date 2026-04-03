'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Monitor, ChefHat, Tablet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { type DeviceInfo, setDeviceSession } from '@/lib/device-auth';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DevicePairingScreenProps {
  role: 'pos' | 'kds' | 'kiosk';
  onPaired: (info: DeviceInfo) => void;
}

// ─── Role metadata ────────────────────────────────────────────────────────────

const ROLE_META: Record<
  'pos' | 'kds' | 'kiosk',
  { label: string; Icon: React.ElementType; accent: string; iconColor: string }
> = {
  pos: {
    label: 'POS Terminal',
    Icon: Monitor,
    accent: 'border-indigo-500',
    iconColor: 'text-indigo-400',
  },
  kds: {
    label: 'Kitchen Display',
    Icon: ChefHat,
    accent: 'border-orange-500',
    iconColor: 'text-orange-400',
  },
  kiosk: {
    label: 'Self-Serve Kiosk',
    Icon: Tablet,
    accent: 'border-amber-500',
    iconColor: 'text-amber-400',
  },
};

// ─── 6-character code input ───────────────────────────────────────────────────

const CODE_LENGTH = 6;

function CodeInput({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const focusAt = (idx: number) => {
    const el = refs.current[idx];
    if (el) {
      el.focus();
      el.select();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (value[idx]) {
        // Clear current cell
        const next = [...value];
        next[idx] = '';
        onChange(next);
      } else if (idx > 0) {
        // Move to previous cell and clear it
        const next = [...value];
        next[idx - 1] = '';
        onChange(next);
        focusAt(idx - 1);
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      focusAt(idx - 1);
    } else if (e.key === 'ArrowRight' && idx < CODE_LENGTH - 1) {
      focusAt(idx + 1);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!raw) return;

    // Handle paste of multiple chars into a single cell
    if (raw.length > 1) {
      const chars = raw.slice(0, CODE_LENGTH - idx).split('');
      const next = [...value];
      chars.forEach((ch, i) => {
        if (idx + i < CODE_LENGTH) next[idx + i] = ch;
      });
      onChange(next);
      const lastFilled = Math.min(idx + chars.length, CODE_LENGTH - 1);
      focusAt(lastFilled);
      return;
    }

    const next = [...value];
    next[idx] = raw[0];
    onChange(next);
    if (idx < CODE_LENGTH - 1) focusAt(idx + 1);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, idx: number) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData('text')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, CODE_LENGTH);
    if (!pasted) return;
    const next = Array(CODE_LENGTH).fill('') as string[];
    pasted.split('').forEach((ch, i) => {
      next[i] = ch;
    });
    onChange(next);
    focusAt(Math.min(pasted.length, CODE_LENGTH - 1));
  };

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Pairing code">
      {Array.from({ length: CODE_LENGTH }).map((_, idx) => (
        <input
          key={idx}
          ref={(el) => { refs.current[idx] = el; }}
          type="text"
          inputMode="text"
          maxLength={1}
          autoComplete={idx === 0 ? 'one-time-code' : 'off'}
          aria-label={`Pairing code digit ${idx + 1} of ${CODE_LENGTH}`}
          value={value[idx] ?? ''}
          disabled={disabled}
          onChange={(e) => handleInput(e, idx)}
          onKeyDown={(e) => handleKeyDown(e, idx)}
          onPaste={(e) => handlePaste(e, idx)}
          onFocus={(e) => e.target.select()}
          className={`h-14 w-12 rounded-xl border-2 bg-[#1e1e2e] text-center font-mono text-2xl font-bold uppercase tracking-widest text-white outline-none transition-colors sm:h-16 sm:w-14 ${
            value[idx]
              ? 'border-indigo-400 text-indigo-200'
              : 'border-[#3a3a4a] focus:border-indigo-500'
          } disabled:opacity-40`}
        />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DevicePairingScreen({ role, onPaired }: DevicePairingScreenProps) {
  const { label, Icon, accent, iconColor } = ROLE_META[role];

  const [chars, setChars] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const code = chars.join('');
  const isComplete = code.length === CODE_LENGTH && chars.every(Boolean);

  const handleConnect = useCallback(async () => {
    if (!isComplete || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/device/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      const data = await res.json() as {
        deviceId?: string;
        deviceToken?: string;
        role?: string;
        locationId?: string;
        orgId?: string;
        label?: string;
        registerId?: string;
        error?: string;
      };

      if (!res.ok) {
        setError(data.error ?? 'Pairing failed. Please try again.');
        setChars(Array(CODE_LENGTH).fill(''));
        return;
      }

      if (!data.deviceToken || !data.deviceId || !data.locationId || !data.orgId) {
        setError('Invalid response from server. Please try again.');
        setChars(Array(CODE_LENGTH).fill(''));
        return;
      }

      const info: DeviceInfo = {
        deviceId: data.deviceId,
        role: (data.role as DeviceInfo['role']) ?? role,
        locationId: data.locationId,
        orgId: data.orgId,
        label: data.label,
        registerId: data.registerId,
      };

      setDeviceSession(data.deviceToken, info);
      setSuccess(true);

      // Brief success pause before calling back
      setTimeout(() => onPaired(info), 1200);
    } catch {
      setError('Network error. Please check your connection and try again.');
      setChars(Array(CODE_LENGTH).fill(''));
    } finally {
      setLoading(false);
    }
  }, [code, isComplete, loading, onPaired, role]);

  // Auto-submit once all 6 chars are filled
  useEffect(() => {
    if (isComplete && !loading && !success) {
      void handleConnect();
    }
  }, [isComplete, loading, success, handleConnect]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0f0f1a] px-4 py-12">
      {/* Card */}
      <div
        className={`w-full max-w-md rounded-2xl border-2 ${accent} bg-[#1a1a2e] p-8 shadow-2xl sm:p-10`}
      >
        {/* Branding */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0f0f1a] ${iconColor}`}
          >
            <Icon className="h-8 w-8" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              ElevatedPOS
            </p>
            <h1 className="mt-1 text-2xl font-extrabold text-white">Device Setup</h1>
            <p className="mt-1 text-sm font-medium text-indigo-300">{label}</p>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-gray-400">
            Enter the pairing code displayed in your backoffice to activate this terminal.
          </p>
        </div>

        {/* Code inputs */}
        <div className="mb-6 flex flex-col items-center gap-4">
          <CodeInput value={chars} onChange={setChars} disabled={loading || success} />
          <p className="text-xs text-gray-600">6-character alphanumeric code</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-5 flex items-start gap-2 rounded-xl border border-red-800 bg-red-950/60 px-4 py-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-green-800 bg-green-950/60 px-4 py-3 text-sm text-green-300">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            <span>Device paired successfully! Starting up…</span>
          </div>
        )}

        {/* Button */}
        <button
          onClick={() => void handleConnect()}
          disabled={!isComplete || loading || success}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 text-base font-bold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Connecting…
            </>
          ) : success ? (
            <>
              <CheckCircle className="h-5 w-5" />
              Connected
            </>
          ) : (
            'Connect Device'
          )}
        </button>

        {/* Footer hint */}
        <p className="mt-5 text-center text-xs text-gray-600">
          Generate a pairing code in{' '}
          <Link
            href="/dashboard/devices"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 underline hover:text-indigo-300"
          >
            Backoffice &rsaquo; Devices
          </Link>
        </p>
      </div>
    </div>
  );
}
