export function distanceInKm(
  latitude: number,
  longitude: number,
  destinationLatitude: number,
  destinationLongitude: number,
) {
  const radians = Math.PI / 180;
  const latitudeDifference = (destinationLatitude - latitude) * radians;
  const longitudeDifference = (destinationLongitude - longitude) * radians;
  const rawA =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(latitude * radians) *
      Math.cos(destinationLatitude * radians) *
      Math.sin(longitudeDifference / 2) ** 2;
  const a = Math.min(1, Math.max(0, rawA));
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
