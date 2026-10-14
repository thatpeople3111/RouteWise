import { notFound } from 'next/navigation';
import NavigationTestHarness from '@/components/NavigationTestHarness';

export default function NavigationDebugPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <NavigationTestHarness />;
}
