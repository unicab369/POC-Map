import type { Venue } from '$lib/types.ts';

const STORAGE_PREFIX = 'poc-map-';

export function saveVenue(venue: Venue): void {
	try {
		localStorage.setItem(`${STORAGE_PREFIX}${venue.id}`, JSON.stringify(venue));
	} catch {
		// localStorage full or unavailable
	}
}

export function loadVenue(venueId: string): Venue | null {
	try {
		const raw = localStorage.getItem(`${STORAGE_PREFIX}${venueId}`);
		if (raw) return JSON.parse(raw) as Venue;
	} catch {
		// corrupted data
	}
	return null;
}

export function clearVenue(venueId: string): void {
	localStorage.removeItem(`${STORAGE_PREFIX}${venueId}`);
}
