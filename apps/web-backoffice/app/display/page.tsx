'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TextSection {
  id: string;
  type: 'text';
  content: string;
  style: { fontSize: number; color: string; fontWeight?: string; textAlign?: string };
}
interface MenuSection {
  id: string;
  type: 'menu';
  categoryId: string;
  categoryName?: string;
  style: { columns: 1 | 2 | 3; showPrices: boolean };
}
interface ImageSection {
  id: string;
  type: 'image';
  url: string;
  style: { height: number };
}
interface SpacerSection {
  id: string;
  type: 'spacer';
  height: number;
}
type Section = TextSection | MenuSection | ImageSection | SpacerSection;

interface DisplayContent {
  background: { type: 'color' | 'image'; value: string };
  logo?: { url: string; position: 'top-left' | 'top-right' | 'top-center' };
  sections: Section[];
  theme: 'dark' | 'light';
  pollIntervalSeconds: number;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description?: string;
  imageUrl?: string;
}

const STORAGE_KEY = 'elevatedpos_display_token';
// v2.7.34+ — default to same-origin so the request hits whatever
// hostname serves the display page. The previous default of
// `https://api.elevatedpos.com.au` failed because that subdomain isn't
// in the ingress (only `app.elevatedpos.com.au` is, and `/api/v1/*`
// routes on that host are mapped to the backend services directly).
// Browsers surfaced this as the uninformative "Failed to fetch" on
// the pair screen.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

const CODE_LENGTH = 6;

// ── Pairing Screen ─────────────────────────────────────────────────────────────

function PairingScreen({ onPaired }: { onPaired: (token: string) => void }) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const code = digits.join('');
  const isComplete = digits.every((d) => d.length === 1);

  function handleChange(value: string, index: number) {
    const char = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);
    setError(null);
    if (char && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handlePair() {
    if (!isComplete || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/devices/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, platform: 'web', appVersion: '1.0.0' }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? 'Pairing failed');
      }
      const data = (await res.json()) as { data: { deviceToken: string } };
      const token = data.data.deviceToken;
      localStorage.setItem(STORAGE_KEY, token);
      onPaired(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pairing failed. Please try again.');
      setDigits(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0d0d14',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
        padding: '32px',
      }}
    >
      <div
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '20px',
          padding: '56px 48px',
          maxWidth: '480px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: '32px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '72px',
              height: '72px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              marginBottom: '20px',
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#6366f1', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>
            ElevatedPOS
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#fff', marginBottom: '8px' }}>
            Pair Display Screen
          </div>
          <div style={{ fontSize: '15px', color: '#888', lineHeight: '1.5' }}>
            Enter the pairing code from your ElevatedPOS dashboard
          </div>
        </div>

        {/* Code inputs */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '28px' }}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              value={digit}
              onChange={(e) => handleChange(e.target.value, i)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              maxLength={1}
              autoFocus={i === 0}
              style={{
                width: '56px',
                height: '64px',
                textAlign: 'center',
                fontSize: '24px',
                fontWeight: '800',
                letterSpacing: '0',
                background: 'rgba(255,255,255,0.06)',
                border: `2px solid ${digit ? '#6366f1' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: '12px',
                color: '#fff',
                outline: 'none',
                caretColor: '#6366f1',
                transition: 'border-color 0.15s',
              }}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '10px',
              padding: '12px 16px',
              color: '#ef4444',
              fontSize: '14px',
              marginBottom: '20px',
            }}
          >
            {error}
          </div>
        )}

        {/* Pair button */}
        <button
          onClick={handlePair}
          disabled={!isComplete || loading}
          style={{
            width: '100%',
            padding: '16px',
            fontSize: '16px',
            fontWeight: '700',
            borderRadius: '12px',
            border: 'none',
            cursor: isComplete && !loading ? 'pointer' : 'not-allowed',
            background:
              isComplete && !loading
                ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                : 'rgba(255,255,255,0.08)',
            color: isComplete && !loading ? '#fff' : '#555',
            transition: 'all 0.2s',
            letterSpacing: '0.5px',
          }}
        >
          {loading ? 'Pairing...' : 'Pair Device'}
        </button>
      </div>
    </div>
  );
}

// ── Content Renderer ───────────────────────────────────────────────────────────

function ContentRenderer({
  content,
  menuItems,
}: {
  content: DisplayContent;
  menuItems: Record<string, MenuItem[]>;
}) {
  const isDark = content.theme !== 'light';

  const logoJustify =
    content.logo?.position === 'top-right'
      ? 'flex-end'
      : content.logo?.position === 'top-center'
      ? 'center'
      : 'flex-start';

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    width: '100%',
    overflowY: 'auto',
    fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
    ...(content.background.type === 'color'
      ? { backgroundColor: content.background.value }
      : {
          backgroundImage: `url(${content.background.value})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }),
  };

  return (
    <div style={containerStyle}>
      <div style={{ padding: '40px', maxWidth: '1600px', margin: '0 auto' }}>
        {/* Logo */}
        {content.logo?.url && (
          <div style={{ display: 'flex', justifyContent: logoJustify, marginBottom: '24px' }}>
            <img
              src={content.logo.url}
              alt="Logo"
              style={{ maxWidth: '220px', maxHeight: '100px', objectFit: 'contain' }}
            />
          </div>
        )}

        {/* Sections */}
        {content.sections.map((section) => {
          if (section.type === 'spacer') {
            return <div key={section.id} style={{ height: `${section.height}px` }} />;
          }

          if (section.type === 'text') {
            return (
              <div
                key={section.id}
                style={{
                  fontSize: `${section.style.fontSize}px`,
                  color: section.style.color,
                  fontWeight: section.style.fontWeight ?? 'normal',
                  textAlign: (section.style.textAlign as React.CSSProperties['textAlign']) ?? 'left',
                  marginBottom: '20px',
                  lineHeight: 1.3,
                }}
              >
                {section.content}
              </div>
            );
          }

          if (section.type === 'image') {
            return (
              <div key={section.id} style={{ marginBottom: '20px' }}>
                <img
                  src={section.url}
                  alt=""
                  style={{
                    width: '100%',
                    height: `${section.style.height}px`,
                    objectFit: 'cover',
                    borderRadius: '12px',
                    display: 'block',
                  }}
                />
              </div>
            );
          }

          if (section.type === 'menu') {
            const items = menuItems[section.categoryId] ?? [];
            const cols = section.style.columns;
            const colPercent = `${100 / cols}%`;

            return (
              <div key={section.id} style={{ marginBottom: '40px' }}>
                {section.categoryName && (
                  <div
                    style={{
                      fontSize: '32px',
                      fontWeight: '900',
                      color: isDark ? '#fff' : '#111',
                      letterSpacing: '3px',
                      textTransform: 'uppercase',
                      marginBottom: '20px',
                      borderBottom: `2px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                      paddingBottom: '12px',
                    }}
                  >
                    {section.categoryName}
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0',
                  }}
                >
                  {items.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        width: colPercent,
                        padding: '12px 16px 12px 0',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div
                        style={{
                          background: isDark
                            ? 'rgba(255,255,255,0.04)'
                            : 'rgba(0,0,0,0.03)',
                          borderRadius: '12px',
                          padding: '16px 20px',
                          border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: '20px',
                            fontWeight: '700',
                            color: isDark ? '#fff' : '#111',
                            marginBottom: section.style.showPrices ? '6px' : '0',
                            lineHeight: 1.3,
                          }}
                        >
                          {item.name}
                        </div>
                        {item.description && (
                          <div
                            style={{
                              fontSize: '14px',
                              color: isDark ? '#999' : '#666',
                              marginBottom: section.style.showPrices ? '10px' : '0',
                              lineHeight: 1.4,
                            }}
                          >
                            {item.description}
                          </div>
                        )}
                        {section.style.showPrices && (
                          <div
                            style={{
                              fontSize: '22px',
                              fontWeight: '900',
                              color: '#6366f1',
                            }}
                          >
                            ${item.price.toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}

// ── Waiting Screen ─────────────────────────────────────────────────────────────

function WaitingScreen() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0d0d14',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
        padding: '40px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '80px', marginBottom: '32px', lineHeight: 1 }}>📺</div>
      <div style={{ fontSize: '40px', fontWeight: '800', color: '#fff', marginBottom: '16px' }}>
        Display Ready
      </div>
      <div style={{ fontSize: '18px', color: '#555', maxWidth: '460px', lineHeight: 1.6 }}>
        Publish content from the ElevatedPOS dashboard to see it here.
      </div>
      <div
        style={{
          marginTop: '48px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: '#333',
          fontSize: '14px',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
        Checking for updates…
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DisplayPage() {
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [content, setContent] = useState<DisplayContent | null>(null);
  const [menuItems, setMenuItems] = useState<Record<string, MenuItem[]>>({});
  const [loading, setLoading] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate token from localStorage (client-only)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setDeviceToken(stored);
    setHydrated(true);
  }, []);

  const fetchMenuItems = useCallback(
    async (categoryId: string, token: string) => {
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/products?categoryId=${categoryId}&limit=50&isActive=true`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { data: MenuItem[] };
        setMenuItems((prev) => ({ ...prev, [categoryId]: data.data ?? [] }));
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const fetchContent = useCallback(
    async (token: string) => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/display/content`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401 || res.status === 403) {
          // Token revoked — force re-pair
          localStorage.removeItem(STORAGE_KEY);
          setDeviceToken(null);
          setContent(null);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as {
          data: { content: DisplayContent | null; pollIntervalSeconds: number };
        };
        const newContent = data.data.content;
        setContent(newContent);
        setLoading(false);

        // Prefetch menu items for all menu sections
        if (newContent) {
          const menuSections = newContent.sections.filter(
            (s): s is MenuSection => s.type === 'menu',
          );
          setMenuItems((prev) => {
            for (const section of menuSections) {
              if (!prev[section.categoryId]) {
                fetchMenuItems(section.categoryId, token);
              }
            }
            return prev;
          });
        }

        // Schedule next poll
        const intervalMs = (data.data.pollIntervalSeconds ?? 30) * 1000;
        if (pollTimer.current) clearTimeout(pollTimer.current);
        pollTimer.current = setTimeout(() => fetchContent(token), intervalMs);
      } catch {
        setLoading(false);
        // Retry after 60s on error
        if (pollTimer.current) clearTimeout(pollTimer.current);
        pollTimer.current = setTimeout(() => fetchContent(token), 60_000);
      }
    },
    [fetchMenuItems],
  );

  // Start polling once we have a token
  useEffect(() => {
    if (!deviceToken) return;
    setLoading(true);
    fetchContent(deviceToken);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [deviceToken, fetchContent]);

  // Not yet hydrated — render nothing (avoids SSR/localStorage mismatch)
  if (!hydrated) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#0d0d14',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: '3px solid rgba(99,102,241,0.3)',
            borderTopColor: '#6366f1',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // No token — show pairing screen
  if (!deviceToken) {
    return <PairingScreen onPaired={(token) => { setDeviceToken(token); }} />;
  }

  // Loading first fetch
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#0d0d14',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            border: '4px solid rgba(99,102,241,0.3)',
            borderTopColor: '#6366f1',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // No content published yet
  if (!content) {
    return <WaitingScreen />;
  }

  // Render published content
  return <ContentRenderer content={content} menuItems={menuItems} />;
}
