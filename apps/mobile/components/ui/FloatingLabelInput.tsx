/**
 * FloatingLabelInput — Material-style text input where the placeholder
 * "floats" up to become a label as soon as the field is focused or has
 * a value.
 *
 * Usage:
 *   <FloatingLabelInput label="Email" value={email} onChangeText={setEmail} />
 *   <FloatingLabelInput label="Amount" value={amt} onChangeText={setAmt} prefix="$" />
 *   <FloatingLabelInput label="Notes" value={n} onChangeText={setN} multiline />
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface FloatingLabelInputProps
  extends Omit<TextInputProps, 'placeholder' | 'placeholderTextColor'> {
  label: string;
  /** Optional helper / hint shown below the input. */
  helper?: string;
  /** Error message — when set, the input renders in error colour. */
  error?: string;
  /** Optional Ionicon shown on the left. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Optional prefix character (e.g. "$"). */
  prefix?: string;
  /** Optional suffix character (e.g. "%"). */
  suffix?: string;
  containerStyle?: ViewStyle;
}

const PRIMARY = '#6366f1';
const ERROR = '#ef4444';
const BORDER_IDLE = '#2a2a3a';
const BORDER_FOCUS = PRIMARY;
const TEXT = '#fff';
const LABEL_IDLE = '#666';
const LABEL_FOCUS = PRIMARY;
const HELPER = '#555';

export function FloatingLabelInput(props: FloatingLabelInputProps) {
  const {
    label,
    helper,
    error,
    icon,
    prefix,
    suffix,
    value,
    containerStyle,
    onFocus,
    onBlur,
    multiline,
    style,
    ...rest
  } = props;

  const [focused, setFocused] = useState(false);
  const animated = useRef(
    new Animated.Value(value && value.length > 0 ? 1 : 0),
  ).current;

  const isFloating = focused || (value && value.length > 0);

  useEffect(() => {
    Animated.timing(animated, {
      toValue: isFloating ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [isFloating, animated]);

  const labelTop = animated.interpolate({
    inputRange: [0, 1],
    outputRange: [multiline ? 18 : 16, -8],
  });
  const labelFontSize = animated.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 11],
  });

  const borderColor = error ? ERROR : focused ? BORDER_FOCUS : BORDER_IDLE;
  const labelColor = error ? ERROR : focused ? LABEL_FOCUS : LABEL_IDLE;

  return (
    <View style={[{ marginBottom: 12 }, containerStyle]}>
      <View
        style={[
          styles.box,
          { borderColor },
          multiline && { minHeight: 84, alignItems: 'flex-start', paddingTop: 18 },
        ]}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={18}
            color={focused ? PRIMARY : '#666'}
            style={{ marginRight: 8 }}
          />
        )}
        {prefix && isFloating && (
          <Text style={styles.affix}>{prefix}</Text>
        )}
        <TextInput
          {...rest}
          value={value}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            multiline && { textAlignVertical: 'top', paddingTop: 0 },
            style as object,
          ]}
          placeholderTextColor="transparent"
          selectionColor={PRIMARY}
          underlineColorAndroid="transparent"
        />
        {suffix && isFloating && (
          <Text style={styles.affix}>{suffix}</Text>
        )}
        <Animated.Text
          style={[
            styles.label,
            {
              top: labelTop,
              fontSize: labelFontSize,
              color: labelColor,
              left: icon ? 38 : 14,
              backgroundColor: isFloating ? '#0d0d14' : 'transparent',
              paddingHorizontal: isFloating ? 4 : 0,
            },
          ]}
        >
          {label}
        </Animated.Text>
      </View>
      {(helper || error) && (
        <Text style={[styles.helper, error ? { color: ERROR } : null]}>
          {error ?? helper}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d0d14',
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 56,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: TEXT,
    padding: 0,
    margin: 0,
  },
  affix: {
    color: '#888',
    fontSize: 15,
    marginRight: 4,
  },
  label: {
    position: 'absolute',
    fontWeight: '600',
  },
  helper: {
    color: HELPER,
    fontSize: 11,
    marginTop: 4,
    marginLeft: 14,
  },
});
