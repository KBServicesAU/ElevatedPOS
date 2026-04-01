import { redirect } from 'next/navigation';

// Root redirects — in production this would show a platform landing page
export default function HomePage() {
  redirect('/store');
}
