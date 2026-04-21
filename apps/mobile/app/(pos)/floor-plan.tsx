/**
 * Floor Plan screen — drag-and-drop editor + runtime view of restaurant
 * tables. Shows tables coloured by status (open/seated/dirty/reserved),
 * zone tabs along the top, and an edit-mode toggle in the header that
 * lets staff drag tables to new positions and add/remove tables.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  useFloorPlanStore,
  type FloorTable,
  type TableShape,
  type TableStatus,
} from '../../store/floorplan';
import { usePosStore } from '../../store/pos';
import { confirm, toast } from '../../components/ui';

const VIRTUAL = 1000;

const STATUS_PALETTE: Record<
  TableStatus,
  { bg: string; border: string; text: string; label: string }
> = {
  open: { bg: '#0f1d12', border: '#22c55e', text: '#22c55e', label: 'Open' },
  seated: { bg: '#1d130f', border: '#f59e0b', text: '#f59e0b', label: 'Seated' },
  dirty: { bg: '#1d0f12', border: '#ef4444', text: '#ef4444', label: 'Dirty' },
  reserved: { bg: '#0f131d', border: '#6366f1', text: '#6366f1', label: 'Reserved' },
};

export default function FloorPlanScreen() {
  const router = useRouter();
  const {
    zones,
    tables,
    hydrated,
    selectedZoneId,
    hydrate,
    setSelectedZone,
    addTable,
    updateTable,
    removeTable,
    setStatus,
    clearTable,
    addZone,
    removeZone,
    reset,
  } = useFloorPlanStore();
  const setCustomer = usePosStore((s) => s.setCustomer);

  const [editing, setEditing] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [activeTable, setActiveTable] = useState<FloorTable | null>(null);
  const [tableSheet, setTableSheet] = useState<FloorTable | null>(null);
  const [showAddZone, setShowAddZone] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const visibleTables = useMemo(
    () => tables.filter((t) => t.zoneId === selectedZoneId),
    [tables, selectedZoneId],
  );

  function handleCanvasLayout(e: LayoutChangeEvent) {
    setCanvasSize({
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    });
  }

  // Scale virtual coords → screen coords (uniform; preserves aspect).
  const scale = useMemo(() => {
    if (!canvasSize.width || !canvasSize.height) return 0;
    return Math.min(canvasSize.width, canvasSize.height) / VIRTUAL;
  }, [canvasSize]);

  function vToScreenX(x: number) {
    return x * scale;
  }
  function vToScreenY(y: number) {
    return y * scale;
  }
  function screenToVirtual(value: number) {
    return scale > 0 ? value / scale : 0;
  }

  // ── Add table to current zone ──────────────────────────────────────
  async function handleAddTable() {
    if (!selectedZoneId) {
      toast.warning('No Zone', 'Add a zone first.');
      return;
    }
    const t = await addTable(selectedZoneId);
    toast.success('Table Added', `Table ${t.label} created.`);
  }

  async function handleAddZone() {
    if (!newZoneName.trim()) return;
    const z = await addZone(newZoneName.trim());
    setSelectedZone(z.id);
    setShowAddZone(false);
    setNewZoneName('');
    toast.success('Zone Added', z.name);
  }

  async function handleRemoveZone() {
    if (!selectedZoneId) return;
    const zone = zones.find((z) => z.id === selectedZoneId);
    if (!zone) return;
    const ok = await confirm({
      title: `Delete ${zone.name}?`,
      description:
        'All tables in this zone will be removed. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await removeZone(zone.id);
    toast.success('Zone Deleted', zone.name);
  }

  async function handleResetPlan() {
    const ok = await confirm({
      title: 'Reset Floor Plan?',
      description: 'This will restore the default tables and zones. Custom layouts will be lost.',
      confirmLabel: 'Reset',
      destructive: true,
    });
    if (!ok) return;
    await reset();
    toast.success('Floor Plan Reset', 'Default layout restored.');
  }

  // ── Tap a table when not editing → open the table sheet ────────────
  function handleTableTap(t: FloorTable) {
    if (editing) {
      setTableSheet(t);
    } else {
      setTableSheet(t);
    }
  }

  async function handleSeatTable(t: FloorTable) {
    await setStatus(t.id, 'seated');
    setTableSheet(null);
    toast.success('Seated', `Table ${t.label} marked as seated.`);
  }

  async function handleStartOrder(t: FloorTable) {
    await setStatus(t.id, 'seated');
    setCustomer(`table:${t.id}`, `Table ${t.label}`);
    setTableSheet(null);
    router.push('/sell' as never);
  }

  async function handleClearTable(t: FloorTable) {
    const ok = await confirm({
      title: `Clear Table ${t.label}?`,
      description: 'Mark the table as ready to seat new guests.',
      confirmLabel: 'Clear',
    });
    if (!ok) return;
    await clearTable(t.id);
    setTableSheet(null);
    toast.success('Cleared', `Table ${t.label} is now open.`);
  }

  async function handleDeleteTable(t: FloorTable) {
    const ok = await confirm({
      title: `Delete Table ${t.label}?`,
      description: 'This will permanently remove the table from the floor plan.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await removeTable(t.id);
    setTableSheet(null);
    toast.success('Deleted', `Table ${t.label} removed.`);
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Floor Plan',
          headerStyle: { backgroundColor: '#141425' },
          headerTintColor: '#fff',
        }}
      />

      {/* ── Header bar ── */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.title}>Floor Plan</Text>
          <View
            style={[
              styles.modeBadge,
              { backgroundColor: editing ? '#6366f122' : '#22c55e22', borderColor: editing ? '#6366f1' : '#22c55e' },
            ]}
          >
            <Text style={{ color: editing ? '#6366f1' : '#22c55e', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>
              {editing ? 'EDIT' : 'LIVE'}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {editing && (
            <TouchableOpacity style={styles.headerBtn} onPress={handleAddTable}>
              <Ionicons name="add-circle-outline" size={16} color="#22c55e" />
              <Text style={[styles.headerBtnText, { color: '#22c55e' }]}>Add Table</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.headerBtn, editing && { backgroundColor: '#6366f122', borderColor: '#6366f1' }]}
            onPress={() => setEditing(!editing)}
          >
            <Ionicons name={editing ? 'checkmark' : 'create-outline'} size={16} color={editing ? '#6366f1' : '#888'} />
            <Text style={[styles.headerBtnText, editing && { color: '#6366f1' }]}>
              {editing ? 'Done' : 'Edit'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Zone tabs ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.zoneBar} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
        {zones.map((zone) => {
          const active = zone.id === selectedZoneId;
          return (
            <TouchableOpacity
              key={zone.id}
              onPress={() => setSelectedZone(zone.id)}
              style={[
                styles.zoneChip,
                active && { backgroundColor: zone.color, borderColor: zone.color },
              ]}
            >
              {!active && <View style={[styles.zoneDot, { backgroundColor: zone.color }]} />}
              <Text style={[styles.zoneText, active && { color: '#fff' }]}>{zone.name}</Text>
            </TouchableOpacity>
          );
        })}
        {editing && (
          <>
            <TouchableOpacity style={styles.zoneChip} onPress={() => setShowAddZone(true)}>
              <Ionicons name="add" size={14} color="#888" />
              <Text style={styles.zoneText}>Zone</Text>
            </TouchableOpacity>
            {selectedZoneId && (
              <TouchableOpacity
                style={[styles.zoneChip, { borderColor: '#ef444466' }]}
                onPress={handleRemoveZone}
              >
                <Ionicons name="trash" size={12} color="#ef4444" />
                <Text style={[styles.zoneText, { color: '#ef4444' }]}>Delete Zone</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.zoneChip, { borderColor: '#888' }]}
              onPress={handleResetPlan}
            >
              <Ionicons name="refresh" size={12} color="#888" />
              <Text style={styles.zoneText}>Reset</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* ── Canvas ── */}
      {!hydrated ? (
        <View style={styles.center}>
          <Text style={styles.placeholderText}>Loading floor plan…</Text>
        </View>
      ) : !selectedZoneId ? (
        <View style={styles.center}>
          <Ionicons name="grid-outline" size={56} color="#333" />
          <Text style={styles.placeholderText}>No zones yet. Tap Edit → Zone to add one.</Text>
        </View>
      ) : (
        <View style={styles.canvasWrap} onLayout={handleCanvasLayout}>
          {visibleTables.map((t) => (
            <FloorTableNode
              key={t.id}
              table={t}
              editing={editing}
              scale={scale}
              vToScreenX={vToScreenX}
              vToScreenY={vToScreenY}
              screenToVirtual={screenToVirtual}
              onUpdate={updateTable}
              onTap={handleTableTap}
              isActive={activeTable?.id === t.id}
              setActive={setActiveTable}
            />
          ))}
        </View>
      )}

      {/* ── Add Zone Modal ── */}
      <Modal visible={showAddZone} transparent animationType="fade" onRequestClose={() => setShowAddZone(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowAddZone(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Add Zone</Text>
            <Text style={styles.modalLabel}>Zone name</Text>
            <TextInput
              style={styles.input}
              value={newZoneName}
              onChangeText={setNewZoneName}
              placeholder="e.g. Patio"
              placeholderTextColor="#444"
              autoFocus
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleAddZone}>
              <Text style={styles.primaryBtnText}>Add</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Table action sheet ── */}
      <Modal visible={!!tableSheet} transparent animationType="fade" onRequestClose={() => setTableSheet(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setTableSheet(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {tableSheet && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <View style={[styles.tableLabelBadge, { backgroundColor: STATUS_PALETTE[tableSheet.status].border }]}>
                    <Text style={styles.tableLabelBadgeText}>{tableSheet.label}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>Table {tableSheet.label}</Text>
                    <Text style={styles.modalSubtitle}>
                      {tableSheet.seats} seats · {STATUS_PALETTE[tableSheet.status].label}
                    </Text>
                  </View>
                </View>

                {!editing && (
                  <>
                    <TouchableOpacity style={styles.primaryBtn} onPress={() => handleStartOrder(tableSheet)}>
                      <Ionicons name="cart" size={16} color="#fff" />
                      <Text style={styles.primaryBtnText}>Start Order</Text>
                    </TouchableOpacity>

                    {tableSheet.status === 'open' && (
                      <TouchableOpacity style={styles.secondaryBtn} onPress={() => handleSeatTable(tableSheet)}>
                        <Ionicons name="people" size={14} color="#f59e0b" />
                        <Text style={[styles.secondaryBtnText, { color: '#f59e0b' }]}>Mark Seated</Text>
                      </TouchableOpacity>
                    )}

                    {tableSheet.status !== 'open' && (
                      <TouchableOpacity style={styles.secondaryBtn} onPress={() => handleClearTable(tableSheet)}>
                        <Ionicons name="checkmark-done" size={14} color="#22c55e" />
                        <Text style={[styles.secondaryBtnText, { color: '#22c55e' }]}>Clear Table</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}

                {editing && (
                  <>
                    <Text style={[styles.modalLabel, { marginTop: 8 }]}>Shape</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                      {(['square', 'round', 'rect'] as TableShape[]).map((shape) => (
                        <TouchableOpacity
                          key={shape}
                          onPress={() => updateTable(tableSheet.id, { shape })}
                          style={[
                            styles.shapeChip,
                            tableSheet.shape === shape && {
                              backgroundColor: '#6366f122',
                              borderColor: '#6366f1',
                            },
                          ]}
                        >
                          <Text style={{ color: tableSheet.shape === shape ? '#6366f1' : '#888', fontSize: 12, fontWeight: '700' }}>
                            {shape}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={styles.modalLabel}>Label</Text>
                    <TextInput
                      style={styles.input}
                      value={tableSheet.label}
                      onChangeText={(v) => updateTable(tableSheet.id, { label: v })}
                      placeholder="Table label"
                      placeholderTextColor="#444"
                    />
                    <Text style={styles.modalLabel}>Seats</Text>
                    <TextInput
                      style={styles.input}
                      value={String(tableSheet.seats)}
                      onChangeText={(v) => {
                        const n = parseInt(v, 10);
                        if (!isNaN(n)) updateTable(tableSheet.id, { seats: n });
                      }}
                      keyboardType="number-pad"
                    />

                    <TouchableOpacity
                      style={[styles.secondaryBtn, { borderColor: '#ef4444' }]}
                      onPress={() => handleDeleteTable(tableSheet)}
                    >
                      <Ionicons name="trash" size={14} color="#ef4444" />
                      <Text style={[styles.secondaryBtnText, { color: '#ef4444' }]}>Delete Table</Text>
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity onPress={() => setTableSheet(null)} style={{ alignItems: 'center', paddingVertical: 10, marginTop: 4 }}>
                  <Text style={{ color: '#666', fontSize: 13 }}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Draggable table node                                            */
/* ────────────────────────────────────────────────────────────── */

interface FloorTableNodeProps {
  table: FloorTable;
  editing: boolean;
  scale: number;
  vToScreenX: (x: number) => number;
  vToScreenY: (y: number) => number;
  screenToVirtual: (v: number) => number;
  isActive: boolean;
  setActive: (t: FloorTable | null) => void;
  onUpdate: (id: string, patch: Partial<FloorTable>) => void;
  onTap: (t: FloorTable) => void;
}

function FloorTableNode({
  table,
  editing,
  scale,
  vToScreenX,
  vToScreenY,
  screenToVirtual,
  onUpdate,
  onTap,
}: FloorTableNodeProps) {
  const palette = STATUS_PALETTE[table.status];
  const startPos = useRef({ x: table.x, y: table.y });
  const drag = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => editing,
      onMoveShouldSetPanResponder: (_e, g) => editing && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4),
      onPanResponderGrant: () => {
        startPos.current = { x: table.x, y: table.y };
        drag.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: drag.x, dy: drag.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_e, g) => {
        const newVX = startPos.current.x + screenToVirtual(g.dx);
        const newVY = startPos.current.y + screenToVirtual(g.dy);
        const clampedX = Math.max(0, Math.min(VIRTUAL - table.width, newVX));
        const clampedY = Math.max(0, Math.min(VIRTUAL - table.height, newVY));
        drag.setValue({ x: 0, y: 0 });
        onUpdate(table.id, { x: clampedX, y: clampedY });
        if (Math.abs(g.dx) < 4 && Math.abs(g.dy) < 4) {
          onTap(table);
        }
      },
    }),
  ).current;

  // Sync animated value back when table moves externally.
  useEffect(() => {
    drag.setValue({ x: 0, y: 0 });
  }, [table.x, table.y, drag]);

  if (scale === 0) return null;

  const w = table.width * scale;
  const h = table.height * scale;
  const baseX = vToScreenX(table.x);
  const baseY = vToScreenY(table.y);

  const radius =
    table.shape === 'round'
      ? Math.min(w, h) / 2
      : table.shape === 'rect'
      ? 14
      : 12;

  return (
    <Animated.View
      {...(editing ? responder.panHandlers : {})}
      style={{
        position: 'absolute',
        transform: [
          { translateX: Animated.add(new Animated.Value(baseX), drag.x) as any },
          { translateY: Animated.add(new Animated.Value(baseY), drag.y) as any },
        ],
        width: w,
        height: h,
      }}
    >
      <Pressable
        style={[
          {
            flex: 1,
            backgroundColor: palette.bg,
            borderColor: palette.border,
            borderWidth: 2,
            borderRadius: radius,
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
        onPress={editing ? undefined : () => onTap(table)}
      >
        <Text style={{ color: palette.text, fontSize: Math.max(12, w * 0.15), fontWeight: '900' }}>
          {table.label}
        </Text>
        <Text style={{ color: palette.text, fontSize: Math.max(9, w * 0.08), fontWeight: '600', opacity: 0.7 }}>
          {table.seats} seats
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  title: { fontSize: 18, fontWeight: '900', color: '#fff' },
  modeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#141425',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerBtnText: { fontSize: 11, color: '#888', fontWeight: '700' },

  zoneBar: {
    maxHeight: 50,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  zoneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    backgroundColor: '#141425',
  },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },
  zoneText: { color: '#888', fontSize: 12, fontWeight: '700' },

  canvasWrap: {
    flex: 1,
    margin: 16,
    backgroundColor: '#0a0a14',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e1e2e',
    overflow: 'hidden',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  placeholderText: { color: '#555', fontSize: 13 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1a1a2e',
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  modalSubtitle: { color: '#888', fontSize: 12, marginTop: 2 },
  modalLabel: {
    color: '#888',
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    backgroundColor: '#0d0d14',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    marginBottom: 10,
  },
  primaryBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    marginTop: 8,
  },
  secondaryBtnText: { fontWeight: '700', fontSize: 13 },

  shapeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    backgroundColor: '#0d0d14',
  },

  tableLabelBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableLabelBadgeText: { color: '#fff', fontSize: 14, fontWeight: '900' },
});
