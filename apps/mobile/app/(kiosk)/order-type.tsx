import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKioskStore, t } from '../../store/kiosk';
import { useDeviceSettings } from '../../store/device-settings';

const NUMPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['⌫', '0', '✓'],
];

export default function OrderTypeScreen() {
  const router = useRouter();
  const { orderType, setOrderType, tableNumber, setTableNumber, language } = useKioskStore();

  // v2.7.44 — defence in depth: non-hospitality kiosks should never reach
  // this screen (Attract redirects them straight to the menu), but if a
  // user lands here via deep link or back-stack restore we silently
  // tag the order as 'retail' and continue to the menu.
  const deviceIndustry = useDeviceSettings((s) => s.config?.identity?.industry);
  const isHospitality = deviceIndustry === 'hospitality';
  useEffect(() => {
    if (!isHospitality) {
      setOrderType('retail');
      router.replace('/(kiosk)/menu');
    }
  }, [isHospitality, router, setOrderType]);

  const [localOrderType, setLocalOrderType] = useState<'dine_in' | 'takeaway'>(
    orderType === 'takeaway' ? 'takeaway' : 'dine_in',
  );
  const [tableInput, setTableInput] = useState<string>(tableNumber ?? '');
  const [showNumpad, setShowNumpad] = useState(orderType === 'dine_in');

  const numpadAnim = useRef(new Animated.Value(orderType === 'dine_in' ? 1 : 0)).current;

  function selectDineIn() {
    setLocalOrderType('dine_in');
    setShowNumpad(true);
    Animated.timing(numpadAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }

  function selectTakeaway() {
    setLocalOrderType('takeaway');
    setTableInput('');
    Animated.timing(numpadAnim, { toValue: 0, duration: 240, useNativeDriver: true }).start(() => {
      setShowNumpad(false);
    });
  }

  function handleNumpadPress(key: string) {
    if (key === '⌫') {
      setTableInput((prev) => prev.slice(0, -1));
      return;
    }
    if (key === '✓') {
      handleConfirm();
      return;
    }
    const next = tableInput + key;
    const num = parseInt(next, 10);
    if (next.length <= 2 && num >= 1 && num <= 99) {
      setTableInput(next);
    } else if (tableInput.length === 0 && key === '0') {
      return;
    }
  }

  function handleConfirm() {
    setOrderType(localOrderType);
    if (localOrderType === 'dine_in' && tableInput) {
      setTableNumber(tableInput);
    } else {
      setTableNumber('');
    }
    router.push('/(kiosk)/menu');
  }

  const tableNum = parseInt(tableInput, 10);
  const tableValid = tableInput.length > 0 && tableNum >= 1 && tableNum <= 99;
  const canContinue =
    localOrderType === 'takeaway' || (localOrderType === 'dine_in' && tableValid);

  const numpadOpacity = numpadAnim;
  const numpadTranslate = numpadAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [40, 0],
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <View style={styles.headerArea}>
          <Text style={styles.title}>{t(language, 'howDining')}</Text>
          <Text style={styles.subtitle}>{t(language, 'selectOrderType')}</Text>
        </View>

        <View style={styles.typeRow}>
          <TouchableOpacity
            style={[
              styles.typeCard,
              localOrderType === 'dine_in' && styles.typeCardActive,
            ]}
            onPress={selectDineIn}
            activeOpacity={0.85}
          >
            <View style={[styles.typeIconCircle, localOrderType === 'dine_in' && styles.typeIconCircleActive]}>
              <Text style={styles.typeIcon}>🍽️</Text>
            </View>
            <Text style={[styles.typeLabel, localOrderType === 'dine_in' && styles.typeLabelActive]}>
              {t(language, 'dineIn')}
            </Text>
            <Text style={styles.typeDesc}>{t(language, 'dineInDesc')}</Text>
            {localOrderType === 'dine_in' && (
              <View style={styles.typeCheckmark}>
                <Text style={styles.typeCheckmarkText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.typeCard,
              localOrderType === 'takeaway' && styles.typeCardActive,
            ]}
            onPress={selectTakeaway}
            activeOpacity={0.85}
          >
            <View style={[styles.typeIconCircle, localOrderType === 'takeaway' && styles.typeIconCircleActive]}>
              <Text style={styles.typeIcon}>🛍️</Text>
            </View>
            <Text style={[styles.typeLabel, localOrderType === 'takeaway' && styles.typeLabelActive]}>
              {t(language, 'takeAway')}
            </Text>
            <Text style={styles.typeDesc}>{t(language, 'takeAwayDesc')}</Text>
            {localOrderType === 'takeaway' && (
              <View style={styles.typeCheckmark}>
                <Text style={styles.typeCheckmarkText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {showNumpad && (
          <Animated.View
            style={[
              styles.numpadArea,
              {
                opacity: numpadOpacity,
                transform: [{ translateY: numpadTranslate }],
              },
            ]}
          >
            <View style={styles.numpadDisplay}>
              <Text style={styles.numpadLabel}>{t(language, 'tableNumber')}</Text>
              <View style={styles.numpadValueRow}>
                <Text style={[styles.numpadValue, tableInput.length === 0 && styles.numpadPlaceholder]}>
                  {tableInput.length > 0 ? tableInput : '—'}
                </Text>
                {tableValid && (
                  <View style={styles.tableValidBadge}>
                    <Text style={styles.tableValidText}>{t(language, 'tableNumber')} {tableInput}</Text>
                  </View>
                )}
              </View>
              {tableInput.length > 0 && !tableValid && (
                <Text style={styles.numpadError}>{t(language, 'tableRangeError')}</Text>
              )}
            </View>

            <View style={styles.numpadGrid}>
              {NUMPAD_ROWS.map((row, rowIdx) => (
                <View key={rowIdx} style={styles.numpadRow}>
                  {row.map((key) => {
                    const isBackspace = key === '⌫';
                    const isConfirm = key === '✓';
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[
                          styles.numpadKey,
                          isBackspace && styles.numpadKeySecondary,
                          isConfirm && styles.numpadKeyConfirm,
                          isConfirm && !tableValid && styles.numpadKeyConfirmDisabled,
                        ]}
                        onPress={() => handleNumpadPress(key)}
                        disabled={isConfirm && !tableValid}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[
                            styles.numpadKeyText,
                            isBackspace && styles.numpadKeyTextSecondary,
                            isConfirm && styles.numpadKeyTextConfirm,
                            isConfirm && !tableValid && styles.numpadKeyTextConfirmDisabled,
                          ]}
                        >
                          {key}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
            onPress={handleConfirm}
            disabled={!canContinue}
            activeOpacity={0.85}
          >
            <Text style={[styles.continueBtnText, !canContinue && styles.continueBtnTextDisabled]}>
              {localOrderType === 'dine_in' && tableValid
                ? t(language, 'continueTableFmt', { n: tableInput })
                : localOrderType === 'takeaway'
                ? t(language, 'continueTakeaway')
                : t(language, 'enterTableNumber')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  headerArea: {
    paddingTop: 32,
    paddingBottom: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 28,
  },
  typeCard: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: '#2a2a2a',
    position: 'relative',
    minHeight: 200,
    justifyContent: 'center',
  },
  typeCardActive: {
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245,158,11,0.07)',
  },
  typeIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#2a2a2a',
  },
  typeIconCircleActive: {
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245,158,11,0.12)',
  },
  typeIcon: {
    fontSize: 38,
  },
  typeLabel: {
    fontSize: 26,
    fontWeight: '800',
    color: '#888',
    marginBottom: 8,
    textAlign: 'center',
  },
  typeLabelActive: {
    color: '#f59e0b',
  },
  typeDesc: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
    lineHeight: 22,
  },
  typeCheckmark: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: '#f59e0b',
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeCheckmarkText: {
    fontSize: 16,
    color: '#000',
    fontWeight: '900',
  },
  numpadArea: {
    marginBottom: 20,
  },
  numpadDisplay: {
    backgroundColor: '#111',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 24,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    alignItems: 'center',
  },
  numpadLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  numpadValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  numpadValue: {
    fontSize: 56,
    fontWeight: '900',
    color: '#f59e0b',
    letterSpacing: 4,
    minWidth: 80,
    textAlign: 'center',
  },
  numpadPlaceholder: {
    color: '#333',
  },
  tableValidBadge: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
  },
  tableValidText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f59e0b',
  },
  numpadError: {
    fontSize: 13,
    color: '#ef4444',
    marginTop: 6,
    textAlign: 'center',
  },
  numpadGrid: {
    gap: 10,
  },
  numpadRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  numpadKey: {
    flex: 1,
    height: 72,
    backgroundColor: '#111',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    maxWidth: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  numpadKeySecondary: {
    backgroundColor: '#1e1e1e',
    borderColor: '#333',
  },
  numpadKeyConfirm: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
    shadowColor: '#f59e0b',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  numpadKeyConfirmDisabled: {
    backgroundColor: '#2a2a2a',
    borderColor: '#2a2a2a',
    shadowOpacity: 0,
    elevation: 0,
  },
  numpadKeyText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  numpadKeyTextSecondary: {
    color: '#888',
    fontSize: 24,
  },
  numpadKeyTextConfirm: {
    color: '#000',
    fontWeight: '900',
  },
  numpadKeyTextConfirmDisabled: {
    color: '#555',
  },
  footer: {
    paddingTop: 8,
  },
  continueBtn: {
    backgroundColor: '#f59e0b',
    borderRadius: 20,
    paddingVertical: 22,
    alignItems: 'center',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
    minHeight: 80,
    justifyContent: 'center',
  },
  continueBtnDisabled: {
    backgroundColor: '#2a2a2a',
    shadowOpacity: 0,
    elevation: 0,
  },
  continueBtnText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000',
  },
  continueBtnTextDisabled: {
    color: '#555',
  },
});
