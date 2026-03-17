import Konva from 'konva';
import type { Floor, POICategory, Spot } from '$lib/types.ts';
import { renderFloor } from '$lib/components/FloorRenderer.ts';
import type { SpotClickHandler } from '$lib/components/FloorRenderer.ts';
import type { GeoConverter } from '$lib/geoConvert.ts';

export interface KonvaOverlayHandle {
	update(floor: Floor, activeCategories: Set<POICategory>): void;
	show(): void;
	hide(): void;
	resize(): void;
	destroy(): void;
}

const noopClick: SpotClickHandler = () => {};

export function createKonvaOverlay(
	mapContainer: HTMLDivElement,
	leafletMap: any,
	floor: Floor,
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

	let floorGroup: Konva.Group;
	let currentFloor = floor;
	let currentConverter = converter;

	function render(f: Floor, categories: Set<POICategory>) {
		layer.destroyChildren();
		floorGroup = renderFloor(f, noopClick, categories, {
			skipBackground: true,
			skipFloorLabel: true
		});
		layer.add(floorGroup);
		syncTransform();
	}

	function syncTransform() {
		if (!floorGroup) return;

		if (currentConverter) {
			// GPS mode: map pixel corners to lat/lng, then to container points
			const topLeftGeo = currentConverter.pixelToLatLng(0, 0);
			const bottomRightGeo = currentConverter.pixelToLatLng(currentFloor.width, currentFloor.height);
			const topLeft = leafletMap.latLngToContainerPoint([topLeftGeo.lat, topLeftGeo.lng]);
			const bottomRight = leafletMap.latLngToContainerPoint([bottomRightGeo.lat, bottomRightGeo.lng]);
			const scaleX = (bottomRight.x - topLeft.x) / currentFloor.width;
			const scaleY = (bottomRight.y - topLeft.y) / currentFloor.height;
			floorGroup.position({ x: topLeft.x, y: topLeft.y });
			floorGroup.scale({ x: scaleX, y: scaleY });
		} else {
			// Pixel mode (fallback): existing behavior
			const topLeft = leafletMap.latLngToContainerPoint([0, 0]);
			const bottomRight = leafletMap.latLngToContainerPoint([currentFloor.height, currentFloor.width]);
			const scaleX = (bottomRight.x - topLeft.x) / currentFloor.width;
			const scaleY = (bottomRight.y - topLeft.y) / currentFloor.height;
			floorGroup.position({ x: topLeft.x, y: topLeft.y });
			floorGroup.scale({ x: scaleX, y: scaleY });
		}

		layer.batchDraw();
	}

	function onMapMove() {
		syncTransform();
	}

	leafletMap.on('move zoom zoomend viewreset', onMapMove);

	// Initial render (hidden by default)
	render(floor, activeCategories);
	overlayDiv.style.display = 'none';

	return {
		update(f: Floor, categories: Set<POICategory>) {
			currentFloor = f;
			render(f, categories);
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
