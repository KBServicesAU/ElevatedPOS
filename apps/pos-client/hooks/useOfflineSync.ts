import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { syncPendingEvents } from '../lib/syncService';
import { initOfflineDB } from '../lib/offlineQueue';

export function useOfflineSync() {
  const syncInProgress = useRef(false);

  useEffect(() => {
    initOfflineDB();

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && !syncInProgress.current) {
        syncInProgress.current = true;
        syncPendingEvents()
          .then(({ synced, failed }) => {
            if (synced > 0) console.log(`Synced ${synced} offline events`);
            if (failed > 0) console.warn(`${failed} events failed to sync`);
          })
          .finally(() => {
            syncInProgress.current = false;
          });
      }
    });

    return () => unsubscribe();
  }, []);
}
