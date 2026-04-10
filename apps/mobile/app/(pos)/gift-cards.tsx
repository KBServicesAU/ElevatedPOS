import React, { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDeviceStore } from '../../store/device';
import { useAuthStore } from '../../store/auth';
import { toast } from '../../components/ui';

const API_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4001';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface GiftCardTransaction {
  id: string;
  type: 'redeem' | 'load' | 'issue';
  amount: number;
  date: string;
  note?: string;
}

interface GiftCardDetails {
  code: string;
  balance: number;
  status: 'active' | 'depleted' | 'voided' | 'expired';
  expiresAt?: string;
  issuedAt: string;
  recentTransactions: GiftCardTransaction[];
}

interface IssuedCard {
  code: string;
  balance: number;
  issuedAt: string;
  customerName?: string;
}

const PRESETS = [25, 50, 100, 200];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function fmt(cents: number) {
  return `$${((Number(cents) || 0) / 100).toFixed(2)}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function statusColor(status: GiftCardDetails['status']) {
  switch (status) {
    case 'active':
      return { bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.4)', text: '#22c55e' };
    case 'depleted':
      return { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', text: '#f59e0b' };
    case 'voided':
      return { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', text: '#ef4444' };
    case 'expired':
      return { bg: 'rgba(148, 163, 184, 0.15)', border: 'rgba(148, 163, 184, 0.4)', text: '#94a3b8' };
    default:
      return { bg: '#1e1e2e', border: '#2a2a3a', text: '#888' };
  }
}

async function apiFetch<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function GiftCardsScreen() {
  const router = useRouter();
  const identity = useDeviceStore((s) => s.identity);
  const employeeToken = useAuthStore((s) => s.employeeToken);
  const employee = useAuthStore((s) => s.employee);
  const isManager =
    employee?.roleId === 'manager' ||
    employee?.roleId === 'admin';

  const token = employeeToken ?? identity?.deviceToken ?? '';

  // Check balance
  const [checkCode, setCheckCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [cardDetails, setCardDetails] = useState<GiftCardDetails | null>(null);
  const [checkError, setCheckError] = useState('');

  // Issue
  const [issuePreset, setIssuePreset] = useState<number | null>(50);
  const [issueCustom, setIssueCustom] = useState('');
  const [issueCustomerName, setIssueCustomerName] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [issuedCard, setIssuedCard] = useState<IssuedCard | null>(null);

  // Void
  const [voidCode, setVoidCode] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [voidConfirm, setVoidConfirm] = useState(false);

  // Recent
  const [recentCards, setRecentCards] = useState<IssuedCard[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  const issueAmount = issuePreset ?? (Number(issueCustom) || 0);

  const loadRecentCards = useCallback(async () => {
    setLoadingRecent(true);
    try {
      const res = await apiFetch<{ data: IssuedCard[] }>(
        '/api/v1/gift-cards?limit=5&sort=issuedAt:desc',
        token,
      );
      setRecentCards(res.data ?? []);
    } catch {
      setRecentCards([]);
    } finally {
      setLoadingRecent(false);
    }
  }, [token]);

  useEffect(() => {
    loadRecentCards();
  }, [loadRecentCards]);

  async function handleCheckBalance() {
    const code = checkCode.trim().toUpperCase();
    if (!code) return;
    setChecking(true);
    setCardDetails(null);
    setCheckError('');
    try {
      const res = await apiFetch<GiftCardDetails>(
        `/api/v1/gift-cards/${encodeURIComponent(code)}`,
        token,
      );
      setCardDetails(res);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : 'Card not found.');
    } finally {
      setChecking(false);
    }
  }

  async function handleIssueCard() {
    if (issueAmount <= 0) {
      toast.warning('Invalid Amount', 'Please select or enter a valid amount.');
      return;
    }
    setIssuing(true);
    setIssuedCard(null);
    try {
      const res = await apiFetch<{ code: string; balance: number; issuedAt: string }>(
        '/api/v1/gift-cards',
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            balance: Math.round(issueAmount * 100),
            customerName: issueCustomerName.trim() || undefined,
            locationId: identity?.locationId ?? '',
          }),
        },
      );
      const card: IssuedCard = {
        code: res.code,
        balance: res.balance,
        issuedAt: res.issuedAt,
        customerName: issueCustomerName.trim() || undefined,
      };
      setIssuedCard(card);
      setIssueCustom('');
      setIssuePreset(50);
      setIssueCustomerName('');
      setRecentCards((prev) => [card, ...prev].slice(0, 5));
      toast.success('Gift Card Issued', `${card.code} · $${(card.balance / 100).toFixed(2)}`);
    } catch (err) {
      toast.error('Issue Failed', err instanceof Error ? err.message : 'Could not issue card.');
    } finally {
      setIssuing(false);
    }
  }

  async function handleShareCode(code: string) {
    try {
      await Share.share({
        message: `Your gift card code: ${code}`,
        title: 'Gift Card Code',
      });
    } catch {
      // dismissed
    }
  }

  async function handleVoidCard() {
    const code = voidCode.trim().toUpperCase();
    if (!code) return;
    setVoiding(true);
    setVoidConfirm(false);
    try {
      await apiFetch(`/api/v1/gift-cards/${encodeURIComponent(code)}/void`, token, {
        method: 'POST',
      });
      toast.success('Card Voided', `Gift card ${code} has been voided.`);
      setVoidCode('');
      loadRecentCards();
    } catch (err) {
      toast.error('Void Failed', err instanceof Error ? err.message : 'Could not void card.');
    } finally {
      setVoiding(false);
    }
  }

  return (
    <SafeAreaView style={s.root} edges={['bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="arrow-back" size={20} color="#888" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Gift Cards</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Check Balance ──────────────────────────────── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={[s.iconBox, { backgroundColor: 'rgba(99, 102, 241, 0.2)' }]}>
              <Ionicons name="search-outline" size={18} color="#6366f1" />
            </View>
            <Text style={s.cardTitle}>Check Balance</Text>
          </View>

          <View style={s.inputRow}>
            <TextInput
              style={[s.input, s.inputFlex]}
              placeholder="Enter gift card code"
              placeholderTextColor="#444"
              value={checkCode}
              onChangeText={(t) => {
                setCheckCode(t);
                setCardDetails(null);
                setCheckError('');
              }}
              autoCapitalize="characters"
              returnKeyType="search"
              onSubmitEditing={handleCheckBalance}
            />
            <TouchableOpacity
              style={[s.actionBtn, (checking || !checkCode.trim()) && s.actionBtnDisabled]}
              onPress={handleCheckBalance}
              disabled={checking || !checkCode.trim()}
              activeOpacity={0.85}
            >
              {checking ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.actionBtnText}>Check</Text>
              )}
            </TouchableOpacity>
          </View>

          {checkError ? (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle" size={16} color="#ef4444" />
              <Text style={s.errorText}>{checkError}</Text>
            </View>
          ) : null}

          {cardDetails && (
            <View style={s.detailBox}>
              <View style={s.balanceRow}>
                <Text style={s.balanceLabel}>Current Balance</Text>
                <Text style={s.balanceValue}>{fmt(cardDetails.balance)}</Text>
              </View>
              <View style={s.metaRow}>
                <View
                  style={[
                    s.statusBadge,
                    {
                      backgroundColor: statusColor(cardDetails.status).bg,
                      borderColor: statusColor(cardDetails.status).border,
                    },
                  ]}
                >
                  <Text style={[s.statusText, { color: statusColor(cardDetails.status).text }]}>
                    {cardDetails.status.toUpperCase()}
                  </Text>
                </View>
                {cardDetails.expiresAt ? (
                  <Text style={s.metaText}>Expires {fmtDate(cardDetails.expiresAt)}</Text>
                ) : null}
                <Text style={s.metaText}>Issued {fmtDate(cardDetails.issuedAt)}</Text>
              </View>

              {cardDetails.recentTransactions?.length > 0 && (
                <>
                  <Text style={s.txTitle}>Recent Transactions</Text>
                  {cardDetails.recentTransactions.slice(0, 3).map((tx) => (
                    <View key={tx.id} style={s.txRow}>
                      <View style={{ gap: 2 }}>
                        <Text style={s.txType}>
                          {tx.type === 'redeem'
                            ? 'Redeemed'
                            : tx.type === 'load'
                              ? 'Loaded'
                              : 'Issued'}
                        </Text>
                        <Text style={s.txDate}>{fmtDate(tx.date)}</Text>
                      </View>
                      <Text
                        style={[
                          s.txAmount,
                          { color: tx.type === 'redeem' ? '#ef4444' : '#22c55e' },
                        ]}
                      >
                        {tx.type === 'redeem' ? '-' : '+'}
                        {fmt(tx.amount)}
                      </Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}
        </View>

        {/* ── Issue New Card ─────────────────────────────── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={[s.iconBox, { backgroundColor: 'rgba(34, 197, 94, 0.2)' }]}>
              <Ionicons name="gift-outline" size={18} color="#22c55e" />
            </View>
            <Text style={s.cardTitle}>Issue New Card</Text>
          </View>

          <Text style={s.fieldLabel}>Amount</Text>
          <View style={s.presetRow}>
            {PRESETS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[s.presetBtn, issuePreset === p && s.presetBtnActive]}
                onPress={() => {
                  setIssuePreset(p);
                  setIssueCustom('');
                }}
                activeOpacity={0.85}
              >
                <Text style={[s.presetBtnText, issuePreset === p && s.presetBtnTextActive]}>
                  ${p}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={s.input}
            placeholder="Custom amount (e.g. 75.00)"
            placeholderTextColor="#444"
            keyboardType="decimal-pad"
            value={issueCustom}
            onChangeText={(t) => {
              setIssueCustom(t);
              setIssuePreset(null);
            }}
          />

          <Text style={s.fieldLabel}>Customer Name (optional)</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. Jane Smith"
            placeholderTextColor="#444"
            value={issueCustomerName}
            onChangeText={setIssueCustomerName}
            autoCapitalize="words"
          />

          <TouchableOpacity
            style={[s.primaryBtn, (issuing || issueAmount <= 0) && { opacity: 0.5 }]}
            onPress={handleIssueCard}
            disabled={issuing || issueAmount <= 0}
            activeOpacity={0.85}
          >
            {issuing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="add-circle" size={18} color="#fff" />
                <Text style={s.primaryBtnText}>
                  Issue Card{issueAmount > 0 ? ` · $${issueAmount.toFixed(2)}` : ''}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {issuedCard && (
            <View style={s.issuedBox}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
                <Text style={s.issuedTitle}>Card Issued!</Text>
              </View>
              <Text style={s.issuedCode}>{issuedCard.code}</Text>
              <Text style={s.issuedMeta}>
                Balance: {fmt(issuedCard.balance)}
                {issuedCard.customerName ? `  ·  ${issuedCard.customerName}` : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                <TouchableOpacity
                  style={s.issuedActionBtn}
                  onPress={() => handleShareCode(issuedCard.code)}
                >
                  <Ionicons name="share-outline" size={16} color="#6366f1" />
                  <Text style={s.issuedActionText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.issuedActionBtn}
                  onPress={() => toast.info('Print', 'Sending to receipt printer…')}
                >
                  <Ionicons name="print-outline" size={16} color="#6366f1" />
                  <Text style={s.issuedActionText}>Print</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* ── Void Card (manager only) ───────────────────── */}
        {isManager && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={[s.iconBox, { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
                <Ionicons name="ban-outline" size={18} color="#ef4444" />
              </View>
              <Text style={s.cardTitle}>Void Card</Text>
              <View style={s.managerBadge}>
                <Text style={s.managerBadgeText}>MANAGER</Text>
              </View>
            </View>

            <View style={s.inputRow}>
              <TextInput
                style={[s.input, s.inputFlex]}
                placeholder="Enter card code to void"
                placeholderTextColor="#444"
                value={voidCode}
                onChangeText={setVoidCode}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={[s.dangerBtn, (voiding || !voidCode.trim()) && { opacity: 0.4 }]}
                onPress={() => setVoidConfirm(true)}
                disabled={voiding || !voidCode.trim()}
                activeOpacity={0.85}
              >
                {voiding ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.dangerBtnText}>Void</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Recent Cards ───────────────────────────────── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={[s.iconBox, { backgroundColor: 'rgba(148, 163, 184, 0.15)' }]}>
              <Ionicons name="time-outline" size={18} color="#94a3b8" />
            </View>
            <Text style={s.cardTitle}>Recent Cards</Text>
            <TouchableOpacity onPress={loadRecentCards}>
              <Ionicons name="refresh" size={18} color="#888" />
            </TouchableOpacity>
          </View>

          {loadingRecent ? (
            <ActivityIndicator color="#6366f1" style={{ marginVertical: 16 }} />
          ) : recentCards.length === 0 ? (
            <Text style={s.emptyText}>No cards issued yet.</Text>
          ) : (
            recentCards.map((card, i) => (
              <View
                key={card.code}
                style={[s.recentRow, i < recentCards.length - 1 && s.recentRowDivider]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.recentCode}>{card.code}</Text>
                  {card.customerName ? (
                    <Text style={s.recentCustomer}>{card.customerName}</Text>
                  ) : null}
                  <Text style={s.recentDate}>{fmtDate(card.issuedAt)}</Text>
                </View>
                <Text style={s.recentBalance}>{fmt(card.balance)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Void Confirm Modal ───────────────────────────── */}
      <Modal
        visible={voidConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setVoidConfirm(false)}
      >
        <Pressable style={s.modalOverlay} onPress={() => setVoidConfirm(false)}>
          <Pressable style={s.modalBox} onPress={() => {}}>
            <Ionicons
              name="warning"
              size={40}
              color="#ef4444"
              style={{ marginBottom: 12 }}
            />
            <Text style={s.modalTitle}>Void Gift Card?</Text>
            <Text style={s.modalBody}>
              This will permanently void card{'\n'}
              <Text style={s.modalCode}>{voidCode.trim().toUpperCase()}</Text>
              {'\n'}
              and cannot be undone.
            </Text>
            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.modalCancelBtn}
                onPress={() => setVoidConfirm(false)}
              >
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalConfirmBtn} onPress={handleVoidCard}>
                <Text style={s.modalConfirmText}>Void Card</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d14' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#fff' },

  scroll: { flex: 1 },
  scrollContent: { padding: 14, gap: 14 },

  card: {
    backgroundColor: '#141425',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    gap: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#fff', flex: 1 },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  inputFlex: { flex: 1 },
  input: {
    backgroundColor: '#0d0d14',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },

  actionBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    padding: 10,
  },
  errorText: { color: '#ef4444', fontSize: 13, flex: 1 },

  detailBox: {
    backgroundColor: '#0d0d14',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  balanceRow: { alignItems: 'center', gap: 4 },
  balanceLabel: {
    fontSize: 11,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
  },
  balanceValue: { fontSize: 36, fontWeight: '900', color: '#fff' },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
  },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  metaText: { fontSize: 12, color: '#666' },
  txTitle: {
    fontSize: 11,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 4,
    fontWeight: '700',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  txType: { fontSize: 13, color: '#e5e7eb', fontWeight: '600' },
  txDate: { fontSize: 11, color: '#666' },
  txAmount: { fontSize: 14, fontWeight: '800' },

  fieldLabel: {
    fontSize: 11,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  presetRow: { flexDirection: 'row', gap: 8 },
  presetBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#0d0d14',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2a2a3a',
  },
  presetBtnActive: {
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  presetBtnText: { color: '#888', fontSize: 15, fontWeight: '800' },
  presetBtnTextActive: { color: '#22c55e' },

  primaryBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    shadowColor: '#22c55e',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  issuedBox: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  issuedTitle: { color: '#22c55e', fontSize: 15, fontWeight: '800' },
  issuedCode: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
  },
  issuedMeta: { fontSize: 13, color: '#888' },
  issuedActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  issuedActionText: { color: '#6366f1', fontSize: 14, fontWeight: '700' },

  managerBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  managerBadgeText: { color: '#ef4444', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  dangerBtn: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  dangerBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  emptyText: { color: '#555', fontSize: 13, textAlign: 'center', paddingVertical: 12 },

  recentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  recentRowDivider: { borderBottomWidth: 1, borderBottomColor: '#1e1e2e' },
  recentCode: { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  recentCustomer: { fontSize: 12, color: '#888' },
  recentDate: { fontSize: 11, color: '#555' },
  recentBalance: { fontSize: 15, fontWeight: '800', color: '#22c55e' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#fff', marginBottom: 10 },
  modalBody: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 22 },
  modalCode: { color: '#fff', fontWeight: '900', letterSpacing: 2 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20, width: '100%' },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#141425',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  modalCancelText: { color: '#888', fontSize: 14, fontWeight: '700' },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalConfirmText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
