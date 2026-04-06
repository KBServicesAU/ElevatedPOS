import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/auth';

const WARNING_SECONDS = 60; // show "session expiring" banner at 60 s remaining

interface InactivityTimerState {
  /** Seconds left before auto-logout. `null` when timer is disabled. */
  secondsRemaining: number | null;
  /** `true` during the last 60-second warning phase. */
  showWarning: boolean;
  /** Call on any user interaction to reset the inactivity clock. */
  resetTimer: () => void;
}

/**
 * Manages the auto-logout inactivity timer.
 *
 * - Reads `autoLogoutMinutes` from the auth store (0 = disabled).
 * - Uses `useRef` + `setTimeout` for the main logout trigger (no re-renders).
 * - A 1-second `setInterval` drives the countdown only during the warning phase.
 * - Returns a `resetTimer` callback to wire up to touch / interaction handlers.
 * - Calls `onExpired` when the timer reaches zero.
 */
export function useInactivityTimer(onExpired: () => void): InactivityTimerState {
  const autoLogoutMinutes = useAuthStore((s) => s.autoLogoutMinutes);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Mutable refs so we never stale-capture values in timeouts
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const clearAllTimers = useCallback(() => {
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setShowWarning(false);
    setSecondsRemaining(null);
  }, []);

  const startTimers = useCallback(() => {
    clearAllTimers();

    if (autoLogoutMinutes === 0 || !isAuthenticated) return;

    const totalMs = autoLogoutMinutes * 60 * 1000;
    const warningMs = totalMs - WARNING_SECONDS * 1000;

    // Main logout timeout
    logoutTimerRef.current = setTimeout(() => {
      clearAllTimers();
      onExpiredRef.current();
    }, totalMs);

    // Warning phase — starts 60 s before logout
    if (warningMs > 0) {
      warningTimerRef.current = setTimeout(() => {
        setShowWarning(true);
        let remaining = WARNING_SECONDS;
        setSecondsRemaining(remaining);

        countdownRef.current = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            setSecondsRemaining(0);
          } else {
            setSecondsRemaining(remaining);
          }
        }, 1000);
      }, warningMs);
    } else {
      // Timer is very short (< 60 s) — enter warning immediately
      setShowWarning(true);
      let remaining = Math.floor(totalMs / 1000);
      setSecondsRemaining(remaining);

      countdownRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          setSecondsRemaining(0);
        } else {
          setSecondsRemaining(remaining);
        }
      }, 1000);
    }
  }, [autoLogoutMinutes, isAuthenticated, clearAllTimers]);

  // Initialise and restart whenever the setting or auth state changes
  useEffect(() => {
    startTimers();
    return clearAllTimers;
  }, [startTimers, clearAllTimers]);

  const resetTimer = useCallback(() => {
    startTimers();
  }, [startTimers]);

  return { secondsRemaining, showWarning, resetTimer };
}
