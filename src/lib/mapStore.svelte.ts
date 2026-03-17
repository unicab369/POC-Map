import type { Spot, POICategory, ViewMode } from '$lib/types.ts';

class MapStore {
	selectedSpot = $state<Spot | null>(null);
	viewMode = $state<ViewMode>('flat');
	activeCategories = $state<Set<POICategory>>(new Set(['food', 'attraction', 'shop', 'restroom', 'info', 'gate', 'security']));
	popupPosition = $state<{ x: number; y: number } | null>(null);

	selectSpot(spot: Spot, screenX: number, screenY: number) {
		this.selectedSpot = spot;
		this.popupPosition = { x: screenX, y: screenY };
	}

	clearSelection() {
		this.selectedSpot = null;
		this.popupPosition = null;
	}

	toggleView() {
		this.viewMode = this.viewMode === 'flat' ? 'isometric' : 'flat';
	}

	toggleCategory(category: POICategory) {
		const next = new Set(this.activeCategories);
		if (next.has(category)) {
			next.delete(category);
		} else {
			next.add(category);
		}
		this.activeCategories = next;
	}

	isCategoryActive(category: POICategory): boolean {
		return this.activeCategories.has(category);
	}

	resetFilters() {
		this.activeCategories = new Set(['food', 'attraction', 'shop', 'restroom', 'info', 'gate', 'security']);
	}
}

export const mapStore = new MapStore();
