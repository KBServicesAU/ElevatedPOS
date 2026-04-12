import type { Metadata } from 'next';
import DisplayEditorClient from './display-editor-client';

export const metadata: Metadata = { title: 'Display Screens | ElevatedPOS' };

export default function DisplayPage() {
  return <DisplayEditorClient />;
}
