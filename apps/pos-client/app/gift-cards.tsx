import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Share,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { posApiFetch } from '../lib/api';
import { useAuthStore } from '../store/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Preset Amounts ───────────────────────────────────────────────────────────

const PRESETS = [25, 50, 100, 200];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
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

function statusColor(status: GiftCardDetails['status']): { bg: string; text: string } {
  switch (status) {
    case 'active':   return { bg: '#14532d', text: '#4ade80' };
    case 'depleted': return { bg: '#451a03', text: '#fbbf24' };
    case 'voided':   return { bg: '#3b1f1f', text: '#f87171' };
    case 'expired':  return { bg: '#1f2937', text: '#9ca3af' };
    default:         return { bg: '#1f2937', text: '#9ca3af' };
  }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function GiftCardsScreen() {
  const router = useRouter();
  const employee = useAuthStore((s) => s.employee);
  const isManager = employee?.role === 'manager' || employee?.role === 'admin';

  // Check balance section
  const [checkCode, setCheckCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [cardDetails, setCardDetails] = useState<GiftCardDetails | null>(null);
  const [checkError, setCheckError] = useState('');

  // Issue card section
  const [issuePreset, setIssuePreset] = useState<number | null>(50);
  const [issueCustom, setIssueCustom] = useState('');
  const [issueCustomerName, setIssueCustomerName] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [issuedCard, setIssuedCard] = useState<IssuedCard | null>(null);

  // Void section
  const [voidCode, setVoidCode] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [voidConfirmVisible, setVoidConfirmVisible] = useState(false);

  // Recent cards
  const [recentCards, setRecentCards] = useState<IssuedCard[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  const issueAmount = issuePreset ?? (Number(issueCustom) || 0);

  const loadRecentCards = useCallback(async () => {
    setLoadingRecent(true);
    try {
      const res = await posApiFetch<{ data: IssuedCard[] }>(
        '/api/v1/gift-cards?limit=5&sort=issuedAt:desc',
      );
      setRecentCards(res.data ?? []);
    } catch {
      // non-fatal — just show empty list
      setRecentCards([]);
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    loadRecentCards();
  }, [loadRecentCards]);

  // ── Check Balance ──────────────────────────────────────────────────────────

  const handleCheckBalance = async () => {
    const code = checkCode.trim().toUpperCase();
    if (!code) return;
    setChecking(true);
    setCardDetails(null);
    setCheckError('');
    try {
      const res = await posApiFetch<GiftCardDetails>(
        `/api/v1/gift-cards/${encodeURIComponent(code)}`,
      );
      setCardDetails(res);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : 'Card not found.');
    } finally {
      setChecking(false);
    }
  };

  // ── Issue Card ─────────────────────────────────────────────────────────────

  const handleIssueCard = async () => {
    if (issueAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please select or enter a valid amount.');
      return;
    }
    setIssuing(true);
    setIssuedCard(null);
    try {
      const res = await posApiFetch<{ code: string; balance: number; issuedAt: string }>(
        '/api/v1/gift-cards',
        {
          method: 'POST',
          body: JSON.stringify({
            balance: Math.round(issueAmount * 100),
            customerName: issueCustomerName.trim() || undefined,
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
    } catch (err) {
      Alert.alert('Issue Failed', err instanceof Error ? err.message : 'Could not issue card.');
    } finally {
      setIssuing(false);
    }
  };

  const handleShareCode = async (code: string) => {
    try {
      await Share.share({
        message: `Your gift card code: ${code}`,
        title: 'Gift Card Code',
      });
    } catch {
      // Share dialog dismissed or cancelled by user — no action needed
    }
  };

  // ── Void Card ─────────────────────────────────────────────────────────────

  const handleVoidCard = async () => {
    const code = voidCode.trim().toUpperCase();
    if (!code) return;
    setVoiding(true);
    setVoidConfirmVisible(false);
    try {
      await posApiFetch(`/api/v1/gift-cards/${encodeURIComponent(code)}/void`, {
        method: 'POST',
      });
      Alert.alert('Card Voided', `Gift card ${code} has been voided successfully.`);
      setVoidCode('');
      loadRecentCards();
    } catch (err) {
      Alert.alert('Void Failed', err instanceof Error ? err.message : 'Could not void card.');
    } finally {
      setVoiding(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#60a5fa" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Gift Cards</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">

        {/* ── Check Balance ─────────────────────────────────────────────────── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={[s.iconBox, { backgroundColor: '#1e3a5f' }]}>
              <Ionicons name="search-outline" size={18} color="#60a5fa" />
            </View>
            <Text style={s.cardTitle}>Check Balance</Text>
          </View>

          <View style={s.inputRow}>
            <TextInput
              style={[s.input, s.inputFlex]}
              placeholder="Enter gift card code"
              placeholderTextColor="#4b5563"
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
              style={[s.actionBtn, checking && s.actionBtnDisabled]}
              onPress={handleCheckBalance}
              disabled={checking || !checkCode.trim()}
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
              <Ionicons name="alert-circle-outline" size={16} color="#f87171" />
              <Text style={s.errorText}>{checkError}</Text>
            </View>
          ) : null}

          {cardDetails && (
            <View style={s.detailBox}>
              {/* Balance highlight */}
              <View style={s.balanceRow}>
                <Text style={s.balanceLabel}>Current Balance</Text>
                <Text style={s.balanceValue}>{fmt(cardDetails.balance)}</Text>
              </View>

              {/* Status + expiry */}
              <View style={s.metaRow}>
                <View style={[s.statusBadge, { backgroundColor: statusColor(cardDetails.status).bg }]}>
                  <Text style={[s.statusText, { color: statusColor(cardDetails.status).text }]}>
                    {cardDetails.status.charAt(0).toUpperCase() + cardDetails.status.slice(1)}
                  </Text>
                </View>
                {cardDetails.expiresAt ? (
                  <Text style={s.metaText}>Expires {fmtDate(cardDetails.expiresAt)}</Text>
                ) : null}
                <Text style={s.metaText}>Issued {fmtDate(cardDetails.issuedAt)}</Text>
              </View>

              {/* Recent transactions */}
              {cardDetails.recentTransactions?.length > 0 && (
                <>
                  <Text style={s.txTitle}>Recent Transactions</Text>
                  {cardDetails.recentTransactions.slice(0, 3).map((tx) => (
                    <View key={tx.id} style={s.txRow}>
                      <View style={s.txLeft}>
                        <Text style={s.txType}>
                          {tx.type === 'redeem' ? 'Redeemed' : tx.type === 'load' ? 'Loaded' : 'Issued'}
                        </Text>
                        <Text style={s.txDate}>{fmtDate(tx.date)}</Text>
                      </View>
                      <Text
                        style={[
                          s.txAmount,
                          { color: tx.type === 'redeem' ? '#f87171' : '#4ade80' },
                        ]}
                      >
                        {tx.type === 'redeem' ? '-' : '+'}{fmt(tx.amount)}
                      </Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}
        </View>

        {/* ── Issue New Card ───────────────────────────────────────────────── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={[s.iconBox, { backgroundColor: '#14532d' }]}>
              <Ionicons name="gift-outline" size={18} color="#4ade80" />
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
            placeholderTextColor="#4b5563"
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
            placeholderTextColor="#4b5563"
            value={issueCustomerName}
            onChangeText={setIssueCustomerName}
            autoCapitalize="words"
          />

          <TouchableOpacity
            style={[s.primaryBtn, (issuing || issueAmount <= 0) && s.primaryBtnDisabled]}
            onPress={handleIssueCard}
            disabled={issuing || issueAmount <= 0}
          >
            {issuing ? (
              <ActivityIndicator color="#052e16" />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={18} color="#052e16" />
                <Text style={s.primaryBtnText}>
                  Issue Card {issueAmount > 0 ? `· $${issueAmount.toFixed(2)}` : ''}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Issued card result */}
          {issuedCard && (
            <View style={s.issuedBox}>
              <View style={s.issuedHeader}>
                <Ionicons name="checkmark-circle" size={22} color="#4ade80" />
                <Text style={s.issuedTitle}>Card Issued!</Text>
              </View>
              <Text style={s.issuedCode}>{issuedCard.code}</Text>
              <Text style={s.issuedMeta}>
                Balance: {fmt(issuedCard.balance)}
                {issuedCard.customerName ? `  ·  ${issuedCard.customerName}` : ''}
              </Text>
              <View style={s.issuedActions}>
                <TouchableOpacity
                  style={s.issuedActionBtn}
                  onPress={() => handleShareCode(issuedCard.code)}
                >
                  <Ionicons name="share-outline" size={16} color="#60a5fa" />
                  <Text style={s.issuedActionText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.issuedActionBtn}
                  onPress={() =>
                    Alert.alert('Print', 'Sending to receipt printer…')
                  }
                >
                  <Ionicons name="print-outline" size={16} color="#60a5fa" />
                  <Text style={s.issuedActionText}>Print</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* ── Void Card (manager only) ─────────────────────────────────────── */}
        {isManager && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={[s.iconBox, { backgroundColor: '#3b1f1f' }]}>
                <Ionicons name="ban-outline" size={18} color="#f87171" />
              </View>
              <Text style={s.cardTitle}>Void Card</Text>
              <View style={s.managerBadge}>
                <Text style={s.managerBadgeText}>Manager</Text>
              </View>
            </View>

            <View style={s.inputRow}>
              <TextInput
                style={[s.input, s.inputFlex]}
                placeholder="Enter card code to void"
                placeholderTextColor="#4b5563"
                value={voidCode}
                onChangeText={setVoidCode}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={[s.dangerBtn, (voiding || !voidCode.trim()) && s.dangerBtnDisabled]}
                onPress={() => setVoidConfirmVisible(true)}
                disabled={voiding || !voidCode.trim()}
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

        {/* ── Recent Cards ─────────────────────────────────────────────────── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={[s.iconBox, { backgroundColor: '#1f2937' }]}>
              <Ionicons name="time-outline" size={18} color="#94a3b8" />
            </View>
            <Text style={s.cardTitle}>Recent Cards (Today)</Text>
          </View>

          {loadingRecent ? (
            <ActivityIndicator color="#60a5fa" style={{ marginVertical: 16 }} />
          ) : recentCards.length === 0 ? (
            <Text style={s.emptyText}>No cards issued today.</Text>
          ) : (
            recentCards.map((card, i) => (
              <View key={card.code} style={[s.recentRow, i < recentCards.length - 1 && s.recentRowDivider]}>
                <View style={s.recentLeft}>
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

      {/* Void Confirm Modal */}
      <Modal
        visible={voidConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setVoidConfirmVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Ionicons name="warning-outline" size={40} color="#f87171" style={{ marginBottom: 12 }} />
            <Text style={s.modalTitle}>Void Gift Card?</Text>
            <Text style={s.modalBody}>
              This will permanently void card{'\n'}
              <Text style={s.modalCode}>{voidCode.trim().toUpperCase()}</Text>
              {'\n'}and cannot be undone.
            </Text>
            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.modalCancelBtn}
                onPress={() => setVoidConfirmVisible(false)}
              >
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalConfirmBtn} onPress={handleVoidCard}>
                <Text style={s.modalConfirmText}>Void Card</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a2e' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  backBtn: { width: 36 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#f1f5f9' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },

  card: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#0f3460',
    gap: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#f1f5f9', flex: 1 },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  inputFlex: { flex: 1, marginBottom: 0 },
  input: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#0f3460',
    marginBottom: 0,
  },

  actionBtn: {
    backgroundColor: '#0f3460',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1e40af',
  },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { color: '#93c5fd', fontWeight: '700', fontSize: 14 },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#3b1f1f',
    borderRadius: 8,
    padding: 10,
  },
  errorText: { color: '#f87171', fontSize: 13, flex: 1 },

  detailBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  balanceRow: { alignItems: 'center', gap: 4 },
  balanceLabel: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 },
  balanceValue: { fontSize: 36, fontWeight: '800', color: '#f1f5f9' },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },
  metaText: { fontSize: 12, color: '#64748b' },
  txTitle: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  txLeft: { gap: 2 },
  txType: { fontSize: 13, color: '#e2e8f0', fontWeight: '500' },
  txDate: { fontSize: 11, color: '#64748b' },
  txAmount: { fontSize: 14, fontWeight: '700' },

  fieldLabel: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 },
  presetRow: { flexDirection: 'row', gap: 8 },
  presetBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0f3460',
  },
  presetBtnActive: { borderColor: '#4ade80', backgroundColor: '#14532d33' },
  presetBtnText: { color: '#64748b', fontSize: 15, fontWeight: '700' },
  presetBtnTextActive: { color: '#4ade80' },

  primaryBtn: {
    backgroundColor: '#4ade80',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  primaryBtnDisabled: { backgroundColor: '#166534', opacity: 0.5 },
  primaryBtnText: { color: '#052e16', fontSize: 15, fontWeight: '800' },

  issuedBox: {
    backgroundColor: '#052e1633',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#166534',
  },
  issuedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  issuedTitle: { color: '#4ade80', fontSize: 15, fontWeight: '700' },
  issuedCode: {
    fontSize: 26,
    fontWeight: '800',
    color: '#f1f5f9',
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
  },
  issuedMeta: { fontSize: 13, color: '#94a3b8' },
  issuedActions: { flexDirection: 'row', gap: 16, marginTop: 4 },
  issuedActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  issuedActionText: { color: '#60a5fa', fontSize: 14, fontWeight: '600' },

  managerBadge: {
    backgroundColor: '#3b1f1f',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  managerBadgeText: { color: '#f87171', fontSize: 11, fontWeight: '600' },

  dangerBtn: {
    backgroundColor: '#7f1d1d',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#991b1b',
  },
  dangerBtnDisabled: { opacity: 0.4 },
  dangerBtnText: { color: '#fca5a5', fontWeight: '700', fontSize: 14 },

  emptyText: { color: '#4b5563', fontSize: 13, textAlign: 'center', paddingVertical: 8 },

  recentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  recentRowDivider: { borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  recentLeft: { flex: 1, gap: 2 },
  recentCode: { fontSize: 14, fontWeight: '700', color: '#f1f5f9', letterSpacing: 1 },
  recentCustomer: { fontSize: 12, color: '#94a3b8' },
  recentDate: { fontSize: 11, color: '#4b5563' },
  recentBalance: { fontSize: 15, fontWeight: '700', color: '#4ade80' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#16213e',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#f1f5f9', marginBottom: 10 },
  modalBody: { fontSize: 14, color: '#94a3b8', textAlign: 'center', lineHeight: 22 },
  modalCode: { color: '#f1f5f9', fontWeight: '800', letterSpacing: 2 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20, width: '100%' },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#1f2937',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  modalCancelText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: '#7f1d1d',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#991b1b',
  },
  modalConfirmText: { color: '#fca5a5', fontSize: 14, fontWeight: '700' },
});
