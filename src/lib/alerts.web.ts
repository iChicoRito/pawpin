import type { PermissionResponse } from 'expo-modules-core';

import type { ReportPlace } from '@/lib/reports';

// The browser version. Push alerts work in the phone app only, so every one of these does nothing.
// Same names as alerts.ts.

export async function registerForAlerts(_userId: string) {}

export async function saveLastPlace(_userId: string, _place: ReportPlace) {}

export async function fetchAlertRadius(_userId: string): Promise<number> {
  throw new Error('Alerts work in the phone app.');
}

export async function saveAlertRadius(_userId: string, _radiusM: number) {}

export function useAlertPermission() {
  const request = async (): Promise<PermissionResponse> => {
    throw new Error('Alerts work in the phone app.');
  };
  return [null as PermissionResponse | null, request] as const;
}

export function useAlertRegistration(_userId: string | undefined) {}

export function useAlertTaps() {}

export async function isAlertCardDismissed() {
  return true;
}

export function dismissAlertCard() {}
