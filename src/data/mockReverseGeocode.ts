import type { Coordinates } from '@/lib/types';

const mockLocations: { name: string; coordinates: Coordinates }[] = [
	{ name: 'Tamiami Hall', coordinates: { latitude: 25.7531, longitude: -80.3751 } },
];

const MATCH_TOLERANCE_METERS = 150;
const EARTH_RADIUS_METERS = 6_371_000;

function distanceMeters(first: Coordinates, second: Coordinates) {
	const radians = (degrees: number) => degrees * Math.PI / 180;
	const latitudeDelta = radians(second.latitude - first.latitude);
	const longitudeDelta = radians(second.longitude - first.longitude);
	const firstLatitude = radians(first.latitude);
	const secondLatitude = radians(second.latitude);
	const haversine = Math.sin(latitudeDelta / 2) ** 2
		+ Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;

	return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

export function mockReverseGeocode(coordinates: Coordinates) {
	const match = mockLocations.find(location => distanceMeters(coordinates, location.coordinates) <= MATCH_TOLERANCE_METERS);
	if (match) return match.name;

	return `Current Location (${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)})`;
}