import { redirect } from 'next/navigation';

/**
 * v2.7.48-univlog — /terminal-logs is now an alias for the unified /logs
 * page (Transactions + Activity tabs). Old bookmarks redirect to keep
 * support flows working.
 */
export default function TerminalLogsRedirect() {
  redirect('/logs');
}
