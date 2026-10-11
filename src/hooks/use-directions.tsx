import * as Linking from 'expo-linking';
import { useFeedbackToast } from '@/hooks/use-feedback';

import { ToastIcon } from '@/components/report-sent';
import { googleMapsLink, wazeLink } from '@/lib/directions';

/** Opens directions to a place in Google Maps or Waze, and says so if the phone could not. */
export function useDirections(place: { latitude: number; longitude: number } | undefined) {
  const { toast } = useFeedbackToast();

  async function open(link: string) {
    try {
      await Linking.openURL(link);
    } catch (error) {
      console.warn('Opening directions failed:', error);
      toast.show({
        variant: 'danger',
        icon: <ToastIcon status="danger" />,
        label: 'Could not open the maps app',
        description: 'Check that a maps app or a browser is installed.',
      });
    }
  }

  return {
    openGoogleMaps: () => place && open(googleMapsLink(place)),
    openWaze: () => place && open(wazeLink(place)),
  };
}
