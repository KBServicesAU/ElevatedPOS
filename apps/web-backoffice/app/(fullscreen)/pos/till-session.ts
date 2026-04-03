const STORAGE_KEY = 'nexus_till_session';

export interface TillAdjustment {
  id: string;
  type: 'deposit' | 'withdrawal' | 'no_sale';
  amount: number;
  reason?: string;
  staffId: string;
  staffName: string;
  at: string; // ISO timestamp
}

export interface TillSession {
  sessionId: string;
  openedAt: string;
  openingFloat: number;
  adjustments: TillAdjustment[];
  staffId: string;
  staffName: string;
  locationId: string;
}

export function getTillSession(): TillSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TillSession;
  } catch {
    return null;
  }
}

export function saveTillSession(session: TillSession): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearTillSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function createTillSession(
  openingFloat: number,
  staffId: string,
  staffName: string,
  locationId: string,
): TillSession {
  const session: TillSession = {
    sessionId: crypto.randomUUID(),
    openedAt: new Date().toISOString(),
    openingFloat,
    adjustments: [],
    staffId,
    staffName,
    locationId,
  };
  saveTillSession(session);
  return session;
}

export function addTillAdjustment(
  adj: Omit<TillAdjustment, 'id' | 'at'>,
): TillSession | null {
  const session = getTillSession();
  if (!session) return null;

  const adjustment: TillAdjustment = {
    ...adj,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
  };

  const updated: TillSession = {
    ...session,
    adjustments: [...session.adjustments, adjustment],
  };

  saveTillSession(updated);
  return updated;
}
