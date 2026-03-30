import { Redirect } from 'expo-router';
import React from 'react';

/**
 * Entry point — immediately redirects to the attract/idle screen.
 * The attract screen handles "TAP TO START" and leads into the ordering flow.
 */
export default function IndexScreen() {
  return <Redirect href="/attract" />;
}
