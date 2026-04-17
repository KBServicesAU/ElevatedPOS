/**
 * Root-level error boundary.
 *
 * When anything in the component tree throws during render, the app
 * previously showed a blank black screen — React unmounts the entire tree
 * and, because RootLayout renders nothing on error and the splash screen
 * has already been hidden, the device is left on a black window.
 *
 * This boundary catches those errors and renders a minimal visible fallback
 * so operators (and Sentry) can at least see what went wrong.
 */

import { Component, type ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import * as Sentry from '@sentry/react-native';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  errorInfo: { componentStack?: string | null } | null;
}

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string | null }): void {
    this.setState({ errorInfo });
    // Report to Sentry — best-effort so the error surface always renders.
    try {
      Sentry.captureException(error, {
        contexts: { react: { componentStack: errorInfo.componentStack ?? 'unknown' } },
      });
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line no-console
    console.error('[RootErrorBoundary]', error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({ error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    const { error, errorInfo } = this.state;
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Startup error</Text>
        <Text style={styles.subtitle}>The app hit an unexpected error during startup.</Text>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.label}>Message</Text>
          <Text style={styles.body}>{error.message || '(no message)'}</Text>
          {error.stack ? (
            <>
              <Text style={styles.label}>Stack</Text>
              <Text style={styles.mono}>{error.stack}</Text>
            </>
          ) : null}
          {errorInfo?.componentStack ? (
            <>
              <Text style={styles.label}>Component stack</Text>
              <Text style={styles.mono}>{errorInfo.componentStack}</Text>
            </>
          ) : null}
        </ScrollView>
        <TouchableOpacity style={styles.button} onPress={this.handleReset}>
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0d0f1f',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  title: { fontSize: 28, fontWeight: '900', color: '#ef4444', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#9ca3af', marginBottom: 24 },
  scroll: { flex: 1, backgroundColor: '#1a1b2e', borderRadius: 12, padding: 16 },
  scrollContent: { paddingBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', color: '#60a5fa', marginTop: 12, marginBottom: 4, letterSpacing: 1 },
  body: { fontSize: 14, color: '#e5e7eb', lineHeight: 20 },
  mono: { fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', lineHeight: 16 },
  button: {
    marginTop: 20,
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '700' },
});
