import type { Metadata } from 'next';
import { TerminalLogsClient } from './terminal-logs-client';

export const metadata: Metadata = { title: 'Terminal Logs' };

export default function TerminalLogsPage() {
  return <TerminalLogsClient />;
}
