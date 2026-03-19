import Konva from 'konva';
import type { Venue, POICategory } from '$lib/types.ts';
import { renderVenue } from '$lib/components/FloorRenderer.ts';
import type { SpotClickHandler } from '$lib/components/FloorRenderer.ts';
import type { GeoConverter } from '$lib/geoConvert.ts';

export interface KonvaOverlayHandle {
	update(venue: Venue, activeCategories: Set<POICategory>): void;
	show(): void;
	hide(): void;
	resize(): void;
	destroy(): void;
}

const noopClick: SpotClickHandler = () => {};

export function createKonvaOverlay(
	mapContainer: HTMLDivElement,
	leafletMap: any,
	venue: Venue,
	activeCategories: Set<POICategory>,
	converter?: GeoConverter
): KonvaOverlayHandle {
	// Create overlay div positioned over the map container
	const overlayDiv = document.createElement('div');
	overlayDiv.style.position = 'absolute';
	overlayDiv.style.inset = '0';
	overlayDiv.style.pointerEvents = 'none';
	overlayDiv.style.zIndex = '400';
	overlayDiv.style.overflow = 'hidden';
	mapContainer.style.position = 'relative';
	mapContainer.appendChild(overlayDiv);

	const width = mapContainer.clientWidth;
	const height = mapContainer.clientHeight;

	const stage = new Konva.Stage({
		container: overlayDiv,
		width,
		height,
		listening: false
	});

	const layer = new Konva.Layer({ listening: false });
	stage.add(layer);

	let venueGroup: Konva.Group;
	let currentVenue = venue;
	let currentConverter = converter;

	function render(v: Venue, categories: Set<POICategory>) {
		layer.destroyChildren();
		venueGroup = renderVenue(v, noopClick, categories, {
			skipBackground: true,
			skipVenueLabel: true
		});
		layer.add(venueGroup);
		syncTransform();
	}

	function syncTransform() {
		if (!venueGroup) return;

		if (currentConverter) {
			// GPS mode: map pixel corners to lat/lng, then to container points
			const topLeftGeo = currentConverter.pixelToLatLng(0, 0);
			const bottomRightGeo = currentConverter.pixelToLatLng(currentVenue.width, currentVenue.height);
			const topLeft = leafletMap.latLngToContainerPoint([topLeftGeo.lat, topLeftGeo.lng]);
			const bottomRight = leafletMap.latLngToContainerPoint([bottomRightGeo.lat, bottomRightGeo.lng]);
			const scaleX = (bottomRight.x - topLeft.x) / currentVenue.width;
			const scaleY = (bottomRight.y - topLeft.y) / currentVenue.height;
			venueGroup.position({ x: topLeft.x, y: topLeft.y });
			venueGroup.scale({ x: scaleX, y: scaleY });
		} else {
			// Pixel mode (fallback): existing behavior
			const topLeft = leafletMap.latLngToContainerPoint([0, 0]);
			const bottomRight = leafletMap.latLngToContainerPoint([currentVenue.height, currentVenue.width]);
			const scaleX = (bottomRight.x - topLeft.x) / currentVenue.width;
			const scaleY = (bottomRight.y - topLeft.y) / currentVenue.height;
			venueGroup.position({ x: topLeft.x, y: topLeft.y });
			venueGroup.scale({ x: scaleX, y: scaleY });
		}

		layer.batchDraw();
	}

	function onMapMove() {
		syncTransform();
	}

	leafletMap.on('move zoom zoomend viewreset', onMapMove);

	// Initial render (hidden by default)
	render(venue, activeCategories);
	overlayDiv.style.display = 'none';

	return {
		update(v: Venue, categories: Set<POICategory>) {
			currentVenue = v;
			render(v, categories);
		},

		show() {
			overlayDiv.style.display = '';
			syncTransform();
		},

		hide() {
			overlayDiv.style.display = 'none';
		},

		resize() {
			const w = mapContainer.clientWidth;
			const h = mapContainer.clientHeight;
			stage.width(w);
			stage.height(h);
			syncTransform();
		},

		destroy() {
			leafletMap.off('move zoom zoomend viewreset', onMapMove);
			stage.destroy();
			overlayDiv.remove();
		}
	};
}
