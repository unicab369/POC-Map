import type { Venue } from '$lib/types.ts';

const STORAGE_PREFIX = 'poc-map-';
const OVERLAY_PREFIX = 'poc-map-overlay-';

export interface OverlayData {
	imageDataUrl: string;
	opacity: number;
	rotation: number;
	bounds: [[number, number], [number, number]];
}

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

export function saveOverlay(venueId: string, data: OverlayData): void {
	try {
		localStorage.setItem(`${OVERLAY_PREFIX}${venueId}`, JSON.stringify(data));
	} catch {
		// localStorage full (likely large base64 image) — silently fail
	}
}

export function loadOverlay(venueId: string): OverlayData | null {
	try {
		const raw = localStorage.getItem(`${OVERLAY_PREFIX}${venueId}`);
		if (raw) return JSON.parse(raw) as OverlayData;
	} catch {
		// corrupted data
	}
	return null;
}

export function clearOverlayStorage(venueId: string): void {
	localStorage.removeItem(`${OVERLAY_PREFIX}${venueId}`);
}
