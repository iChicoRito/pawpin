import { Tabs } from 'heroui-native';

import { useNearbyReports } from '@/hooks/use-nearby-reports';
import { RADIUS_CHOICES } from '@/lib/nearby';

/** How far to search. One choice, shared by the Map and the List. */
export function RadiusChoice() {
  const { radiusM, setRadius } = useNearbyReports();

  return (
    <Tabs
      aria-label="Search distance"
      value={String(radiusM)}
      onValueChange={(value) => setRadius(Number(value))}>
      {/* Stretched across the column, with every part the same width. */}
      <Tabs.List className="self-stretch">
        <Tabs.Indicator />
        {RADIUS_CHOICES.map((choice) => (
          <Tabs.Trigger key={choice.value} value={String(choice.value)} className="flex-1">
            <Tabs.Label>{choice.label}</Tabs.Label>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
