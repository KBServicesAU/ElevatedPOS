/**
 * Pure-JS QR code component.
 *
 * Uses the `qrcode-generator` npm package (no native deps) to compute
 * the dark/light matrix, then renders it as a grid of <View> cells.
 * Roughly 1k–1.5k cells for a typical Stripe Checkout URL — fine for
 * a payment screen that's only briefly visible.
 *
 * We deliberately avoid `react-native-svg` / `react-native-qrcode-svg`
 * to keep the EAS rebuild footprint small. The View-grid approach
 * doesn't anti-alias the modules, but for a QR code that's fine —
 * cameras read it just as well.
 */
import React, { useMemo } from 'react';
import { View, type ViewStyle } from 'react-native';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const qrcode = require('qrcode-generator') as (typeNumber: number, ec: 'L' | 'M' | 'Q' | 'H') => {
  addData: (s: string) => void;
  make: () => void;
  getModuleCount: () => number;
  isDark: (row: number, col: number) => boolean;
};

interface QrCodeProps {
  /** The payload to encode. Long URLs auto-bump to a higher type number. */
  value: string;
  /** Visible side length in pixels (rendered square). */
  size: number;
  /** Background colour around modules. Defaults to white. */
  background?: string;
  /** Foreground / dark-module colour. Defaults to black. */
  foreground?: string;
  /** Quiet-zone width in modules. QR spec says 4; we default to 2 to
   *  conserve screen space on phone-style displays. */
  quietZone?: number;
}

export function QrCode({
  value,
  size,
  background = '#fff',
  foreground = '#000',
  quietZone = 2,
}: QrCodeProps) {
  const matrix = useMemo(() => {
    // typeNumber: 0 = auto-pick the smallest version that fits the
    // payload + EC level. Level M survives ~15% damage which is the
    // sweet spot between density and resilience for a payment QR.
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    const m: boolean[][] = [];
    for (let r = 0; r < count; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < count; c++) {
        row.push(qr.isDark(r, c));
      }
      m.push(row);
    }
    return m;
  }, [value]);

  const moduleCount = matrix.length;
  const totalModules = moduleCount + quietZone * 2;
  const cellSize = size / totalModules;

  // Container with the quiet zone bg-fill.
  const containerStyle: ViewStyle = {
    width: size,
    height: size,
    backgroundColor: background,
    padding: cellSize * quietZone,
  };

  return (
    <View style={containerStyle} accessibilityLabel="Payment QR code">
      {matrix.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {row.map((dark, c) => (
            <View
              key={c}
              style={{
                width: cellSize,
                height: cellSize,
                backgroundColor: dark ? foreground : background,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
