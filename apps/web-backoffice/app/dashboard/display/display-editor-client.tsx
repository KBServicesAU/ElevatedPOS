'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import {
  Monitor, Plus, Trash2, ChevronUp, ChevronDown,
  Image as ImageIcon, Type, AlignLeft, LayoutGrid,
  Columns2, Columns3, Eye, Upload, Tv,
  RefreshCw, CheckCircle, AlertCircle,
} from 'lucide-react';
// v2.7.38 — route through the shared apiFetch / /api/proxy so the
// session cookie gets converted to a Bearer token server-side. Before
// this, the local apiFetch hit the backend services directly with just
// cookies, which the services reject (they use request.jwtVerify()).
// That's why /dashboard/display showed "No display screens" even after
// adding the ingress rule in v2.7.36 — the ingress only helped if the
// request had an Authorization header, which the direct fetch didn't.
import { apiFetch as proxyApiFetch } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DisplayScreen {
  id: string;
  label: string | null;
  locationId: string;
  lastSeenAt: string | null;
  status: 'online' | 'offline';
  hasContent: boolean;
}

interface TextSection {
  id: string;
  type: 'text';
  content: string;
  style: { fontSize: number; color: string; fontWeight: string; textAlign: string };
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

interface Category {
  id: string;
  name: string;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function defaultContent(): DisplayContent {
  return {
    background: { type: 'color', value: '#0d0d14' },
    sections: [],
    theme: 'dark',
    pollIntervalSeconds: 30,
  };
}

// v2.7.38 — local apiFetch removed in favour of the shared
// `proxyApiFetch` imported above. The local one called the backend
// services directly with just the session cookie, but the services
// only accept Bearer JWTs (request.jwtVerify()). The /api/proxy/*
// route handler converts cookie → Bearer server-side.

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── Section editors ────────────────────────────────────────────────────────────

function TextSectionEditor({
  section,
  onChange,
}: {
  section: TextSection;
  onChange: (s: TextSection) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Content</label>
        <textarea
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
          rows={3}
          value={section.content}
          onChange={(e) => onChange({ ...section, content: e.target.value })}
          placeholder="Enter display text…"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            Font Size: {section.style.fontSize}px
          </label>
          <input
            type="range"
            min={24}
            max={96}
            value={section.style.fontSize}
            onChange={(e) =>
              onChange({ ...section, style: { ...section.style, fontSize: Number(e.target.value) } })
            }
            className="w-full accent-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={section.style.color}
              onChange={(e) =>
                onChange({ ...section, style: { ...section.style, color: e.target.value } })
              }
              className="w-10 h-8 rounded cursor-pointer border border-gray-700 bg-transparent"
            />
            <input
              type="text"
              value={section.style.color}
              onChange={(e) =>
                onChange({ ...section, style: { ...section.style, color: e.target.value } })
              }
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Font Weight</label>
          <select
            value={section.style.fontWeight}
            onChange={(e) =>
              onChange({ ...section, style: { ...section.style, fontWeight: e.target.value } })
            }
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="normal">Normal</option>
            <option value="600">Semi-bold</option>
            <option value="bold">Bold</option>
            <option value="800">Extra-bold</option>
            <option value="900">Black</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Alignment</label>
          <div className="flex gap-1">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                onClick={() =>
                  onChange({ ...section, style: { ...section.style, textAlign: align } })
                }
                className={`flex-1 py-1.5 rounded text-xs font-semibold capitalize transition-colors ${
                  section.style.textAlign === align
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {align}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuSectionEditor({
  section,
  categories,
  onChange,
}: {
  section: MenuSection;
  categories: Category[];
  onChange: (s: MenuSection) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Category</label>
        <select
          value={section.categoryId}
          onChange={(e) => {
            const cat = categories.find((c) => c.id === e.target.value);
            onChange({ ...section, categoryId: e.target.value, categoryName: cat?.name });
          }}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">— Select a category —</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Columns</label>
        <div className="flex gap-2">
          {([1, 2, 3] as const).map((n) => (
            <button
              key={n}
              onClick={() => onChange({ ...section, style: { ...section.style, columns: n } })}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                section.style.columns === n
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {n === 1 ? <AlignLeft className="h-3.5 w-3.5" /> : n === 2 ? <Columns2 className="h-3.5 w-3.5" /> : <Columns3 className="h-3.5 w-3.5" />}
              {n} col{n !== 1 ? 's' : ''}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-300 font-medium">Show Prices</span>
        <button
          onClick={() =>
            onChange({ ...section, style: { ...section.style, showPrices: !section.style.showPrices } })
          }
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            section.style.showPrices ? 'bg-indigo-600' : 'bg-gray-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              section.style.showPrices ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function ImageSectionEditor({
  section,
  onChange,
}: {
  section: ImageSection;
  onChange: (s: ImageSection) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Image URL</label>
        <input
          type="url"
          value={section.url}
          onChange={(e) => onChange({ ...section, url: e.target.value })}
          placeholder="https://…"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
          Height: {section.style.height}px
        </label>
        <input
          type="range"
          min={100}
          max={600}
          step={10}
          value={section.style.height}
          onChange={(e) =>
            onChange({ ...section, style: { ...section.style, height: Number(e.target.value) } })
          }
          className="w-full accent-indigo-500"
        />
      </div>
    </div>
  );
}

function SpacerSectionEditor({
  section,
  onChange,
}: {
  section: SpacerSection;
  onChange: (s: SpacerSection) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
        Height: {section.height}px
      </label>
      <input
        type="range"
        min={8}
        max={128}
        step={4}
        value={section.height}
        onChange={(e) => onChange({ ...section, height: Number(e.target.value) })}
        className="w-full accent-indigo-500"
      />
    </div>
  );
}

// ── Mini Preview ───────────────────────────────────────────────────────────────

function MiniPreview({
  content,
  menuItems,
}: {
  content: DisplayContent;
  menuItems: Record<string, MenuItem[]>;
}) {
  const isDark = content.theme !== 'light';
  const bgStyle: React.CSSProperties =
    content.background.type === 'color'
      ? { backgroundColor: content.background.value }
      : {
          backgroundImage: `url(${content.background.value})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        };

  const logoJustify =
    content.logo?.position === 'top-right'
      ? 'flex-end'
      : content.logo?.position === 'top-center'
      ? 'center'
      : 'flex-start';

  return (
    <div
      style={{
        ...bgStyle,
        width: '100%',
        aspectRatio: '16/9',
        borderRadius: '8px',
        overflow: 'hidden',
        fontFamily: 'sans-serif',
        padding: '16px',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {content.logo?.url && (
        <div style={{ display: 'flex', justifyContent: logoJustify, marginBottom: '8px' }}>
          <img
            src={content.logo.url}
            alt="logo"
            style={{ maxHeight: '24px', maxWidth: '80px', objectFit: 'contain' }}
          />
        </div>
      )}
      <div style={{ overflow: 'hidden', maxHeight: 'calc(100% - 40px)' }}>
        {content.sections.map((section) => {
          if (section.type === 'spacer') {
            return <div key={section.id} style={{ height: `${Math.max(2, section.height / 8)}px` }} />;
          }
          if (section.type === 'text') {
            return (
              <div
                key={section.id}
                style={{
                  fontSize: `${Math.max(6, section.style.fontSize / 6)}px`,
                  color: section.style.color,
                  fontWeight: section.style.fontWeight,
                  textAlign: section.style.textAlign as React.CSSProperties['textAlign'],
                  marginBottom: '4px',
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}
              >
                {section.content || '(empty text)'}
              </div>
            );
          }
          if (section.type === 'image') {
            return section.url ? (
              <img
                key={section.id}
                src={section.url}
                alt=""
                style={{
                  width: '100%',
                  height: `${Math.max(10, section.style.height / 8)}px`,
                  objectFit: 'cover',
                  borderRadius: '4px',
                  marginBottom: '4px',
                  display: 'block',
                }}
              />
            ) : (
              <div
                key={section.id}
                style={{
                  width: '100%',
                  height: `${Math.max(10, section.style.height / 8)}px`,
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '4px',
                  marginBottom: '4px',
                }}
              />
            );
          }
          if (section.type === 'menu') {
            const items = menuItems[section.categoryId]?.slice(0, 6) ?? [];
            return (
              <div key={section.id} style={{ marginBottom: '6px' }}>
                {section.categoryName && (
                  <div
                    style={{
                      fontSize: '7px',
                      fontWeight: '900',
                      color: isDark ? '#fff' : '#111',
                      letterSpacing: '1px',
                      textTransform: 'uppercase',
                      marginBottom: '3px',
                    }}
                  >
                    {section.categoryName}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                  {items.length > 0
                    ? items.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            width: `calc(${100 / section.style.columns}% - 2px)`,
                            padding: '2px 4px',
                            background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                            borderRadius: '3px',
                            fontSize: '5px',
                            color: isDark ? '#ddd' : '#222',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.name}
                          {section.style.showPrices && (
                            <span style={{ color: '#6366f1', marginLeft: '4px' }}>
                              ${item.price.toFixed(2)}
                            </span>
                          )}
                        </div>
                      ))
                    : Array.from({ length: 4 }).map((_, i) => (
                        <div
                          key={i}
                          style={{
                            width: `calc(${100 / section.style.columns}% - 2px)`,
                            height: '10px',
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '3px',
                          }}
                        />
                      ))}
                </div>
              </div>
            );
          }
          return null;
        })}
      </div>
      {content.sections.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.2)',
            fontSize: '10px',
            fontWeight: '600',
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}
        >
          No sections
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

// v2.7.80 — sentinel id used by the dashboard's "Default Template"
// virtual screen. Saving with this id PUTs to /display/default-content
// instead of /display/screens/:id/content. Using a UUID-shaped string
// keeps the type system happy without polluting `selectedScreenId` with
// a separate union type.
const DEFAULT_TEMPLATE_ID = '00000000-0000-0000-0000-000000default';

export default function DisplayEditorClient() {
  const [screens, setScreens] = useState<DisplayScreen[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<Record<string, MenuItem[]>>({});
  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null);
  const [content, setContent] = useState<DisplayContent>(defaultContent());
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [showAddSection, setShowAddSection] = useState(false);
  // v2.7.80 — track whether an org-level default exists so the
  // sidebar entry can show a "Published" badge.
  const [defaultPublished, setDefaultPublished] = useState(false);

  const isDefaultTemplate = selectedScreenId === DEFAULT_TEMPLATE_ID;
  const selectedScreen = isDefaultTemplate
    ? ({ id: DEFAULT_TEMPLATE_ID, label: 'Default Template', locationId: '', lastSeenAt: null, status: 'offline' as const, hasContent: defaultPublished })
    : screens.find((s) => s.id === selectedScreenId) ?? null;

  // ── Fetch screens & categories on mount ──────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const [screensData, catsData, defaultData] = await Promise.all([
          // v2.7.38 — `display` + `categories` go through /api/proxy so the
          // session cookie is exchanged for a Bearer token server-side.
          proxyApiFetch<{ data: DisplayScreen[] }>('display/screens'),
          proxyApiFetch<{ data: Category[] }>('categories'),
          // v2.7.80 — also fetch the org's default template so the
          // sidebar entry can show "Published" if one exists.
          proxyApiFetch<{ data: { content: DisplayContent | null; publishedAt: string | null } }>(
            'display/default-content',
          ).catch(() => ({ data: { content: null, publishedAt: null } })),
        ]);
        setScreens(screensData.data ?? []);
        setCategories(catsData.data ?? []);
        setDefaultPublished(defaultData?.data?.content != null);
      } catch {
        // silently degrade
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // v2.7.80 — when the user picks the "Default Template" entry,
  // hydrate the editor from /display/default-content. Per-device
  // selection still falls through to the existing flow.
  useEffect(() => {
    if (selectedScreenId !== DEFAULT_TEMPLATE_ID) return;
    (async () => {
      try {
        const res = await proxyApiFetch<{
          data: { content: DisplayContent | null; publishedAt: string | null };
        }>('display/default-content');
        if (res?.data?.content) {
          setContent(res.data.content);
          setDefaultPublished(true);
        } else {
          setContent(defaultContent());
          setDefaultPublished(false);
        }
      } catch {
        setContent(defaultContent());
      }
    })();
  }, [selectedScreenId]);

  // ── Fetch menu items when a menu section is present ──────────────────────────

  useEffect(() => {
    const menuSections = content.sections.filter(
      (s): s is MenuSection => s.type === 'menu' && !!s.categoryId,
    );
    for (const section of menuSections) {
      if (!menuItems[section.categoryId]) {
        // v2.7.38 — proxy path.
        proxyApiFetch<{ data: MenuItem[] }>(
          `products?categoryId=${section.categoryId}&limit=50&isActive=true`,
        )
          .then((res) =>
            setMenuItems((prev) => ({ ...prev, [section.categoryId]: res.data ?? [] })),
          )
          .catch(() => undefined);
      }
    }
  }, [content.sections, menuItems]);

  // ── Section helpers ──────────────────────────────────────────────────────────

  function addSection(type: Section['type']) {
    let newSection: Section;
    switch (type) {
      case 'text':
        newSection = {
          id: uid(),
          type: 'text',
          content: '',
          style: { fontSize: 48, color: '#ffffff', fontWeight: 'bold', textAlign: 'left' },
        };
        break;
      case 'menu':
        newSection = {
          id: uid(),
          type: 'menu',
          categoryId: '',
          style: { columns: 2, showPrices: true },
        };
        break;
      case 'image':
        newSection = {
          id: uid(),
          type: 'image',
          url: '',
          style: { height: 300 },
        };
        break;
      case 'spacer':
        newSection = { id: uid(), type: 'spacer', height: 32 };
        break;
    }
    setContent((prev) => ({ ...prev, sections: [...prev.sections, newSection] }));
    setShowAddSection(false);
  }

  function updateSection(index: number, updated: Section) {
    setContent((prev) => {
      const sections = [...prev.sections];
      sections[index] = updated;
      return { ...prev, sections };
    });
  }

  function removeSection(index: number) {
    setContent((prev) => ({
      ...prev,
      sections: prev.sections.filter((_, i) => i !== index),
    }));
  }

  function moveSection(index: number, direction: 'up' | 'down') {
    setContent((prev) => {
      const sections = [...prev.sections];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= sections.length) return prev;
      [sections[index], sections[targetIndex]] = [sections[targetIndex]!, sections[index]!];
      return { ...prev, sections };
    });
  }

  // ── Publish ──────────────────────────────────────────────────────────────────

  async function handlePublish() {
    if (!selectedScreenId) return;
    setPublishing(true);
    setPublishError(null);
    setPublishSuccess(false);
    try {
      // v2.7.80 — Default Template publishes to /display/default-content
      // (org-level), not /display/screens/:id/content.
      const path = isDefaultTemplate
        ? 'display/default-content'
        : `display/screens/${selectedScreenId}/content`;
      await proxyApiFetch(path, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      });
      if (isDefaultTemplate) setDefaultPublished(true);
      setPublishSuccess(true);
      setTimeout(() => setPublishSuccess(false), 3000);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-6 w-6 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-900/40 border border-cyan-700/40">
            <Tv className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Display Screens</h1>
            <p className="text-sm text-gray-400">Manage digital signage content for your commercial screens</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left: Screen list */}
        <div className="col-span-3 space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1 mb-3">
            Signage Content
          </div>

          {/* v2.7.80 — Default Template entry. Always present so the
              merchant can design content before pairing any displays;
              new displays pick this up automatically until per-device
              content is published. */}
          <button
            onClick={() => setSelectedScreenId(DEFAULT_TEMPLATE_ID)}
            className={`w-full text-left rounded-xl border p-3 transition-all ${
              isDefaultTemplate
                ? 'border-indigo-500 bg-indigo-950/40'
                : 'border-gray-800 bg-gray-900 hover:border-gray-700'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-sm text-white truncate flex items-center gap-1.5">
                  <LayoutGrid className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                  Default Template
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Applies to new displays
                </div>
              </div>
              {defaultPublished && (
                <span className="mt-0.5 inline-block h-2.5 w-2.5 rounded-full bg-green-500 flex-shrink-0" />
              )}
            </div>
            {defaultPublished && (
              <div className="mt-1.5 flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                <span className="text-xs text-green-500 font-medium">Published</span>
              </div>
            )}
          </button>

          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1 pt-3">
            Paired Screens
          </div>

          {screens.length === 0 ? (
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 text-center">
              <Monitor className="h-8 w-8 text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 font-medium">No display screens</p>
              <p className="text-xs text-gray-600 mt-1">
                Pair a display device from the Devices page. Until then,
                use the Default Template above.
              </p>
            </div>
          ) : (
            screens.map((screen) => {
              const isOnline =
                screen.lastSeenAt &&
                Date.now() - new Date(screen.lastSeenAt).getTime() < 5 * 60_000;
              const isSelected = selectedScreenId === screen.id;
              return (
                <button
                  key={screen.id}
                  onClick={() => setSelectedScreenId(screen.id)}
                  className={`w-full text-left rounded-xl border p-3 transition-all ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-950/40'
                      : 'border-gray-800 bg-gray-900 hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-white truncate">
                        {screen.label ?? `Screen ${screen.id.slice(0, 6)}`}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Last seen: {timeAgo(screen.lastSeenAt)}
                      </div>
                    </div>
                    <span
                      className={`mt-0.5 inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                        isOnline ? 'bg-green-500' : 'bg-gray-600'
                      }`}
                    />
                  </div>
                  {screen.hasContent && (
                    <div className="mt-1.5 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      <span className="text-xs text-green-500 font-medium">Content published</span>
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Center: Editor */}
        <div className="col-span-5 space-y-4">
          {!selectedScreen ? (
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-10 text-center">
              <Tv className="h-10 w-10 text-gray-600 mx-auto mb-4" />
              <p className="text-sm text-gray-400 font-medium">Select a screen to edit its content</p>
            </div>
          ) : (
            <>
              {/* Background */}
              <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-gray-400" />
                  Background
                </h3>
                <div className="flex gap-2 mb-3">
                  {(['color', 'image'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() =>
                        setContent((prev) => ({
                          ...prev,
                          background: { type: t, value: t === 'color' ? '#0d0d14' : '' },
                        }))
                      }
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                        content.background.type === t
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {t === 'color' ? 'Solid Color' : 'Image URL'}
                    </button>
                  ))}
                </div>
                {content.background.type === 'color' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={content.background.value}
                      onChange={(e) =>
                        setContent((prev) => ({
                          ...prev,
                          background: { type: 'color', value: e.target.value },
                        }))
                      }
                      className="w-10 h-8 rounded cursor-pointer border border-gray-700 bg-transparent"
                    />
                    <input
                      type="text"
                      value={content.background.value}
                      onChange={(e) =>
                        setContent((prev) => ({
                          ...prev,
                          background: { type: 'color', value: e.target.value },
                        }))
                      }
                      className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                ) : (
                  <input
                    type="url"
                    value={content.background.value}
                    onChange={(e) =>
                      setContent((prev) => ({
                        ...prev,
                        background: { type: 'image', value: e.target.value },
                      }))
                    }
                    placeholder="https://…"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                )}
              </div>

              {/* Theme & Poll Interval */}
              <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
                <h3 className="text-sm font-bold text-white mb-3">Display Settings</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Theme</label>
                    <div className="flex gap-2">
                      {(['dark', 'light'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setContent((prev) => ({ ...prev, theme: t }))}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                            content.theme === t
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                      Poll every {content.pollIntervalSeconds}s
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={300}
                      step={5}
                      value={content.pollIntervalSeconds}
                      onChange={(e) =>
                        setContent((prev) => ({
                          ...prev,
                          pollIntervalSeconds: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Logo */}
              <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
                <h3 className="text-sm font-bold text-white mb-3">Logo (optional)</h3>
                <div className="space-y-2">
                  <input
                    type="url"
                    value={content.logo?.url ?? ''}
                    onChange={(e) =>
                      setContent((prev) => ({
                        ...prev,
                        logo: e.target.value
                          ? { url: e.target.value, position: prev.logo?.position ?? 'top-left' }
                          : undefined,
                      }))
                    }
                    placeholder="https://… (leave blank to hide)"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                  {content.logo?.url && (
                    <div className="flex gap-2">
                      {(['top-left', 'top-center', 'top-right'] as const).map((pos) => (
                        <button
                          key={pos}
                          onClick={() =>
                            setContent((prev) => ({
                              ...prev,
                              logo: prev.logo ? { ...prev.logo, position: pos } : undefined,
                            }))
                          }
                          className={`flex-1 py-1 rounded text-xs font-semibold transition-colors ${
                            content.logo?.position === pos
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                          }`}
                        >
                          {pos.replace('top-', '')}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Sections */}
              <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white">
                    Sections
                    {content.sections.length > 0 && (
                      <span className="ml-2 text-xs font-normal text-gray-500">
                        ({content.sections.length})
                      </span>
                    )}
                  </h3>
                  <button
                    onClick={() => setShowAddSection(!showAddSection)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Section
                  </button>
                </div>

                {/* Add section picker */}
                {showAddSection && (
                  <div className="mb-3 rounded-lg border border-indigo-700/40 bg-indigo-950/30 p-3">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                      Choose section type
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { type: 'text' as const, icon: Type, label: 'Text', desc: 'Heading, body copy' },
                          { type: 'menu' as const, icon: LayoutGrid, label: 'Menu', desc: 'Category products' },
                          { type: 'image' as const, icon: ImageIcon, label: 'Image', desc: 'Full-width image' },
                          { type: 'spacer' as const, icon: AlignLeft, label: 'Spacer', desc: 'Empty space' },
                        ] as const
                      ).map(({ type, icon: Icon, label, desc }) => (
                        <button
                          key={type}
                          onClick={() => addSection(type)}
                          className="flex items-start gap-2.5 p-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-left transition-colors border border-gray-700 hover:border-indigo-600"
                        >
                          <Icon className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <div className="text-xs font-semibold text-white">{label}</div>
                            <div className="text-xs text-gray-500">{desc}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Section list */}
                {content.sections.length === 0 ? (
                  <div className="py-8 text-center text-xs text-gray-600 font-medium">
                    No sections yet — add one above
                  </div>
                ) : (
                  <div className="space-y-2">
                    {content.sections.map((section, index) => {
                      const sectionTypeLabel =
                        section.type === 'text'
                          ? `Text: "${(section as TextSection).content.slice(0, 24) || '(empty)'}"`
                          : section.type === 'menu'
                          ? `Menu: ${(section as MenuSection).categoryName ?? 'No category'}`
                          : section.type === 'image'
                          ? 'Image'
                          : 'Spacer';

                      const SectionIcon =
                        section.type === 'text'
                          ? Type
                          : section.type === 'menu'
                          ? LayoutGrid
                          : section.type === 'image'
                          ? ImageIcon
                          : AlignLeft;

                      return (
                        <details
                          key={section.id}
                          className="rounded-lg border border-gray-800 bg-gray-800/50 overflow-hidden"
                        >
                          <summary className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer list-none hover:bg-gray-800 transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                              <SectionIcon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                              <span className="text-xs font-medium text-gray-300 truncate">
                                {sectionTypeLabel}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={(e) => { e.preventDefault(); moveSection(index, 'up'); }}
                                disabled={index === 0}
                                className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.preventDefault(); moveSection(index, 'down'); }}
                                disabled={index === content.sections.length - 1}
                                className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.preventDefault(); removeSection(index); }}
                                className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-950/40 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </summary>
                          <div className="px-3 pb-3 pt-1 border-t border-gray-700/50">
                            {section.type === 'text' && (
                              <TextSectionEditor
                                section={section as TextSection}
                                onChange={(updated) => updateSection(index, updated)}
                              />
                            )}
                            {section.type === 'menu' && (
                              <MenuSectionEditor
                                section={section as MenuSection}
                                categories={categories}
                                onChange={(updated) => updateSection(index, updated)}
                              />
                            )}
                            {section.type === 'image' && (
                              <ImageSectionEditor
                                section={section as ImageSection}
                                onChange={(updated) => updateSection(index, updated)}
                              />
                            )}
                            {section.type === 'spacer' && (
                              <SpacerSectionEditor
                                section={section as SpacerSection}
                                onChange={(updated) => updateSection(index, updated)}
                              />
                            )}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Publish button */}
              <div className="space-y-2">
                {publishError && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-950/40 border border-red-800/40 px-4 py-2.5 text-sm text-red-400">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {publishError}
                  </div>
                )}
                {publishSuccess && (
                  <div className="flex items-center gap-2 rounded-lg bg-green-950/40 border border-green-800/40 px-4 py-2.5 text-sm text-green-400">
                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    Content published successfully!
                  </div>
                )}
                <button
                  onClick={handlePublish}
                  disabled={publishing || !selectedScreenId}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold transition-colors"
                >
                  {publishing ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {publishing ? 'Publishing…' : 'Publish to Screen'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right: Preview */}
        <div className="col-span-4">
          <div className="sticky top-6 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <Eye className="h-3.5 w-3.5" />
              Live Preview
            </div>
            <div className="rounded-xl border border-gray-800 overflow-hidden bg-gray-900 p-3">
              <MiniPreview content={content} menuItems={menuItems} />
              <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
                <span>16:9 — 50% scale</span>
                <span className="capitalize">{content.theme} theme</span>
              </div>
            </div>

            {/* Content summary */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 space-y-1.5">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Summary
              </div>
              <div className="text-xs text-gray-400 flex justify-between">
                <span>Sections</span>
                <span className="font-semibold text-white">{content.sections.length}</span>
              </div>
              <div className="text-xs text-gray-400 flex justify-between">
                <span>Background</span>
                <span className="font-semibold text-white capitalize">{content.background.type}</span>
              </div>
              <div className="text-xs text-gray-400 flex justify-between">
                <span>Poll interval</span>
                <span className="font-semibold text-white">{content.pollIntervalSeconds}s</span>
              </div>
              <div className="text-xs text-gray-400 flex justify-between">
                <span>Logo</span>
                <span className="font-semibold text-white">{content.logo?.url ? 'Yes' : 'None'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
