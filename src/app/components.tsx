import { useRouter } from 'expo-router';

import { HeroShowcase } from '@/components/hero-showcase';

/** Every HeroUI component on one page, for exploring the design system. Not linked from the tab bar. */
export default function ComponentsScreen() {
  const router = useRouter();
  return <HeroShowcase onBack={() => router.back()} />;
}
