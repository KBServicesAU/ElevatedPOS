import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

/**
 * EOD redirect (v2.7.20).
 *
 * The dedicated End-of-Day screen has been merged into the Close Till
 * page — it's the single place operators close a shift. This module
 * exists so any stale deep links (bookmarks, push payloads, saved
 * command palette entries) still land on the right page instead of
 * throwing a "screen not found" error.
 */
export default function EodRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/(pos)/close-till' as never);
  }, [router]);
  return <View />;
}
