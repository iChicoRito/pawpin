// Directions are handed to other apps by a plain web link. It opens the app when it is installed
// and its web page when it is not, costs nothing, and needs no key. No starting point is given, so
// the route begins where the rescuer is.
//
// Both links take latitude first, the opposite of the map and the database.

type Place = { latitude: number; longitude: number };

/** Google Maps, with the animal's place as the destination. */
export function googleMapsLink({ latitude, longitude }: Place) {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

/** Waze, set to start navigating to the animal's place. */
export function wazeLink({ latitude, longitude }: Place) {
  return `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`;
}
