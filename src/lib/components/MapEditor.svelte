<script lang="ts">
	import { onMount } from 'svelte';
	import type { Venue, Zone, Area, Spot, ShapeDef, ShapeStyle, POICategory } from '$lib/types.ts';
	import { CATEGORY_COLORS } from '$lib/types.ts';
	import { createGeoConverter, type GeoConverter } from '$lib/geoConvert.ts';
	import { saveOverlay, loadOverlay, clearOverlayStorage } from '$lib/storage.ts';

	let {
		venue = $bindable(),
	}: {
		venue: Venue;
	} = $props();

	let mapContainer: HTMLDivElement;
	let fabColumnEl: HTMLDivElement;
	let map: any;
	let shapeLayers: any[] = [];
	let floorBackgroundLayer: any = null;
	let venueGeoBounds = $state<any>(null); // Leaflet LatLngBounds for "back to venue"

	type DrawLevel = 'zone' | 'area' | 'spot';
	let drawLevel = $state<DrawLevel>('zone');
	let selectedZoneId = $state<string>('');
	let selectedAreaId = $state<string>('');
	let showDialog = $state(false);
	let pendingLayer = $state<any>(null);
	let dialogName = $state('');
	let dialogCategory = $state<POICategory>('info');
	let dialogDescription = $state('');

	// Zone visibility filter
	let activeZoneId = $state<string>(venue.zones[0]?.id ?? '');
	let isFloorVenue = $derived(venue.zones.some(z => z.zoneType === 'floor'));

	// Zone layer lookup (zoneId → Leaflet layer)
	let zoneLayerMap = new Map<string, any>();

	// Zone drag-to-move state
	let editingZoneId = $state<string>('');
	let editingLayer: any = null;
	let editingOriginalShape: ShapeDef | null = null;
	let zoneClickedFlag = false;

	// Toolbar selection state (works for both zones and areas)
	type EditingTarget = { type: 'zone'; zoneId: string } | { type: 'area'; zoneId: string; areaId: string } | { type: 'spot'; zoneId: string; areaId: string; spotId: string };
	let editingTarget = $state<EditingTarget | null>(null);
	let editingTargetLayer: any = null;
	let toolbarPosition = $state<{ x: number; y: number } | null>(null);
	let activeToolbarAction = $state<'rename' | 'category' | 'style' | null>(null);
	let renameValue = $state('');
	let deleteConfirming = $state(false);
	let resizeActive = $state(false);
	let isDragging = $state(false);

	// Style editing state
	let styleFill = $state('#3b82f6');
	let styleOpacity = $state(0.85);
	let styleStroke = $state('#cbd5e1');
	let styleStrokeWidth = $state(1);

	// Edit mode state
	let editMode = $state(false);
	let editModeTarget = $state<EditingTarget | null>(null);
	let tileLayerRef: any = null;
	let editModeLayer: any = null; // the primary layer being edited (zone or area)

	// Edit mode click-to-select state
	let editModeSelection = $state<'shape' | 'overlay' | null>(null);
	let shapeRotateMarker: any = null;
	let shapeDragHandlers: any = null;
	let shapeRotateEdgeIdx: [number, number] | null = null;

	// Redraw shape state
	let redrawActive = $state(false);
	let redrawOriginalLayer: any = null;

	// Original shape snapshot for reset
	let editModeOriginalShapes: any = null;

	// Edit mode map visibility (persisted)
	let editModeShowMap = $state(false);

	// Image overlay state
	let overlayImageUrl = $state('');
	let overlayOpacity = $state(0.5);
	let overlayLayer: any = null;
	let overlayRotation = $state(0);
	let overlayCornerMarkers: any[] = [];
	let overlayRotateMarker: any = null;
	let overlaySelectionRect: any = null;
	let overlayDragState: { dragging: boolean; startLatLng: any } | null = null;
	let overlayDragHandlers: { mousedown: any; mousemove: any; mouseup: any } | null = null;
	let overlayEdgeMarkers: any[] = [];
	let shapeEdgeMarkers: any[] = [];

	// Side panel live editing state
	let panelName = $state('');
	let panelCategory = $state<POICategory>('info');
	let panelFill = $state('#3b82f6');
	let panelOpacity = $state(0.85);
	let panelStroke = $state('#cbd5e1');
	let panelStrokeWidth = $state(1);
	let panelDescription = $state('');

	const categories: POICategory[] = ['food', 'attraction', 'shop', 'restroom', 'info', 'gate', 'security'];

	function getGeoConverter(): GeoConverter | undefined {
		if (!venue.geoBounds) return undefined;
		return createGeoConverter(venue.geoBounds, venue.width, venue.height);
	}

	function layerToShapeDef(layer: any): ShapeDef {
		const L = (window as any).L;
		if (layer instanceof L.Circle) {
			const center = layer.getLatLng();
			const radius = layer.getRadius();
			return { type: 'circle', x: center.lng, y: center.lat, radius };
		}
		if (layer instanceof L.Rectangle) {
			const bounds = layer.getBounds();
			const sw = bounds.getSouthWest();
			const ne = bounds.getNorthEast();
			const x = sw.lng;
			const y = sw.lat;
			return { type: 'rect', x, y, width: ne.lng - sw.lng, height: ne.lat - sw.lat };
		}
		// Polygon
		const latlngs = layer.getLatLngs()[0] as any[];
		const points: number[] = [];
		for (const ll of latlngs) {
			points.push(ll.lng, ll.lat);
		}
		return { type: 'polygon', points };
	}

	function defaultStyle(level: DrawLevel, category: POICategory): ShapeStyle {
		if (level === 'spot') {
			return { fill: CATEGORY_COLORS[category] };
		}
		if (level === 'area') {
			return { fill: CATEGORY_COLORS[category], opacity: 0.7, stroke: '#cbd5e1', strokeWidth: 1 };
		}
		return { fill: CATEGORY_COLORS[category], opacity: 0.85, stroke: '#cbd5e1', strokeWidth: 1 };
	}

	function generateId(prefix: string): string {
		return `${prefix}-${Date.now().toString(36)}`;
	}

	function updateToolbarPosition() {
		const layer = editingTargetLayer ?? editingLayer;
		if (!layer || !map || !mapContainer) {
			toolbarPosition = null;
			return;
		}
		const bounds = layer.getBounds();
		const L = (window as any).L;
		// Position to the right of the shape, vertically centered
		const rightCenter = L.latLng(
			(bounds.getNorth() + bounds.getSouth()) / 2,
			bounds.getEast()
		);
		const point = map.latLngToContainerPoint(rightCenter);
		const containerRect = mapContainer.getBoundingClientRect();
		const x = Math.min(point.x + 20, containerRect.width - 200);
		const y = Math.max(10, Math.min(point.y, containerRect.height - 200));
		toolbarPosition = { x, y };
	}

	function resetToolbarSubState() {
		activeToolbarAction = null;
		renameValue = '';
		deleteConfirming = false;
	}

	function getEditingZone(): Zone | undefined {
		return venue.zones.find(z => z.id === editingZoneId);
	}

	/** Returns the zone, area, or spot entity currently selected by the toolbar */
	function getEditingEntity(): (Zone | Area | Spot) | undefined {
		if (!editingTarget) return undefined;
		const zone = venue.zones.find(z => z.id === editingTarget!.zoneId);
		if (!zone) return undefined;
		if (editingTarget.type === 'zone') return zone;
		const area = zone.areas.find(a => a.id === (editingTarget as any).areaId);
		if (editingTarget.type === 'area') return area;
		return area?.spots.find(s => s.id === (editingTarget as any).spotId);
	}

	function getEditingEntityLevel(): DrawLevel {
		return editingTarget?.type ?? 'zone';
	}

	function getEditingEntityLabelClass(): string {
		return `label-${editingTarget?.type ?? 'zone'}`;
	}

	function selectEntityForToolbar(target: EditingTarget, layer: any) {
		// Deselect previous toolbar target if different
		if (editingTargetLayer && editingTargetLayer !== layer) {
			const prevEntity = getEditingEntity();
			if (prevEntity) {
				editingTargetLayer.setStyle({
					color: prevEntity.style.stroke ?? '#cbd5e1',
					weight: prevEntity.style.strokeWidth ?? 1,
					dashArray: ''
				});
			}
			if (resizeActive) { editingTargetLayer.pm.disable(); resizeActive = false; }
		}
		editingTarget = target;
		editingTargetLayer = layer;
		layer.setStyle({ weight: 3, dashArray: '6 4', color: '#facc15' });
		resetToolbarSubState();
		updateToolbarPosition();
	}

	function deselectEntity() {
		if (editingTargetLayer) {
			if (resizeActive) { editingTargetLayer.pm.disable(); resizeActive = false; }
			const entity = getEditingEntity();
			if (entity) {
				editingTargetLayer.setStyle({
					color: entity.style.stroke ?? '#cbd5e1',
					weight: entity.style.strokeWidth ?? 1,
					dashArray: ''
				});
			}
		}
		editingTarget = null;
		editingTargetLayer = null;
		toolbarPosition = null;
		resetToolbarSubState();
	}

	function handleRenameConfirm() {
		const entity = getEditingEntity();
		if (entity && renameValue.trim()) {
			entity.name = renameValue.trim();
			venue = { ...venue };
			if (editingTargetLayer) {
				editingTargetLayer.unbindTooltip();
				editingTargetLayer.bindTooltip(entity.name, { permanent: true, direction: 'center', className: getEditingEntityLabelClass() });
			}
		}
		activeToolbarAction = null;
	}

	function handleCategoryChange(cat: POICategory) {
		const entity = getEditingEntity();
		if (entity) {
			entity.category = cat;
			entity.style = defaultStyle(getEditingEntityLevel(), cat);
			venue = { ...venue };
			if (editingTargetLayer) {
				editingTargetLayer.setStyle({
					fillColor: entity.style.fill,
					fillOpacity: entity.style.opacity ?? 0.6,
					color: '#facc15',
					weight: 3,
					dashArray: '6 4'
				});
			}
		}
		activeToolbarAction = null;
	}

	function openStyleEditor() {
		const entity = getEditingEntity();
		if (entity) {
			styleFill = entity.style.fill;
			styleOpacity = entity.style.opacity ?? 0.85;
			styleStroke = entity.style.stroke ?? '#cbd5e1';
			styleStrokeWidth = entity.style.strokeWidth ?? 1;
		}
		activeToolbarAction = 'style';
	}

	function applyStyleChange() {
		const entity = getEditingEntity();
		if (entity && editingTargetLayer) {
			entity.style.fill = styleFill;
			entity.style.opacity = styleOpacity;
			entity.style.stroke = styleStroke;
			entity.style.strokeWidth = styleStrokeWidth;
			editingTargetLayer.setStyle({
				fillColor: styleFill,
				fillOpacity: styleOpacity,
				color: '#facc15',
				weight: 3,
				dashArray: '6 4'
			});
			venue = { ...venue };
		}
	}

	function handleStyleConfirm() {
		applyStyleChange();
		activeToolbarAction = null;
	}

	function toggleResize() {
		if (!editingTargetLayer) return;
		if (resizeActive) {
			editingTargetLayer.pm.disable();
			let newShape = layerToShapeDef(editingTargetLayer);
			const converter = getGeoConverter();
			if (converter) newShape = converter.shapeToPixel(newShape);
			const entity = getEditingEntity();
			if (entity) {
				entity.shape = newShape;
				venue = { ...venue };
			}
			resizeActive = false;
			renderExistingShapes();
		} else {
			editingTargetLayer.pm.enable({ allowSelfIntersection: false });
			resizeActive = true;
		}
	}

	function handleDuplicate() {
		if (!editingTarget) return;
		if (editingTarget.type === 'zone') {
			const zone = venue.zones.find(z => z.id === editingTarget!.zoneId);
			if (!zone) return;
			const cloned: Zone = JSON.parse(JSON.stringify(zone));
			cloned.id = generateId('zone');
			cloned.name = zone.name + ' (copy)';
			cloned.shape = applyDelta(cloned.shape, 20, 20);
			for (const area of cloned.areas) {
				area.id = generateId('area');
				area.shape = applyDelta(area.shape, 20, 20);
				for (const spot of area.spots) {
					spot.id = generateId('spot');
					spot.shape = applyDelta(spot.shape, 20, 20);
				}
			}
			venue.zones = [...venue.zones, cloned];
		} else if (editingTarget.type === 'area') {
			const zone = venue.zones.find(z => z.id === editingTarget!.zoneId);
			if (!zone) return;
			const area = zone.areas.find(a => a.id === (editingTarget as any).areaId);
			if (!area) return;
			const cloned: Area = JSON.parse(JSON.stringify(area));
			cloned.id = generateId('area');
			cloned.name = area.name + ' (copy)';
			cloned.shape = applyDelta(cloned.shape, 20, 20);
			for (const spot of cloned.spots) {
				spot.id = generateId('spot');
				spot.shape = applyDelta(spot.shape, 20, 20);
			}
			zone.areas = [...zone.areas, cloned];
		} else if (editingTarget.type === 'spot') {
			const zone = venue.zones.find(z => z.id === editingTarget!.zoneId);
			if (!zone) return;
			const area = zone.areas.find(a => a.id === (editingTarget as any).areaId);
			if (!area) return;
			const spot = area.spots.find(s => s.id === (editingTarget as any).spotId);
			if (!spot) return;
			const cloned: Spot = JSON.parse(JSON.stringify(spot));
			cloned.id = generateId('spot');
			cloned.name = spot.name + ' (copy)';
			cloned.shape = applyDelta(cloned.shape, 20, 20);
			area.spots = [...area.spots, cloned];
		}
		venue = { ...venue };
		deselectEntity();
		deselectZone();
		renderExistingShapes();
	}

	function handleDelete() {
		if (!editingTarget) return;
		if (editingTarget.type === 'zone') {
			venue.zones = venue.zones.filter(z => z.id !== editingTarget!.zoneId);
		} else if (editingTarget.type === 'area') {
			const zone = venue.zones.find(z => z.id === editingTarget!.zoneId);
			if (zone) {
				zone.areas = zone.areas.filter(a => a.id !== (editingTarget as any).areaId);
			}
		} else if (editingTarget.type === 'spot') {
			const zone = venue.zones.find(z => z.id === editingTarget!.zoneId);
			if (!zone) return;
			const area = zone.areas.find(a => a.id === (editingTarget as any).areaId);
			if (area) {
				area.spots = area.spots.filter(s => s.id !== (editingTarget as any).spotId);
			}
		}
		venue = { ...venue };
		deselectEntity();
		deselectZone();
		renderExistingShapes();
	}

	const colorSwatches = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#1e293b', '#ffffff', '#fbbf24', '#0ea5e9'];
	const strokeSwatches = ['#cbd5e1', '#94a3b8', '#475569', '#1e293b', '#ffffff', '#000000'];

	function getEditModeEntity(): (Zone | Area | Spot) | undefined {
		if (!editModeTarget) return undefined;
		const zone = venue.zones.find(z => z.id === editModeTarget.zoneId);
		if (!zone) return undefined;
		if (editModeTarget.type === 'zone') return zone;
		const area = zone.areas.find(a => a.id === (editModeTarget as any).areaId);
		if (editModeTarget.type === 'area') return area;
		return area?.spots.find(s => s.id === (editModeTarget as any).spotId);
	}

	function snapshotEditModeShapes(target: EditingTarget) {
		const zone = venue.zones.find(z => z.id === target.zoneId);
		if (!zone) return null;
		if (target.type === 'zone') {
			return JSON.parse(JSON.stringify({
				shape: zone.shape,
				areas: zone.areas.map(a => ({
					id: a.id, shape: a.shape,
					spots: a.spots.map(s => ({ id: s.id, shape: s.shape }))
				}))
			}));
		} else if (target.type === 'area') {
			const area = zone.areas.find(a => a.id === target.areaId);
			if (!area) return null;
			return JSON.parse(JSON.stringify({
				shape: area.shape,
				spots: area.spots.map(s => ({ id: s.id, shape: s.shape }))
			}));
		} else {
			const area = zone.areas.find(a => a.id === target.areaId);
			const spot = area?.spots.find(s => s.id === target.spotId);
			if (!spot) return null;
			return JSON.parse(JSON.stringify({ shape: spot.shape }));
		}
	}

	function resetEditModeShapes() {
		if (!editModeTarget || !editModeOriginalShapes) return;
		const zone = venue.zones.find(z => z.id === editModeTarget.zoneId);
		if (!zone) return;

		if (editModeTarget.type === 'zone') {
			zone.shape = editModeOriginalShapes.shape;
			for (const aSnap of editModeOriginalShapes.areas) {
				const area = zone.areas.find(a => a.id === aSnap.id);
				if (area) {
					area.shape = aSnap.shape;
					for (const sSnap of aSnap.spots) {
						const spot = area.spots.find(s => s.id === sSnap.id);
						if (spot) spot.shape = sSnap.shape;
					}
				}
			}
		} else if (editModeTarget.type === 'area') {
			const area = zone.areas.find(a => a.id === (editModeTarget as any).areaId);
			if (area) {
				area.shape = editModeOriginalShapes.shape;
				for (const sSnap of editModeOriginalShapes.spots) {
					const spot = area.spots.find(s => s.id === sSnap.id);
					if (spot) spot.shape = sSnap.shape;
				}
			}
		} else {
			const area = zone.areas.find(a => a.id === (editModeTarget as any).areaId);
			const spot = area?.spots.find(s => s.id === (editModeTarget as any).spotId);
			if (spot) spot.shape = editModeOriginalShapes.shape;
		}

		venue = { ...venue };
		deselectEditModeItem();
		renderEditModeShapes();
	}

	function enterEditMode() {
		if (!editingTarget) return;
		const target = { ...editingTarget } as EditingTarget;
		const entity = (() => {
			const zone = venue.zones.find(z => z.id === target.zoneId);
			if (!zone) return undefined;
			if (target.type === 'zone') return zone;
			const area = zone.areas.find(a => a.id === (target as any).areaId);
			if (target.type === 'area') return area;
			return area?.spots.find(s => s.id === (target as any).spotId);
		})();
		if (!entity) return;

		editModeTarget = target;
		editMode = true;

		// Snapshot original shapes for reset
		editModeOriginalShapes = snapshotEditModeShapes(target);

		// Hide Geoman drawing controls (not useful in edit mode)
		map.pm.removeControls();

		// Initialize side panel state from entity
		panelName = entity.name;
		panelCategory = entity.category;
		panelFill = entity.style.fill;
		panelOpacity = entity.style.opacity ?? 0.85;
		panelStroke = entity.style.stroke ?? '#cbd5e1';
		panelStrokeWidth = entity.style.strokeWidth ?? 1;
		panelDescription = 'description' in entity ? (entity as Spot).description : '';

		// Deselect toolbar/zone editing
		deselectEntity();
		deselectZone();

		// Hide tiles and floor background (unless user toggled map on)
		if (!editModeShowMap) {
			tileLayerRef?.remove();
			floorBackgroundLayer?.remove();
		}

		// Clear all shape layers
		for (const sl of shapeLayers) {
			map.removeLayer(sl);
		}
		shapeLayers = [];

		// Render only the target entity
		renderEditModeShapes();

		// Restore saved overlay
		const savedOverlay = loadOverlay(venue.id);
		if (savedOverlay) {
			overlayImageUrl = savedOverlay.imageDataUrl;
			overlayOpacity = savedOverlay.opacity;
			overlayRotation = savedOverlay.rotation;
			addOverlayToMap(savedOverlay.bounds);
		}

		// Invalidate map size since the container changed, then fit
		setTimeout(() => {
			map?.invalidateSize();
			if (editModeLayer) {
				map.fitBounds(editModeLayer.getBounds().pad(0.2));
			}
		}, 50);
	}

	function selectEditModeItem(item: 'shape' | 'overlay') {
		if (editModeSelection === item) return;
		deselectEditModeItem();
		if (item === 'shape' && editModeLayer) {
			editModeLayer.pm.enable({ allowSelfIntersection: false });
			editModeLayer.setStyle({ weight: 3, dashArray: '6 4', color: '#facc15' });

			// Save after vertex edits
			editModeLayer.on('pm:edit', () => {
				const p = getShapeRotateHandlePos();
				if (p && shapeRotateMarker) shapeRotateMarker.setLatLng(p);
				repositionShapeEdgeMarkers();
				saveEditModeShapesToData();
			});

			setupShapeDragOnPath();
			createShapeRotateMarker();
			createShapeEdgeMarkers();
		} else if (item === 'overlay') {
			createOverlaySelectionRect();
			createOverlayCornerMarkers();
		}
		editModeSelection = item;
	}

	// ── Shape drag via direct DOM handler on SVG _path element ──
	// L.DomEvent.on(_path, 'mousedown') fires on the SVG <path> itself,
	// stopPropagation prevents it from reaching the <svg> container or
	// the map container, so map dragging never starts.
	// Vertex markers are separate SVG <circle> elements — not affected.

	function setupShapeDragOnPath() {
		if (!map || !editModeLayer) return;
		removeShapeDragHandlers();
		const L = (window as any).L;

		// _path may not be ready immediately after pm.enable(); wait for it
		const attachToPath = () => {
			const path = editModeLayer?._path;
			if (!path) return;

			let dragging = false;
			let startLatLng: any = null;
			let startLatlngs: any = null;
			let startChildLatlngs: any[] = [];

			const onPathDown = (e: any) => {
				if (!editModeLayer || editModeSelection !== 'shape') return;

				// Stop propagation at DOM level — prevents Leaflet SVG renderer
				// and map container from seeing this event, so map won't pan
				e.stopPropagation();
				e.preventDefault();

				// Also disable map dragging explicitly as a belt-and-suspenders approach
				map.dragging.disable();

				const touch = e.touches ? e.touches[0] : e;
				const container = map.getContainer();
				const containerRect = container.getBoundingClientRect();
				const containerPoint = L.point(touch.clientX - containerRect.left, touch.clientY - containerRect.top);
				const latlng = map.containerPointToLatLng(containerPoint);

				dragging = true;
				startLatLng = latlng;
				startLatlngs = JSON.parse(JSON.stringify(editModeLayer.getLatLngs()));
				startChildLatlngs = shapeLayers
					.filter((sl: any) => sl !== editModeLayer)
					.map((sl: any) => {
						if (typeof sl.getLatLngs === 'function') return { type: 'poly', data: JSON.parse(JSON.stringify(sl.getLatLngs())) };
						return { type: 'circle', data: JSON.parse(JSON.stringify(sl.getLatLng())) };
					});
				editModeLayer.pm.disable();
			};

			const onMouseMove = (e: any) => {
				if (!dragging || !startLatLng || !editModeLayer) return;
				const touch = e.touches ? e.touches[0] : e;
				if (!touch) return;
				const container = map.getContainer();
				const containerRect = container.getBoundingClientRect();
				const containerPoint = L.point(touch.clientX - containerRect.left, touch.clientY - containerRect.top);
				const currentLatLng = map.containerPointToLatLng(containerPoint);

				const dLat = currentLatLng.lat - startLatLng.lat;
				const dLng = currentLatLng.lng - startLatLng.lng;

				editModeLayer.setLatLngs(shiftLatlngs(startLatlngs, dLat, dLng));
				const childLayers = shapeLayers.filter((sl: any) => sl !== editModeLayer);
				for (let i = 0; i < childLayers.length && i < startChildLatlngs.length; i++) {
					const snap = startChildLatlngs[i];
					if (snap.type === 'circle') {
						childLayers[i].setLatLng(L.latLng(snap.data.lat + dLat, snap.data.lng + dLng));
					} else {
						childLayers[i].setLatLngs(shiftLatlngs(snap.data, dLat, dLng));
					}
				}
				const p = getShapeRotateHandlePos();
				if (p && shapeRotateMarker) shapeRotateMarker.setLatLng(p);
				repositionShapeEdgeMarkers();
			};

			const onMouseUp = () => {
				if (!dragging) return;
				dragging = false;
				startLatLng = null;
				startLatlngs = null;
				startChildLatlngs = [];

				// Re-enable map dragging
				map.dragging.enable();

				if (editModeLayer) {
					editModeLayer.pm.enable({ allowSelfIntersection: false });
					// Re-attach to possibly-new _path after pm.enable()
					requestAnimationFrame(() => setupShapeDragOnPath());
				}
				const p = getShapeRotateHandlePos();
				if (p && shapeRotateMarker) shapeRotateMarker.setLatLng(p);
				repositionShapeEdgeMarkers();
				saveEditModeShapesToData();
			};

			// Attach directly to the SVG <path> element
			path.addEventListener('mousedown', onPathDown, true);
			path.addEventListener('touchstart', onPathDown, true);
			window.addEventListener('mousemove', onMouseMove);
			window.addEventListener('mouseup', onMouseUp);
			window.addEventListener('touchmove', onMouseMove as any);
			window.addEventListener('touchend', onMouseUp);

			shapeDragHandlers = { path, pathHandler: onPathDown, mousemove: onMouseMove, mouseup: onMouseUp };
		};

		if (editModeLayer._path) {
			attachToPath();
		} else {
			// Wait for Leaflet to render the SVG path
			requestAnimationFrame(() => attachToPath());
		}
	}

	function removeShapeDragHandlers() {
		if (!shapeDragHandlers) return;
		const path = shapeDragHandlers.path;
		if (path && shapeDragHandlers.pathHandler) {
			path.removeEventListener('mousedown', shapeDragHandlers.pathHandler, true);
			path.removeEventListener('touchstart', shapeDragHandlers.pathHandler, true);
		}
		window.removeEventListener('mousemove', shapeDragHandlers.mousemove);
		window.removeEventListener('mouseup', shapeDragHandlers.mouseup);
		window.removeEventListener('touchmove', shapeDragHandlers.mousemove as any);
		window.removeEventListener('touchend', shapeDragHandlers.mouseup);
		shapeDragHandlers = null;
	}

	// ── Shape rotate marker + rotation via native DOM event on marker element ──

	function getShapeRotateHandlePos() {
		if (!editModeLayer || !map) return null;
		const L = (window as any).L;
		const bounds = editModeLayer.getBounds();
		const center = bounds.getCenter();
		const centerPt = map.latLngToContainerPoint(center);

		// For polygons: pin to the bottom edge and follow it during rotation
		if (typeof editModeLayer.getLatLngs === 'function') {
			const latlngs = editModeLayer.getLatLngs();
			const ring: any[] = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;

			if (ring && ring.length >= 2) {
				// Determine which edge is "bottom" on first call, then keep it pinned
				if (!shapeRotateEdgeIdx || shapeRotateEdgeIdx[0] >= ring.length) {
					let bestY = -Infinity;
					let bestEdge: [number, number] = [0, 1];
					for (let i = 0; i < ring.length; i++) {
						const j = (i + 1) % ring.length;
						const p1 = map.latLngToContainerPoint(ring[i]);
						const p2 = map.latLngToContainerPoint(ring[j]);
						const midY = (p1.y + p2.y) / 2;
						if (midY > bestY) {
							bestY = midY;
							bestEdge = [i, j];
						}
					}
					shapeRotateEdgeIdx = bestEdge;
				}

				const [ei, ej] = shapeRotateEdgeIdx;
				if (ei < ring.length && ej < ring.length) {
					const p1 = map.latLngToContainerPoint(ring[ei]);
					const p2 = map.latLngToContainerPoint(ring[ej]);
					const midPt = L.point((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
					const dx = midPt.x - centerPt.x;
					const dy = midPt.y - centerPt.y;
					const dist = Math.sqrt(dx * dx + dy * dy);
					if (dist > 0) {
						const offsetPt = L.point(midPt.x + (dx / dist) * 30, midPt.y + (dy / dist) * 30);
						return map.containerPointToLatLng(offsetPt);
					}
				}
			}
		}

		// Fallback for circles: bottom of bounds, offset 30px down
		const southPt = map.latLngToContainerPoint(L.latLng(bounds.getSouth(), center.lng));
		const offsetPt = L.point(southPt.x, southPt.y + 30);
		return map.containerPointToLatLng(offsetPt);
	}

	function createShapeRotateMarker() {
		if (!editModeLayer || !map) return;
		removeShapeRotateMarker();
		const L = (window as any).L;
		const pos = getShapeRotateHandlePos();
		if (!pos) return;

		const rotateIcon = L.divIcon({
			className: 'shape-rotate-handle',
			iconSize: [32, 32],
			iconAnchor: [16, 16]
		});
		shapeRotateMarker = L.marker(pos, {
			icon: rotateIcon,
			draggable: false,
			interactive: true,
			zIndexOffset: 10001
		}).addTo(map);

		let rotating = false;
		let startLatlngs: any = null;
		let startChildLatlngs: any[] = [];
		let centerPt: any = null;
		let baseAngle = 0;

		const onRotateDown = (e: any) => {
			if (!editModeLayer) return;
			e.stopPropagation();
			e.preventDefault();
			map.dragging.disable();

			rotating = true;
			const bounds = editModeLayer.getBounds();
			centerPt = map.latLngToContainerPoint(bounds.getCenter());

			startLatlngs = JSON.parse(JSON.stringify(editModeLayer.getLatLngs()));
			startChildLatlngs = shapeLayers
				.filter((sl: any) => sl !== editModeLayer)
				.map((sl: any) => {
					if (typeof sl.getLatLngs === 'function') return { type: 'poly', data: JSON.parse(JSON.stringify(sl.getLatLngs())) };
					return { type: 'circle', data: JSON.parse(JSON.stringify(sl.getLatLng())) };
				});

			const touch = e.touches ? e.touches[0] : e;
			const container = map.getContainer();
			const containerRect = container.getBoundingClientRect();
			const mx = touch.clientX - containerRect.left;
			const my = touch.clientY - containerRect.top;
			baseAngle = Math.atan2(mx - centerPt.x, -(my - centerPt.y));

			editModeLayer.pm.disable();
		};

		const onMouseMove = (e: any) => {
			if (!rotating || !startLatlngs || !centerPt || !editModeLayer) return;
			const touch = e.touches ? e.touches[0] : e;
			if (!touch) return;
			const container = map.getContainer();
			const containerRect = container.getBoundingClientRect();
			const mx = touch.clientX - containerRect.left;
			const my = touch.clientY - containerRect.top;
			const curAngle = Math.atan2(mx - centerPt.x, -(my - centerPt.y));
			const da = curAngle - baseAngle;

			const rot = (lat: number, lng: number) => {
				const pt = map.latLngToContainerPoint(L.latLng(lat, lng));
				const dx = pt.x - centerPt.x, dy = pt.y - centerPt.y;
				return map.containerPointToLatLng(L.point(
					centerPt.x + dx * Math.cos(da) - dy * Math.sin(da),
					centerPt.y + dx * Math.sin(da) + dy * Math.cos(da)
				));
			};
			const rotArr = (arr: any[]): any[] =>
				arr.map((v: any) => Array.isArray(v) ? rotArr(v) : rot(v.lat, v.lng));

			editModeLayer.setLatLngs(rotArr(startLatlngs));
			const childLayers = shapeLayers.filter((sl: any) => sl !== editModeLayer);
			for (let i = 0; i < childLayers.length && i < startChildLatlngs.length; i++) {
				const snap = startChildLatlngs[i];
				if (snap.type === 'circle') {
					const rc = rot(snap.data.lat, snap.data.lng);
					childLayers[i].setLatLng(rc);
				} else {
					childLayers[i].setLatLngs(rotArr(snap.data));
				}
			}
			const p = getShapeRotateHandlePos();
			if (p && shapeRotateMarker) shapeRotateMarker.setLatLng(p);
			repositionShapeEdgeMarkers();
		};

		const onMouseUp = () => {
			if (!rotating) return;
			rotating = false;
			map.dragging.enable();

			if (!editModeLayer) return;

			// Convert Rectangles to Polygons so vertex editing doesn't snap to axis-aligned
			if (editModeLayer instanceof L.Rectangle) {
				const ll = editModeLayer.getLatLngs()[0];
				const opts = editModeLayer.options;
				const tt = editModeLayer.getTooltip();
				const ttContent = tt?.getContent();
				const ttOpts = tt?.options;
				map.removeLayer(editModeLayer);
				shapeLayers = shapeLayers.filter((sl: any) => sl !== editModeLayer);
				const poly = L.polygon(ll, { color: opts.color, weight: opts.weight, fillColor: opts.fillColor, fillOpacity: opts.fillOpacity, opacity: opts.opacity, dashArray: opts.dashArray }).addTo(map);
				if (ttContent && ttOpts) poly.bindTooltip(ttContent, ttOpts);
				poly.on('click', () => { zoneClickedFlag = true; setTimeout(() => zoneClickedFlag = false, 0); selectEditModeItem('shape'); });
				shapeLayers.unshift(poly);
				editModeLayer = poly;
			}
			for (let i = 0; i < shapeLayers.length; i++) {
				const sl = shapeLayers[i];
				if (sl === editModeLayer || !(sl instanceof L.Rectangle)) continue;
				const cll = sl.getLatLngs()[0];
				const co = sl.options;
				const ct = sl.getTooltip();
				map.removeLayer(sl);
				const cp = L.polygon(cll, { color: co.color, weight: co.weight, fillColor: co.fillColor, fillOpacity: co.fillOpacity, opacity: co.opacity }).addTo(map);
				if (ct) cp.bindTooltip(ct.getContent(), ct.options);
				shapeLayers[i] = cp;
			}

			editModeLayer.pm.enable({ allowSelfIntersection: false });
			// Re-attach shape drag handler since _path may have changed
			requestAnimationFrame(() => setupShapeDragOnPath());
			const p = getShapeRotateHandlePos();
			if (p && shapeRotateMarker) shapeRotateMarker.setLatLng(p);
			// Recreate edge markers since shape may have changed type
			createShapeEdgeMarkers();
			saveEditModeShapesToData();
			startLatlngs = null; startChildLatlngs = []; centerPt = null;
		};

		// Attach to the marker's actual DOM element for reliable event interception
		const markerEl = shapeRotateMarker.getElement();
		if (markerEl) {
			markerEl.addEventListener('mousedown', onRotateDown, true);
			markerEl.addEventListener('touchstart', onRotateDown, true);
		}

		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
		window.addEventListener('touchmove', onMouseMove as any);
		window.addEventListener('touchend', onMouseUp);

		// Store for cleanup
		(shapeRotateMarker as any)._rotateCleanup = () => {
			if (markerEl) {
				markerEl.removeEventListener('mousedown', onRotateDown, true);
				markerEl.removeEventListener('touchstart', onRotateDown, true);
			}
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
			window.removeEventListener('touchmove', onMouseMove as any);
			window.removeEventListener('touchend', onMouseUp);
		};
	}

	function shiftLatlngs(arr: any[], dLat: number, dLng: number): any[] {
		const L = (window as any).L;
		return arr.map((v: any) => {
			if (Array.isArray(v)) return shiftLatlngs(v, dLat, dLng);
			return L.latLng(v.lat + dLat, v.lng + dLng);
		});
	}

	function saveEditModeShapesToData() {
		if (!editModeTarget || !editModeLayer) return;
		const converter = getGeoConverter();
		const entity = getEditModeEntity();
		if (!entity) return;
		let ns = layerToShapeDef(editModeLayer);
		if (converter) ns = converter.shapeToPixel(ns);
		entity.shape = ns;
		const childLayers = shapeLayers.filter((sl: any) => sl !== editModeLayer);
		if (editModeTarget.type === 'zone') {
			const zone = venue.zones.find(z => z.id === editModeTarget!.zoneId);
			if (zone) {
				let ci = 0;
				for (const a of zone.areas) {
					if (ci < childLayers.length) { let s = layerToShapeDef(childLayers[ci]); if (converter) s = converter.shapeToPixel(s); a.shape = s; ci++; }
					for (const sp of a.spots) { if (ci < childLayers.length) { let s = layerToShapeDef(childLayers[ci]); if (converter) s = converter.shapeToPixel(s); sp.shape = s; ci++; } }
				}
			}
		} else if (editModeTarget.type === 'area') {
			const zone = venue.zones.find(z => z.id === editModeTarget!.zoneId);
			const area = zone?.areas.find(a => a.id === (editModeTarget as any).areaId);
			if (area) {
				let ci = 0;
				for (const sp of area.spots) { if (ci < childLayers.length) { let s = layerToShapeDef(childLayers[ci]); if (converter) s = converter.shapeToPixel(s); sp.shape = s; ci++; } }
			}
		}
		venue = { ...venue };
	}

	function removeShapeRotateMarker() {
		shapeRotateEdgeIdx = null;
		if (shapeRotateMarker && map) {
			if ((shapeRotateMarker as any)._rotateCleanup) {
				(shapeRotateMarker as any)._rotateCleanup();
			}
			map.removeLayer(shapeRotateMarker);
			shapeRotateMarker = null;
		}
	}

	// ── Shape edge midpoint drag handles ──

	function getShapeEdgeMidpoints(): any[] | null {
		if (!editModeLayer || !map) return null;
		const L = (window as any).L;
		const latlngs = editModeLayer.getLatLngs?.();
		if (!latlngs) return null;
		const ring: any[] = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
		if (ring.length !== 4) return null; // only for rectangular (4-vertex) shapes
		const midpoints = [];
		for (let i = 0; i < 4; i++) {
			const j = (i + 1) % 4;
			const pa = map.latLngToContainerPoint(ring[i]);
			const pb = map.latLngToContainerPoint(ring[j]);
			midpoints.push(map.containerPointToLatLng(L.point((pa.x + pb.x) / 2, (pa.y + pb.y) / 2)));
		}
		return midpoints;
	}

	function getShapeEdgeAngle(edgeIndex: number): number {
		if (!editModeLayer || !map) return 0;
		const latlngs = editModeLayer.getLatLngs?.();
		if (!latlngs) return 0;
		const ring: any[] = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
		if (ring.length !== 4) return 0;
		const i = edgeIndex;
		const j = (i + 1) % 4;
		const pa = map.latLngToContainerPoint(ring[i]);
		const pb = map.latLngToContainerPoint(ring[j]);
		return Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180 / Math.PI;
	}

	function createShapeEdgeMarkers() {
		if (!editModeLayer || !map) return;
		removeShapeEdgeMarkers();
		const L = (window as any).L;
		const midpoints = getShapeEdgeMidpoints();
		if (!midpoints) return;

		for (let i = 0; i < 4; i++) {
			const angle = getShapeEdgeAngle(i);
			// Determine orientation based on edge angle
			const absAngle = Math.abs(angle % 180);
			const isHorizontalish = absAngle < 45 || absAngle > 135;
			const w = isHorizontalish ? 30 : 8;
			const h = isHorizontalish ? 8 : 30;
			const icon = L.divIcon({
				className: 'shape-edge-handle',
				iconSize: [w, h],
				iconAnchor: [w / 2, h / 2]
			});
			const marker = L.marker(midpoints[i], {
				icon,
				draggable: true,
				zIndexOffset: 10000
			}).addTo(map);

			const el = marker.getElement();
			if (el) el.style.transform += ` rotate(${angle}deg)`;

			marker.on('drag', () => handleShapeEdgeDrag(i, marker.getLatLng()));
			marker.on('dragend', () => handleShapeEdgeDragEnd());
			shapeEdgeMarkers.push(marker);
		}
	}

	function repositionShapeEdgeMarkers() {
		const midpoints = getShapeEdgeMidpoints();
		if (!midpoints) return;
		for (let i = 0; i < shapeEdgeMarkers.length && i < midpoints.length; i++) {
			shapeEdgeMarkers[i].setLatLng(midpoints[i]);
		}
	}

	function handleShapeEdgeDrag(edgeIndex: number, newLatLng: any) {
		if (!editModeLayer || !map) return;
		const L = (window as any).L;
		const latlngs = editModeLayer.getLatLngs?.();
		if (!latlngs) return;
		const ring: any[] = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
		if (ring.length !== 4) return;

		// The dragged edge is between vertices edgeIndex and (edgeIndex+1)%4
		const i0 = edgeIndex;
		const i1 = (edgeIndex + 1) % 4;

		// Calculate the perpendicular direction to this edge
		const p0 = map.latLngToContainerPoint(ring[i0]);
		const p1 = map.latLngToContainerPoint(ring[i1]);
		const edgeDx = p1.x - p0.x;
		const edgeDy = p1.y - p0.y;
		const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
		if (edgeLen === 0) return;

		// Perpendicular unit vector (pointing "outward")
		const perpX = -edgeDy / edgeLen;
		const perpY = edgeDx / edgeLen;

		// Current edge midpoint
		const midX = (p0.x + p1.x) / 2;
		const midY = (p0.y + p1.y) / 2;

		// Drag point in container coords
		const dragPt = map.latLngToContainerPoint(newLatLng);
		const dx = dragPt.x - midX;
		const dy = dragPt.y - midY;

		// Project delta onto perpendicular
		const proj = dx * perpX + dy * perpY;

		// Move both vertices of this edge by the projected amount along perpendicular
		const newRing = ring.map((ll: any, idx: number) => {
			if (idx === i0 || idx === i1) {
				const pt = map.latLngToContainerPoint(ll);
				return map.containerPointToLatLng(L.point(
					pt.x + proj * perpX,
					pt.y + proj * perpY
				));
			}
			return ll;
		});

		editModeLayer.setLatLngs([newRing]);

		// Disable pm during drag to avoid interference
		editModeLayer.pm.disable();

		repositionShapeEdgeMarkers();
		const p = getShapeRotateHandlePos();
		if (p && shapeRotateMarker) shapeRotateMarker.setLatLng(p);
	}

	function handleShapeEdgeDragEnd() {
		if (!editModeLayer) return;
		editModeLayer.pm.enable({ allowSelfIntersection: false });
		requestAnimationFrame(() => setupShapeDragOnPath());
		repositionShapeEdgeMarkers();
		const p = getShapeRotateHandlePos();
		if (p && shapeRotateMarker) shapeRotateMarker.setLatLng(p);
		saveEditModeShapesToData();
	}

	function removeShapeEdgeMarkers() {
		for (const marker of shapeEdgeMarkers) {
			if (map) map.removeLayer(marker);
		}
		shapeEdgeMarkers = [];
	}

	function deselectEditModeItem() {
		if (editModeSelection === 'shape' && editModeLayer) {
			editModeLayer.off('pm:edit');
			editModeLayer.pm.disable();
			removeShapeDragHandlers();
			removeShapeRotateMarker();
			removeShapeEdgeMarkers();
			const entity = getEditModeEntity();
			if (entity) {
				editModeLayer.setStyle({
					color: entity.style.stroke ?? '#cbd5e1',
					weight: entity.style.strokeWidth ?? 1,
					dashArray: ''
				});
			}
		} else if (editModeSelection === 'overlay') {
			removeOverlayCornerMarkers();
			removeOverlaySelectionRect();
			removeOverlayDragHandlers();
		}
		editModeSelection = null;
	}

	function renderEditModeShapes() {
		if (!map || !editModeTarget) return;
		const L = (window as any).L;
		const converter = getGeoConverter();
		const zone = venue.zones.find(z => z.id === editModeTarget.zoneId);
		if (!zone) return;

		// Clear existing
		for (const sl of shapeLayers) {
			map.removeLayer(sl);
		}
		shapeLayers = [];
		editModeLayer = null;

		if (editModeTarget.type === 'zone') {
			// Editing a zone: show zone + all its areas + spots
			const zoneLayer = shapeDefToLayer(zone.shape, zone.style, zone.name, 'zone', converter);
			if (zoneLayer) {
				zoneLayer.addTo(map);
				shapeLayers.push(zoneLayer);
				editModeLayer = zoneLayer;
				zoneLayer.on('click', () => {
					zoneClickedFlag = true;
					setTimeout(() => zoneClickedFlag = false, 0);
					selectEditModeItem('shape');
				});
			}
			for (const area of zone.areas) {
				const areaLayer = shapeDefToLayer(area.shape, area.style, area.name, 'area', converter);
				if (areaLayer) { areaLayer.addTo(map); shapeLayers.push(areaLayer); }
				for (const spot of area.spots) {
					const spotLayer = shapeDefToLayer(spot.shape, spot.style, spot.name, 'spot', converter);
					if (spotLayer) { spotLayer.addTo(map); shapeLayers.push(spotLayer); }
				}
			}
		} else if (editModeTarget.type === 'area') {
			// Editing an area: show only the area + its spots
			const area = zone.areas.find(a => a.id === (editModeTarget as any).areaId);
			if (!area) return;
			const areaLayer = shapeDefToLayer(area.shape, area.style, area.name, 'area', converter);
			if (areaLayer) {
				areaLayer.addTo(map);
				shapeLayers.push(areaLayer);
				editModeLayer = areaLayer;
				areaLayer.on('click', () => {
					zoneClickedFlag = true;
					setTimeout(() => zoneClickedFlag = false, 0);
					selectEditModeItem('shape');
				});
			}
			for (const spot of area.spots) {
				const spotLayer = shapeDefToLayer(spot.shape, spot.style, spot.name, 'spot', converter);
				if (spotLayer) { spotLayer.addTo(map); shapeLayers.push(spotLayer); }
			}
		} else if (editModeTarget.type === 'spot') {
			// Editing a spot: show only the spot with vertex editing
			const area = zone.areas.find(a => a.id === (editModeTarget as any).areaId);
			if (!area) return;
			const spot = area.spots.find(s => s.id === (editModeTarget as any).spotId);
			if (!spot) return;
			const spotLayer = shapeDefToLayer(spot.shape, spot.style, spot.name, 'spot', converter);
			if (spotLayer) {
				spotLayer.addTo(map);
				shapeLayers.push(spotLayer);
				editModeLayer = spotLayer;
				spotLayer.on('click', () => {
					zoneClickedFlag = true;
					setTimeout(() => zoneClickedFlag = false, 0);
					selectEditModeItem('shape');
				});
			}
		}
	}

	function exitEditMode() {
		if (!editMode) return;

		// Cancel any active redraw first
		if (redrawActive) cancelRedraw();

		// Deselect any active edit-mode selection (disables pm / removes overlay handles)
		deselectEditModeItem();

		// Capture final shape from layer geometry
		if (editModeLayer && editModeTarget) {
			let newShape = layerToShapeDef(editModeLayer);
			const converter = getGeoConverter();
			if (converter) newShape = converter.shapeToPixel(newShape);
			const entity = getEditModeEntity();
			if (entity) {
				entity.shape = newShape;
			}
		}

		// Remove image overlay from map (but keep persisted data)
		if (editModeSelection === 'overlay') editModeSelection = null;
		removeOverlayFromMap();
		overlayImageUrl = '';
		overlayOpacity = 0.5;
		overlayRotation = 0;

		editMode = false;
		editModeTarget = null;
		editModeLayer = null;
		editModeOriginalShapes = null;

		// Re-add tile layer and floor background
		if (tileLayerRef && map) tileLayerRef.addTo(map);
		if (floorBackgroundLayer && map) floorBackgroundLayer.addTo(map);

		venue = { ...venue };
		renderExistingShapes();

		// Re-enable Geoman without toolbar UI
		map.pm.addControls({
			position: 'bottomright',
			drawCircleMarker: false,
			drawMarker: false,
			drawPolyline: false,
			drawText: false,
			cutPolygon: false,
			rotateMode: false
		});
		map.pm.removeControls();

		// Invalidate map size since the container changed back, then fit to venue bounds
		setTimeout(() => {
			if (!map) return;
			map.invalidateSize();
			const L = (window as any).L;
			const converter = getGeoConverter();
			if (converter && venue.geoBounds) {
				const geoBounds = L.latLngBounds(
					[venue.geoBounds.sw[0], venue.geoBounds.sw[1]],
					[venue.geoBounds.ne[0], venue.geoBounds.ne[1]]
				);
				map.fitBounds(geoBounds);
			} else {
				map.fitBounds([[0, 0], [venue.height, venue.width]]);
			}
		}, 50);
	}

	// Side panel handlers (work for both zone and area editing)
	function panelUpdateName() {
		const entity = getEditModeEntity();
		if (entity && panelName.trim()) {
			entity.name = panelName.trim();
			venue = { ...venue };
			if (editModeLayer) {
				const level = editModeTarget?.type ?? 'zone';
				const cls = `label-${level}`;
				editModeLayer.unbindTooltip();
				editModeLayer.bindTooltip(entity.name, { permanent: true, direction: 'right', className: cls });
			}
		}
	}

	function panelUpdateCategory(cat: POICategory) {
		const entity = getEditModeEntity();
		if (entity) {
			const level = editModeTarget?.type ?? 'zone';
			panelCategory = cat;
			entity.category = cat;
			entity.style = defaultStyle(level, cat);
			panelFill = entity.style.fill;
			panelOpacity = entity.style.opacity ?? 0.85;
			panelStroke = entity.style.stroke ?? '#cbd5e1';
			panelStrokeWidth = entity.style.strokeWidth ?? 1;
			venue = { ...venue };
			if (editModeLayer) {
				editModeLayer.setStyle({
					fillColor: entity.style.fill,
					fillOpacity: entity.style.opacity ?? 0.6,
					color: entity.style.stroke ?? '#cbd5e1',
					weight: entity.style.strokeWidth ?? 1
				});
			}
		}
	}

	function panelApplyStyle() {
		const entity = getEditModeEntity();
		if (entity && editModeLayer) {
			entity.style.fill = panelFill;
			entity.style.opacity = panelOpacity;
			entity.style.stroke = panelStroke;
			entity.style.strokeWidth = panelStrokeWidth;
			editModeLayer.setStyle({
				fillColor: panelFill,
				fillOpacity: panelOpacity,
				color: panelStroke,
				weight: panelStrokeWidth
			});
			venue = { ...venue };
		}
	}

	function panelUpdateDescription() {
		const entity = getEditModeEntity();
		if (entity && 'description' in entity) {
			(entity as Spot).description = panelDescription;
			venue = { ...venue };
		}
	}

	function toggleEditModeMap() {
		editModeShowMap = !editModeShowMap;
		localStorage.setItem('mapEditor:showMap', String(editModeShowMap));
		if (!editMode || !map) return;
		if (editModeShowMap) {
			tileLayerRef?.addTo(map);
			floorBackgroundLayer?.addTo(map);
			for (const sl of shapeLayers) sl.bringToFront();
		} else {
			tileLayerRef?.remove();
			floorBackgroundLayer?.remove();
		}
	}

	function startRedraw() {
		if (!editModeLayer || !map) return;
		const entity = getEditModeEntity();
		if (!entity) return;

		// Deselect current edit-mode selection (disables pm / removes overlay handles)
		deselectEditModeItem();

		// Hide the current layer and close its tooltip
		editModeLayer.setStyle({ opacity: 0, fillOpacity: 0 });
		if (editModeLayer.getTooltip()) editModeLayer.closeTooltip();

		// Stash reference
		redrawOriginalLayer = editModeLayer;

		// Hide Geoman controls
		map.pm.removeControls();

		// Start polygon drawing with matching style
		map.pm.enableDraw('Polygon', {
			pathOptions: {
				color: entity.style.stroke ?? '#cbd5e1',
				weight: entity.style.strokeWidth ?? 1,
				fillColor: entity.style.fill,
				fillOpacity: entity.style.opacity ?? 0.6
			}
		});

		redrawActive = true;
	}

	function cancelRedraw() {
		if (!map) return;

		// Stop drawing
		map.pm.disableDraw();

		// Restore original layer visibility
		if (redrawOriginalLayer) {
			const entity = getEditModeEntity();
			if (entity) {
				redrawOriginalLayer.setStyle({
					fillColor: entity.style.fill,
					fillOpacity: entity.style.opacity ?? 0.6,
					color: entity.style.stroke ?? '#cbd5e1',
					weight: entity.style.strokeWidth ?? 1
				});
			}
			if (redrawOriginalLayer.getTooltip()) redrawOriginalLayer.openTooltip();
		}

		redrawActive = false;
		redrawOriginalLayer = null;

		// Re-select shape so vertex editing is restored
		editModeSelection = null;
		selectEditModeItem('shape');
	}

	function completeRedraw(newLayer: any) {
		if (!map || !editModeTarget) return;

		// Extract shape from the newly drawn layer
		let newShape = layerToShapeDef(newLayer);
		const converter = getGeoConverter();
		if (converter) newShape = converter.shapeToPixel(newShape);

		// Update entity shape in data model
		const entity = getEditModeEntity();
		if (entity) {
			entity.shape = newShape;
			venue = { ...venue };
		}

		// Remove the temporary drawn layer from map
		map.removeLayer(newLayer);

		// Remove old hidden layer from map + shapeLayers
		if (redrawOriginalLayer) {
			map.removeLayer(redrawOriginalLayer);
			shapeLayers = shapeLayers.filter(l => l !== redrawOriginalLayer);
		}

		redrawActive = false;
		redrawOriginalLayer = null;

		// Rebuild with new shape (re-enables vertex editing)
		renderEditModeShapes();

		// Fit bounds to new shape
		setTimeout(() => {
			if (editModeLayer) {
				map.fitBounds(editModeLayer.getBounds().pad(0.2));
			}
		}, 50);
	}

	function handleOverlayFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			overlayImageUrl = reader.result as string;
			addOverlayToMap();
			persistOverlay();
		};
		reader.readAsDataURL(file);
	}

	function addOverlayToMap(savedBounds?: [[number, number], [number, number]]) {
		if (!map || !overlayImageUrl) return;
		removeOverlayFromMap();

		const L = (window as any).L;
		let bounds: any;

		if (savedBounds) {
			bounds = L.latLngBounds(savedBounds[0], savedBounds[1]);
		} else {
			const converter = getGeoConverter();
			if (converter && venue.geoBounds) {
				bounds = L.latLngBounds(
					[venue.geoBounds.sw[0], venue.geoBounds.sw[1]],
					[venue.geoBounds.ne[0], venue.geoBounds.ne[1]]
				);
			} else {
				bounds = [[0, 0], [venue.height, venue.width]];
			}
		}

		overlayLayer = L.imageOverlay(overlayImageUrl, bounds, {
			opacity: overlayOpacity,
			interactive: false
		}).addTo(map);

		// Keep overlay behind shape layers
		overlayLayer.bringToBack();

		setTimeout(() => {
			hookOverlayRotation();
		}, 50);
	}

	function updateOverlayOpacity() {
		if (overlayLayer) {
			overlayLayer.setOpacity(overlayOpacity);
			persistOverlay();
		}
	}

	function removeOverlayFromMap() {
		removeOverlayDragHandlers();
		removeOverlayCornerMarkers();
		removeOverlaySelectionRect();
		if (overlayLayer && map) {
			map.removeLayer(overlayLayer);
			overlayLayer = null;
		}
	}

	function clearOverlay() {
		if (editModeSelection === 'overlay') editModeSelection = null;
		removeOverlayFromMap();
		if (overlayImageUrl.startsWith('blob:')) {
			URL.revokeObjectURL(overlayImageUrl);
		}
		overlayImageUrl = '';
		overlayOpacity = 0.5;
		overlayRotation = 0;
		clearOverlayStorage(venue.id);
	}

	function persistOverlay() {
		if (!overlayImageUrl || !overlayLayer) return;
		const bounds = overlayLayer.getBounds();
		saveOverlay(venue.id, {
			imageDataUrl: overlayImageUrl,
			opacity: overlayOpacity,
			rotation: overlayRotation,
			bounds: [
				[bounds.getSouth(), bounds.getWest()],
				[bounds.getNorth(), bounds.getEast()]
			]
		});
	}

	function getRotatedOverlayCorners(): any[] {
		if (!overlayLayer || !map) return [];
		const L = (window as any).L;
		const bounds = overlayLayer.getBounds();
		const center = bounds.getCenter();
		const centerPt = map.latLngToContainerPoint(center);
		const corners = [
			bounds.getSouthWest(), bounds.getSouthEast(),
			bounds.getNorthEast(), bounds.getNorthWest()
		];
		const rad = overlayRotation * Math.PI / 180;
		return corners.map((c: any) => {
			const pt = map.latLngToContainerPoint(c);
			const dx = pt.x - centerPt.x;
			const dy = pt.y - centerPt.y;
			const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
			const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
			return map.containerPointToLatLng(
				L.point(centerPt.x + rx, centerPt.y + ry)
			);
		});
	}

	function getOverlayRotateHandlePos() {
		if (!overlayLayer || !map) return null;
		const L = (window as any).L;
		const rotatedCorners = getRotatedOverlayCorners();
		if (rotatedCorners.length < 4) return null;
		// Bottom edge midpoint: average of SW (index 0) and SE (index 1)
		const sw = rotatedCorners[0];
		const se = rotatedCorners[1];
		const swPt = map.latLngToContainerPoint(sw);
		const sePt = map.latLngToContainerPoint(se);
		const midPt = L.point((swPt.x + sePt.x) / 2, (swPt.y + sePt.y) / 2);
		const bounds = overlayLayer.getBounds();
		const center = bounds.getCenter();
		const centerPt = map.latLngToContainerPoint(center);
		// Offset 30px outward from center through the bottom edge midpoint
		const dx = midPt.x - centerPt.x;
		const dy = midPt.y - centerPt.y;
		const dist = Math.sqrt(dx * dx + dy * dy);
		if (dist === 0) return null;
		const offsetPoint = L.point(midPt.x + (dx / dist) * 30, midPt.y + (dy / dist) * 30);
		return map.containerPointToLatLng(offsetPoint);
	}

	function createOverlaySelectionRect() {
		if (!overlayLayer || !map) return;
		removeOverlaySelectionRect();
		const L = (window as any).L;
		const corners = getRotatedOverlayCorners();
		if (corners.length < 4) return;
		overlaySelectionRect = L.polygon(corners, {
			weight: 2,
			dashArray: '6 4',
			color: '#facc15',
			fill: false,
			interactive: false
		}).addTo(map);
	}

	function updateOverlaySelectionRect() {
		if (!overlaySelectionRect) return;
		const corners = getRotatedOverlayCorners();
		if (corners.length < 4) return;
		overlaySelectionRect.setLatLngs(corners);
	}

	function removeOverlaySelectionRect() {
		if (overlaySelectionRect && map) {
			map.removeLayer(overlaySelectionRect);
			overlaySelectionRect = null;
		}
	}

	function createOverlayCornerMarkers() {
		if (!overlayLayer || !map) return;
		removeOverlayCornerMarkers();
		const L = (window as any).L;
		const corners = getRotatedOverlayCorners();
		if (corners.length < 4) return;

		for (let i = 0; i < 4; i++) {
			const icon = L.divIcon({
				className: 'overlay-corner-handle',
				iconSize: [14, 14],
				iconAnchor: [7, 7]
			});
			const marker = L.marker(corners[i], {
				icon,
				draggable: true,
				zIndexOffset: 10000
			}).addTo(map);

			marker.on('drag', () => handleCornerDrag(i, marker.getLatLng()));
			marker.on('dragend', () => handleCornerDragEnd());
			overlayCornerMarkers.push(marker);
		}

		// Edge midpoint handles
		createOverlayEdgeMarkers();

		// Rotation handle — offset from bottom edge
		const rotatePos = getOverlayRotateHandlePos();
		if (rotatePos) {
			const rotateIcon = L.divIcon({
				className: 'shape-rotate-handle',
				iconSize: [32, 32],
				iconAnchor: [16, 16]
			});
			overlayRotateMarker = L.marker(rotatePos, {
				icon: rotateIcon,
				draggable: false,
				interactive: true,
				zIndexOffset: 10001
			}).addTo(map);

			setupOverlayRotateHandler();
		}

		// Set up drag handlers for the overlay body
		setupOverlayDragHandlers();
	}

	function handleCornerDrag(cornerIndex: number, newLatLng: any) {
		if (!overlayLayer || !map) return;
		const L = (window as any).L;
		const bounds = overlayLayer.getBounds();
		const center = bounds.getCenter();
		const centerPt = map.latLngToContainerPoint(center);

		// Inverse-rotate the dragged point back to axis-aligned space
		const rad = -overlayRotation * Math.PI / 180;
		const dragPt = map.latLngToContainerPoint(newLatLng);
		const dx = dragPt.x - centerPt.x;
		const dy = dragPt.y - centerPt.y;
		const urx = dx * Math.cos(rad) - dy * Math.sin(rad);
		const ury = dx * Math.sin(rad) + dy * Math.cos(rad);
		const unrotatedPt = L.point(centerPt.x + urx, centerPt.y + ury);
		const unrotatedLatLng = map.containerPointToLatLng(unrotatedPt);

		let south = bounds.getSouth();
		let west = bounds.getWest();
		let north = bounds.getNorth();
		let east = bounds.getEast();

		switch (cornerIndex) {
			case 0: south = unrotatedLatLng.lat; west = unrotatedLatLng.lng; break;
			case 1: south = unrotatedLatLng.lat; east = unrotatedLatLng.lng; break;
			case 2: north = unrotatedLatLng.lat; east = unrotatedLatLng.lng; break;
			case 3: north = unrotatedLatLng.lat; west = unrotatedLatLng.lng; break;
		}

		if (south >= north || west >= east) return;

		const newBounds = L.latLngBounds([south, west], [north, east]);
		overlayLayer.setBounds(newBounds);
		applyOverlayRotation();

		// Reposition all corner markers at new rotated positions
		const updatedCorners = getRotatedOverlayCorners();
		for (let i = 0; i < 4; i++) {
			if (overlayCornerMarkers[i]) {
				overlayCornerMarkers[i].setLatLng(updatedCorners[i]);
			}
		}
		repositionOverlayEdgeMarkers();
		// Reposition rotation handle during resize
		if (overlayRotateMarker) {
			const pos = getOverlayRotateHandlePos();
			if (pos) overlayRotateMarker.setLatLng(pos);
		}
		updateOverlaySelectionRect();
	}

	function handleCornerDragEnd() {
		applyOverlayRotation();
		// Reposition all corner markers at rotated positions
		const updatedCorners = getRotatedOverlayCorners();
		for (let i = 0; i < 4; i++) {
			if (overlayCornerMarkers[i]) {
				overlayCornerMarkers[i].setLatLng(updatedCorners[i]);
			}
		}
		repositionOverlayEdgeMarkers();
		// Reposition rotation handle after resize
		if (overlayRotateMarker) {
			const pos = getOverlayRotateHandlePos();
			if (pos) overlayRotateMarker.setLatLng(pos);
		}
		updateOverlaySelectionRect();
		persistOverlay();
	}

	function setupOverlayRotateHandler() {
		if (!overlayRotateMarker || !map || !overlayLayer) return;
		const L = (window as any).L;

		let rotating = false;
		let centerPt: any = null;

		const onRotateDown = (e: any) => {
			if (!overlayLayer || editModeSelection !== 'overlay') return;
			e.stopPropagation();
			e.preventDefault();
			map.dragging.disable();
			rotating = true;

			const bounds = overlayLayer.getBounds();
			centerPt = map.latLngToContainerPoint(bounds.getCenter());
		};

		const onMouseMove = (e: any) => {
			if (!rotating || !centerPt || !overlayLayer) return;
			const touch = e.touches ? e.touches[0] : e;
			if (!touch) return;
			const container = map.getContainer();
			const containerRect = container.getBoundingClientRect();
			const mx = touch.clientX - containerRect.left;
			const my = touch.clientY - containerRect.top;

			const dx = mx - centerPt.x;
			const dy = my - centerPt.y;
			let angle = Math.atan2(dx, -dy) * (180 / Math.PI);
			if (angle < 0) angle += 360;
			overlayRotation = Math.round(angle);
			applyOverlayRotation();

			// Reposition corner markers at new rotated positions
			const updatedCorners = getRotatedOverlayCorners();
			for (let i = 0; i < 4; i++) {
				if (overlayCornerMarkers[i]) {
					overlayCornerMarkers[i].setLatLng(updatedCorners[i]);
				}
			}
			repositionOverlayEdgeMarkers();
			// Reposition rotate handle at bottom edge
			const pos = getOverlayRotateHandlePos();
			if (pos && overlayRotateMarker) overlayRotateMarker.setLatLng(pos);
			updateOverlaySelectionRect();
		};

		const onMouseUp = () => {
			if (!rotating) return;
			rotating = false;
			centerPt = null;
			map.dragging.enable();
			persistOverlay();
		};

		const markerEl = overlayRotateMarker.getElement();
		if (markerEl) {
			markerEl.addEventListener('mousedown', onRotateDown, true);
			markerEl.addEventListener('touchstart', onRotateDown, true);
		}
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
		window.addEventListener('touchmove', onMouseMove as any);
		window.addEventListener('touchend', onMouseUp);

		(overlayRotateMarker as any)._rotateCleanup = () => {
			if (markerEl) {
				markerEl.removeEventListener('mousedown', onRotateDown, true);
				markerEl.removeEventListener('touchstart', onRotateDown, true);
			}
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
			window.removeEventListener('touchmove', onMouseMove as any);
			window.removeEventListener('touchend', onMouseUp);
		};
	}

	function removeOverlayCornerMarkers() {
		for (const marker of overlayCornerMarkers) {
			if (map) map.removeLayer(marker);
		}
		overlayCornerMarkers = [];
		if (overlayRotateMarker && map) {
			if ((overlayRotateMarker as any)._rotateCleanup) {
				(overlayRotateMarker as any)._rotateCleanup();
			}
			map.removeLayer(overlayRotateMarker);
			overlayRotateMarker = null;
		}
		removeOverlayEdgeMarkers();
	}

	// ── Overlay edge midpoint drag handles ──

	function getRotatedOverlayEdgeMidpoints(): any[] {
		const corners = getRotatedOverlayCorners();
		if (corners.length < 4) return [];
		const L = (window as any).L;
		// corners: 0=SW, 1=SE, 2=NE, 3=NW
		// edges: bottom(SW-SE), right(SE-NE), top(NE-NW), left(NW-SW)
		const mid = (a: any, b: any) => {
			const pa = map.latLngToContainerPoint(a);
			const pb = map.latLngToContainerPoint(b);
			return map.containerPointToLatLng(L.point((pa.x + pb.x) / 2, (pa.y + pb.y) / 2));
		};
		return [
			mid(corners[0], corners[1]), // bottom
			mid(corners[1], corners[2]), // right
			mid(corners[2], corners[3]), // top
			mid(corners[3], corners[0])  // left
		];
	}

	function getOverlayEdgeAngle(edgeIndex: number): number {
		const corners = getRotatedOverlayCorners();
		if (corners.length < 4) return 0;
		const pairs = [[0,1],[1,2],[2,3],[3,0]];
		const [a, b] = pairs[edgeIndex];
		const pa = map.latLngToContainerPoint(corners[a]);
		const pb = map.latLngToContainerPoint(corners[b]);
		return Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180 / Math.PI;
	}

	function createOverlayEdgeMarkers() {
		if (!overlayLayer || !map) return;
		removeOverlayEdgeMarkers();
		const L = (window as any).L;
		const midpoints = getRotatedOverlayEdgeMidpoints();
		if (midpoints.length < 4) return;

		const size = 30;
		for (let i = 0; i < 4; i++) {
			const angle = getOverlayEdgeAngle(i);
			const icon = L.divIcon({
				className: 'overlay-edge-handle-container',
				iconSize: [size, size],
				iconAnchor: [size / 2, size / 2],
				html: `<div class="overlay-edge-handle" style="transform: rotate(${angle}deg)"></div>`
			});
			const marker = L.marker(midpoints[i], {
				icon,
				draggable: true,
				zIndexOffset: 10000
			}).addTo(map);

			marker.on('drag', () => {
				const dragLatLng = marker.getLatLng();
				// Constrain handle to move only perpendicular to its edge
				const mids = getRotatedOverlayEdgeMidpoints();
				const midPt = map.latLngToContainerPoint(mids[i]);
				const cPt = map.latLngToContainerPoint(overlayLayer.getBounds().getCenter());
				const nx = midPt.x - cPt.x;
				const ny = midPt.y - cPt.y;
				const nLen = Math.sqrt(nx * nx + ny * ny);
				if (nLen < 0.5) return;
				const nnx = nx / nLen;
				const nny = ny / nLen;
				const dragPt = map.latLngToContainerPoint(dragLatLng);
				const dot = (dragPt.x - midPt.x) * nnx + (dragPt.y - midPt.y) * nny;
				const projPt = L.point(midPt.x + dot * nnx, midPt.y + dot * nny);
				const constrained = map.containerPointToLatLng(projPt);
				marker.setLatLng(constrained);
				handleOverlayEdgeDrag(i, constrained);
			});
			marker.on('dragend', () => handleOverlayEdgeDragEnd());
			overlayEdgeMarkers.push(marker);
		}
	}

	function repositionOverlayEdgeMarkers() {
		const midpoints = getRotatedOverlayEdgeMidpoints();
		for (let i = 0; i < overlayEdgeMarkers.length && i < midpoints.length; i++) {
			overlayEdgeMarkers[i].setLatLng(midpoints[i]);
			const el = overlayEdgeMarkers[i].getElement();
			if (el) {
				const bar = el.querySelector('.overlay-edge-handle');
				if (bar) {
					bar.style.transform = `rotate(${getOverlayEdgeAngle(i)}deg)`;
				}
			}
		}
	}

	function handleOverlayEdgeDrag(edgeIndex: number, newLatLng: any) {
		if (!overlayLayer || !map) return;
		const L = (window as any).L;
		const bounds = overlayLayer.getBounds();
		const center = bounds.getCenter();
		const centerPt = map.latLngToContainerPoint(center);

		// Inverse-rotate the dragged point back to axis-aligned space
		const rad = -overlayRotation * Math.PI / 180;
		const dragPt = map.latLngToContainerPoint(newLatLng);
		const dx = dragPt.x - centerPt.x;
		const dy = dragPt.y - centerPt.y;
		const urx = dx * Math.cos(rad) - dy * Math.sin(rad);
		const ury = dx * Math.sin(rad) + dy * Math.cos(rad);
		const unrotatedPt = L.point(centerPt.x + urx, centerPt.y + ury);
		const unrotatedLatLng = map.containerPointToLatLng(unrotatedPt);

		let south = bounds.getSouth();
		let west = bounds.getWest();
		let north = bounds.getNorth();
		let east = bounds.getEast();

		switch (edgeIndex) {
			case 0: south = unrotatedLatLng.lat; break; // bottom
			case 1: east = unrotatedLatLng.lng; break;  // right
			case 2: north = unrotatedLatLng.lat; break; // top
			case 3: west = unrotatedLatLng.lng; break;  // left
		}

		if (south >= north || west >= east) return;

		const newBounds = L.latLngBounds([south, west], [north, east]);
		overlayLayer.setBounds(newBounds);
		applyOverlayRotation();

		// Reposition all markers
		const updatedCorners = getRotatedOverlayCorners();
		for (let i = 0; i < 4; i++) {
			if (overlayCornerMarkers[i]) overlayCornerMarkers[i].setLatLng(updatedCorners[i]);
		}
		repositionOverlayEdgeMarkers();
		if (overlayRotateMarker) {
			const pos = getOverlayRotateHandlePos();
			if (pos) overlayRotateMarker.setLatLng(pos);
		}
		updateOverlaySelectionRect();
	}

	function handleOverlayEdgeDragEnd() {
		applyOverlayRotation();
		const updatedCorners = getRotatedOverlayCorners();
		for (let i = 0; i < 4; i++) {
			if (overlayCornerMarkers[i]) overlayCornerMarkers[i].setLatLng(updatedCorners[i]);
		}
		repositionOverlayEdgeMarkers();
		if (overlayRotateMarker) {
			const pos = getOverlayRotateHandlePos();
			if (pos) overlayRotateMarker.setLatLng(pos);
		}
		updateOverlaySelectionRect();
		persistOverlay();
	}

	function removeOverlayEdgeMarkers() {
		for (const marker of overlayEdgeMarkers) {
			if (map) map.removeLayer(marker);
		}
		overlayEdgeMarkers = [];
	}

	function setupOverlayDragHandlers() {
		if (!map || !overlayLayer) return;
		removeOverlayDragHandlers();

		const L = (window as any).L;
		const imgEl = overlayLayer.getElement();
		if (!imgEl) return;

		// The <img> sits below the SVG renderer in leaflet-overlay-pane,
		// so shape paths capture mousedown before it reaches the image.
		// Raise the <img> above the SVG so it receives events first.
		imgEl.style.zIndex = '9999';
		imgEl.style.position = 'relative';
		imgEl.style.cursor = 'grab';
		imgEl.style.pointerEvents = 'auto';

		// Prevent Leaflet from initiating map drag when mousedown is on the image.
		L.DomEvent.disableClickPropagation(imgEl);

		const onImgDown = (e: any) => {
			if (!overlayLayer || editModeSelection !== 'overlay') return;

			// Stop propagation at DOM level AND Leaflet level
			e.stopPropagation();
			e.preventDefault();
			map.dragging.disable();

			const touch = e.touches ? e.touches[0] : e;
			const container = map.getContainer();
			const containerRect = container.getBoundingClientRect();
			const containerPoint = L.point(touch.clientX - containerRect.left, touch.clientY - containerRect.top);
			const latlng = map.containerPointToLatLng(containerPoint);

			overlayDragState = { dragging: true, startLatLng: latlng };
		};

		const onMouseMove = (e: any) => {
			if (!overlayDragState?.dragging || !overlayLayer) return;
			const touch = e.touches ? e.touches[0] : e;
			if (!touch) return;

			const container = map.getContainer();
			const containerRect = container.getBoundingClientRect();
			const containerPoint = L.point(touch.clientX - containerRect.left, touch.clientY - containerRect.top);
			const currentLatLng = map.containerPointToLatLng(containerPoint);

			const dlat = currentLatLng.lat - overlayDragState.startLatLng.lat;
			const dlng = currentLatLng.lng - overlayDragState.startLatLng.lng;

			const bounds = overlayLayer.getBounds();
			const newBounds = L.latLngBounds(
				[bounds.getSouth() + dlat, bounds.getWest() + dlng],
				[bounds.getNorth() + dlat, bounds.getEast() + dlng]
			);
			overlayLayer.setBounds(newBounds);
			applyOverlayRotation();

			// Move all corner markers
			const updatedCorners = getRotatedOverlayCorners();
			for (let i = 0; i < 4; i++) {
				if (overlayCornerMarkers[i]) {
					overlayCornerMarkers[i].setLatLng(updatedCorners[i]);
				}
			}
			repositionOverlayEdgeMarkers();
			// Move rotation handle
			if (overlayRotateMarker) {
				const pos = getOverlayRotateHandlePos();
				if (pos) overlayRotateMarker.setLatLng(pos);
			}
			updateOverlaySelectionRect();

			overlayDragState.startLatLng = currentLatLng;
		};

		const onMouseUp = () => {
			if (!overlayDragState?.dragging) return;
			overlayDragState = null;
			map.dragging.enable();
			persistOverlay();
		};

		imgEl.addEventListener('mousedown', onImgDown);
		imgEl.addEventListener('touchstart', onImgDown);
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
		window.addEventListener('touchmove', onMouseMove as any);
		window.addEventListener('touchend', onMouseUp);

		overlayDragHandlers = { mousedown: onImgDown, mousemove: onMouseMove, mouseup: onMouseUp };
	}

	function removeOverlayDragHandlers() {
		if (!overlayDragHandlers) return;
		if (overlayLayer) {
			const imgEl = overlayLayer.getElement();
			if (imgEl) {
				// Restore z-index so image goes back behind shapes
				imgEl.style.zIndex = '';
				imgEl.style.position = '';
				imgEl.style.cursor = '';
				imgEl.style.pointerEvents = '';
				imgEl.removeEventListener('mousedown', overlayDragHandlers.mousedown);
				imgEl.removeEventListener('touchstart', overlayDragHandlers.mousedown);
			}
		}
		window.removeEventListener('mousemove', overlayDragHandlers.mousemove);
		window.removeEventListener('mouseup', overlayDragHandlers.mouseup);
		window.removeEventListener('touchmove', overlayDragHandlers.mousemove as any);
		window.removeEventListener('touchend', overlayDragHandlers.mouseup);
		overlayDragHandlers = null;
		overlayDragState = null;
	}

	function applyOverlayRotation() {
		if (!overlayLayer) return;
		const el = overlayLayer.getElement();
		if (!el) return;
		const currentTransform = el.style.transform || '';
		const cleaned = currentTransform.replace(/\s*rotate\([^)]*\)/, '');
		el.style.transform = cleaned + ` rotate(${overlayRotation}deg)`;
		el.style.transformOrigin = 'center center';
	}

	function hookOverlayRotation() {
		if (!overlayLayer) return;
		const originalReset = overlayLayer._reset;
		if (!originalReset) return;
		overlayLayer._reset = function () {
			originalReset.call(this);
			applyOverlayRotation();
		};
	}

	function updateOverlayRotation() {
		applyOverlayRotation();
		persistOverlay();
	}

	function computeShapeDelta(oldShape: ShapeDef, newShape: ShapeDef): { dx: number; dy: number } {
		if (oldShape.type === 'rect' && newShape.type === 'rect') {
			return { dx: newShape.x - oldShape.x, dy: newShape.y - oldShape.y };
		}
		if (oldShape.type === 'circle' && newShape.type === 'circle') {
			return { dx: newShape.x - oldShape.x, dy: newShape.y - oldShape.y };
		}
		if (oldShape.type === 'polygon' && newShape.type === 'polygon') {
			return { dx: newShape.points[0] - oldShape.points[0], dy: newShape.points[1] - oldShape.points[1] };
		}
		return { dx: 0, dy: 0 };
	}

	function applyDelta(shape: ShapeDef, dx: number, dy: number): ShapeDef {
		if (shape.type === 'rect') return { ...shape, x: shape.x + dx, y: shape.y + dy };
		if (shape.type === 'circle') return { ...shape, x: shape.x + dx, y: shape.y + dy };
		const points = [...shape.points];
		for (let i = 0; i < points.length; i += 2) {
			points[i] += dx;
			points[i + 1] += dy;
		}
		return { ...shape, points };
	}

	function selectZoneForDrag(zoneId: string, layer: any) {
		// Deselect previous entity toolbar if it was an area
		deselectEntity();

		// Deselect previous zone drag without re-rendering
		if (editingLayer && editingLayer !== layer) {
			editingLayer.pm.disableLayerDrag();
			editingLayer.off('pm:dragend');
			editingLayer.off('pm:dragstart');
			const prevZone = venue.zones.find(z => z.id === editingZoneId);
			if (prevZone) {
				editingLayer.setStyle({
					color: prevZone.style.stroke ?? '#cbd5e1',
					weight: prevZone.style.strokeWidth ?? 1,
					dashArray: ''
				});
			}
		}

		editingZoneId = zoneId;
		editingLayer = layer;
		const zone = venue.zones.find(z => z.id === zoneId);
		if (zone) {
			editingOriginalShape = zone.shape.type === 'polygon'
				? { ...zone.shape, points: [...zone.shape.points] }
				: { ...zone.shape };
		}

		layer.setStyle({ weight: 3, dashArray: '6 4', color: '#facc15' });
		layer.pm.enableLayerDrag();
		layer.on('pm:dragstart', () => { isDragging = true; });
		layer.on('pm:dragend', () => handleZoneDragEnd(layer));

		// Set toolbar target to the zone
		selectEntityForToolbar({ type: 'zone', zoneId }, layer);
	}

	function deselectZone() {
		deselectEntity();
		if (editingLayer) {
			editingLayer.pm.disableLayerDrag();
			editingLayer.off('pm:dragend');
			editingLayer.off('pm:dragstart');
			const prevZone = venue.zones.find(z => z.id === editingZoneId);
			if (prevZone) {
				editingLayer.setStyle({
					color: prevZone.style.stroke ?? '#cbd5e1',
					weight: prevZone.style.strokeWidth ?? 1,
					dashArray: ''
				});
			}
		}
		editingZoneId = '';
		editingLayer = null;
		editingOriginalShape = null;
		isDragging = false;
	}

	function handleZoneDragEnd(layer: any) {
		isDragging = false;
		if (!editingOriginalShape || !editingZoneId) return;

		let newShape = layerToShapeDef(layer);
		const converter = getGeoConverter();
		if (converter) newShape = converter.shapeToPixel(newShape);

		const delta = computeShapeDelta(editingOriginalShape, newShape);

		const zone = venue.zones.find(z => z.id === editingZoneId);
		if (zone) {
			zone.shape = applyDelta(zone.shape, delta.dx, delta.dy);
			for (const area of zone.areas) {
				area.shape = applyDelta(area.shape, delta.dx, delta.dy);
				for (const spot of area.spots) {
					spot.shape = applyDelta(spot.shape, delta.dx, delta.dy);
				}
			}
		}

		venue = { ...venue };
		editingZoneId = '';
		editingLayer = null;
		editingOriginalShape = null;
		renderExistingShapes();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (redrawActive) { cancelRedraw(); return; }
			if (editMode) return; // Edit mode only closes via Done button
			if (resizeActive && editingTargetLayer) {
				editingTargetLayer.pm.disable();
				resizeActive = false;
				renderExistingShapes();
				return;
			}
			if (activeToolbarAction || deleteConfirming) {
				resetToolbarSubState();
				return;
			}
			if (editingTarget) {
				// If an area or spot is selected (not via zone drag), just deselect entity
				if (editingTarget.type === 'area' || editingTarget.type === 'spot') {
					deselectEntity();
					return;
				}
			}
			if (editingZoneId) {
				deselectZone();
			}
		}
		if (e.key === 'Enter' && activeToolbarAction === 'rename') {
			handleRenameConfirm();
		}
	}

	function handleZoneSelect(zoneId: string) {
		if (!map) return;
		if (activeZoneId === zoneId) return;

		activeZoneId = zoneId;
		deselectEntity();
		deselectZone();
		renderExistingShapes();
	}

	function addShapeToVenue(shapeDef: ShapeDef, name: string, category: POICategory, description: string) {
		if (drawLevel === 'zone') {
			const zone: Zone = {
				id: generateId('zone'),
				name,
				category,
				shape: shapeDef,
				style: defaultStyle('zone', category),
				areas: []
			};
			venue.zones = [...venue.zones, zone];
		} else if (drawLevel === 'area') {
			const zone = venue.zones.find(z => z.id === selectedZoneId);
			if (!zone) return;
			const area: Area = {
				id: generateId('area'),
				name,
				category,
				shape: shapeDef,
				style: defaultStyle('area', category),
				spots: []
			};
			zone.areas = [...zone.areas, area];
		} else {
			const zone = venue.zones.find(z => z.id === selectedZoneId);
			if (!zone) return;
			const area = zone.areas.find(a => a.id === selectedAreaId);
			if (!area) return;
			const spot: Spot = {
				id: generateId('spot'),
				name,
				description,
				category,
				shape: shapeDef,
				style: defaultStyle('spot', category)
			};
			area.spots = [...area.spots, spot];
		}

		venue = { ...venue };
	}

	function renderExistingShapes() {
		if (!map) return;
		const L = (window as any).L;
		const converter = getGeoConverter();

		// Clear editing state since layers are being rebuilt
		editingZoneId = '';
		editingLayer = null;
		editingOriginalShape = null;
		editingTarget = null;
		editingTargetLayer = null;
		toolbarPosition = null;

		// Clear existing
		for (const sl of shapeLayers) {
			map.removeLayer(sl);
		}
		shapeLayers = [];

		// Helper: make a layer's tooltip clickable, triggering the same handler as the layer
		function makeTooltipClickable(layer: any, handler: () => void) {
			const L = (window as any).L;
			layer.on('tooltipopen', () => {
				const el = layer.getTooltip()?.getElement();
				if (el) {
					el.style.cursor = 'pointer';
					el.style.pointerEvents = 'auto';
					L.DomEvent.on(el, 'click', (e: any) => {
						L.DomEvent.stopPropagation(e);
						handler();
					});
				}
			});
		}

		zoneLayerMap = new Map();

		// Filter zones based on activeZoneId
		const zonesToRender = activeZoneId
			? venue.zones.filter(z => z.id === activeZoneId)
			: venue.zones;

		for (const zone of zonesToRender) {
			for (const area of zone.areas) {
				const areaLayer = shapeDefToLayer(area.shape, area.style, area.name, 'area', converter);
				if (areaLayer) {
					areaLayer.addTo(map);
					shapeLayers.push(areaLayer);

					const handleAreaClick = () => {
						zoneClickedFlag = true;
						setTimeout(() => zoneClickedFlag = false, 0);
						// Deselect zone drag if active
						if (editingZoneId) {
							editingLayer?.pm.disableLayerDrag();
							editingLayer?.off('pm:dragend');
							editingLayer?.off('pm:dragstart');
							const prevZone = venue.zones.find(z => z.id === editingZoneId);
							if (prevZone && editingLayer) {
								editingLayer.setStyle({
									color: prevZone.style.stroke ?? '#cbd5e1',
									weight: prevZone.style.strokeWidth ?? 1,
									dashArray: ''
								});
							}
							editingZoneId = '';
							editingLayer = null;
							editingOriginalShape = null;
						}
						// Toggle area selection
						if (editingTarget?.type === 'area' && editingTarget.areaId === area.id) {
							deselectEntity();
						} else {
							selectEntityForToolbar({ type: 'area', zoneId: zone.id, areaId: area.id }, areaLayer);
						}
					};

					areaLayer.on('click', handleAreaClick);
					makeTooltipClickable(areaLayer, handleAreaClick);
				}

				for (const spot of area.spots) {
					const spotLayer = shapeDefToLayer(spot.shape, spot.style, spot.name, 'spot', converter);
					if (spotLayer) {
						spotLayer.addTo(map);
						shapeLayers.push(spotLayer);

						const handleSpotClick = () => {
							zoneClickedFlag = true;
							setTimeout(() => zoneClickedFlag = false, 0);
							// Deselect zone drag if active
							if (editingZoneId) {
								editingLayer?.pm.disableLayerDrag();
								editingLayer?.off('pm:dragend');
								editingLayer?.off('pm:dragstart');
								const prevZone = venue.zones.find(z => z.id === editingZoneId);
								if (prevZone && editingLayer) {
									editingLayer.setStyle({
										color: prevZone.style.stroke ?? '#cbd5e1',
										weight: prevZone.style.strokeWidth ?? 1,
										dashArray: ''
									});
								}
								editingZoneId = '';
								editingLayer = null;
								editingOriginalShape = null;
							}
							// Toggle spot selection
							if (editingTarget?.type === 'spot' && (editingTarget as any).spotId === spot.id) {
								deselectEntity();
							} else {
								selectEntityForToolbar({ type: 'spot', zoneId: zone.id, areaId: area.id, spotId: spot.id }, spotLayer);
							}
						};

						spotLayer.on('click', handleSpotClick);
						makeTooltipClickable(spotLayer, handleSpotClick);
					}
				}
			}
		}
	}

	function shapeDefToLayer(shape: ShapeDef, style: ShapeStyle, name: string, level: string, converter?: GeoConverter): any {
		const L = (window as any).L;

		// Convert pixel coords to lat/lng for display when in GPS mode
		const displayShape = converter ? converter.shapeToLatLng(shape) : shape;

		const opts = {
			color: style.stroke ?? '#cbd5e1',
			weight: style.strokeWidth ?? 1,
			fillColor: style.fill,
			fillOpacity: style.opacity ?? (level === 'spot' ? 0.9 : 0.6),
			opacity: 1
		};

		let layer: any;
		if (displayShape.type === 'rect') {
			const bounds = [
				[displayShape.y, displayShape.x],
				[displayShape.y + displayShape.height, displayShape.x + displayShape.width]
			];
			layer = L.rectangle(bounds, opts);
		} else if (displayShape.type === 'circle') {
			layer = L.circle([displayShape.y, displayShape.x], { ...opts, radius: displayShape.radius });
		} else {
			const latlngs: [number, number][] = [];
			for (let i = 0; i < displayShape.points.length; i += 2) {
				latlngs.push([displayShape.points[i + 1], displayShape.points[i]]);
			}
			layer = L.polygon(latlngs, opts);
		}

		if (level === 'zone') {
			layer.bindTooltip(name, { permanent: true, direction: 'right', className: 'label-zone' });
			layer.on('add', function () {
				const bounds = this.getBounds();
				const topLeft = converter ? bounds.getNorthWest() : bounds.getSouthWest();
				if (this.getTooltip()) {
					this.getTooltip().setLatLng(topLeft);
				}
			});
		} else if (level === 'area') {
			layer.bindTooltip(name, { permanent: true, direction: 'top', className: 'label-area', offset: [0, 0] });
			layer.on('add', function () {
				const bounds = this.getBounds();
				const topLeft = converter ? bounds.getNorthWest() : bounds.getSouthWest();
				if (this.getTooltip()) {
					this.getTooltip().setLatLng(topLeft);
				}
			});
		} else {
			layer.bindTooltip(name, { permanent: level !== 'spot', direction: 'center', className: `label-${level}` });
		}
		return layer;
	}

	function confirmDialog() {
		if (!pendingLayer || !dialogName.trim()) return;

		let shapeDef = layerToShapeDef(pendingLayer);

		// Convert lat/lng to pixel coords before storing when in GPS mode
		const converter = getGeoConverter();
		if (converter) {
			shapeDef = converter.shapeToPixel(shapeDef);
		}

		addShapeToVenue(shapeDef, dialogName.trim(), dialogCategory, dialogDescription.trim());

		// Remove the drawn layer (we'll re-render from data)
		map.removeLayer(pendingLayer);
		pendingLayer = null;
		showDialog = false;
		dialogName = '';
		dialogDescription = '';

		renderExistingShapes();
	}

	function cancelDialog() {
		if (pendingLayer) {
			map.removeLayer(pendingLayer);
			pendingLayer = null;
		}
		showDialog = false;
		dialogName = '';
		dialogDescription = '';
	}

	function initMap() {
		const L = (window as any).L;
		const converter = getGeoConverter();

		if (converter && venue.geoBounds) {
			// GPS mode: standard Leaflet CRS with OSM tiles
			map = L.map(mapContainer, {
				minZoom: 2,
				maxZoom: 19,
				zoomSnap: 0.5,
				zoomDelta: 1,
				wheelDebounceTime: 40,
				zoomAnimation: false,
				zoomControl: false
			});

			L.control.zoom({ position: 'bottomright' }).addTo(map);

			// Add map tiles (CartoDB Positron — fast CDN-backed tiles)
			tileLayerRef = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
				attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
				subdomains: 'abcd',
				maxZoom: 19
			}).addTo(map);

			const geoBounds = L.latLngBounds(
				[venue.geoBounds.sw[0], venue.geoBounds.sw[1]],
				[venue.geoBounds.ne[0], venue.geoBounds.ne[1]]
			);

			// Semi-transparent floor background rectangle
			floorBackgroundLayer = L.rectangle(geoBounds, {
				color: '#94a3b8',
				weight: 2,
				fillColor: venue.color,
				fillOpacity: 0.3
			}).addTo(map);

			// Add search/geocoder control
			const Geocoder = (L.Control as any).Geocoder;
			if (Geocoder) {
				Geocoder.nominatim();
				const geocoder = new Geocoder({
					defaultMarkGeocode: false,
					position: 'bottomleft',
					placeholder: 'Search for a place...',
					collapsed: true
				});
				geocoder.on('markgeocode', (e: any) => {
					const bbox = e.geocode.bbox;
					map.fitBounds(bbox);
				});
				geocoder.addTo(map);

				// Move geocoder into fab-column so it aligns with other FAB buttons
				const geocoderContainer = geocoder.getContainer();
				if (geocoderContainer && fabColumnEl) {
					fabColumnEl.insertBefore(geocoderContainer, fabColumnEl.firstChild);
				}
			}

			venueGeoBounds = geoBounds;

			setTimeout(() => {
				map.invalidateSize();
				map.fitBounds(geoBounds);
			}, 0);
			map.fitBounds(geoBounds);
		} else {
			// Pixel mode (fallback): Y-down CRS, no tiles
			const YDownCRS = L.Util.extend({}, L.CRS.Simple, {
				transformation: new L.Transformation(1, 0, 1, 0)
			});

			map = L.map(mapContainer, {
				crs: YDownCRS,
				minZoom: -2,
				maxZoom: 4,
				zoomSnap: 0.25
			});

			const bounds = [[0, 0], [venue.height, venue.width]];

			setTimeout(() => {
				map.invalidateSize();
				map.fitBounds(bounds);
			}, 0);
			map.fitBounds(bounds);

			floorBackgroundLayer = L.rectangle(bounds, {
				color: '#94a3b8',
				weight: 2,
				fillColor: venue.color,
				fillOpacity: 1
			}).addTo(map);
		}

		// Enable geoman without toolbar UI
		map.pm.addControls({
			position: 'bottomright',
			drawCircleMarker: false,
			drawMarker: false,
			drawPolyline: false,
			drawText: false,
			cutPolygon: false,
			rotateMode: false
		});
		map.pm.removeControls();

		// Listen for shape creation
		map.on('pm:create', (e: any) => {
			if (redrawActive) { completeRedraw(e.layer); return; }
			pendingLayer = e.layer;
			showDialog = true;
		});

		// Click on map background deselects zone/area
		map.on('click', (e: any) => {
			if (zoneClickedFlag) return;
			if (editMode) {
				// If click is within overlay bounds, select overlay
				if (overlayLayer && overlayLayer.getBounds().contains(e.latlng) && editModeSelection !== 'overlay') {
					selectEditModeItem('overlay');
				} else {
					deselectEditModeItem();
				}
				return;
			}
			if (editingTarget) deselectEntity();
			if (editingZoneId) deselectZone();
		});

		// Update toolbar position on map move/zoom
		map.on('move zoom zoomend', () => {
			if (editingTarget) updateToolbarPosition();
		});

		// Deselect zone/area when starting to draw
		map.on('pm:drawstart', () => {
			if (redrawActive) return;
			if (editingTarget) deselectEntity();
			if (editingZoneId) deselectZone();
		});

		// Safety net: if draw ends without creating a shape during redraw, cancel
		map.on('pm:drawend', () => {
			if (redrawActive) cancelRedraw();
		});

		renderExistingShapes();
	}

	onMount(() => {
		editModeShowMap = localStorage.getItem('mapEditor:showMap') === 'true';

		// Dynamically import Leaflet to avoid SSR issues
		const linkEl = document.createElement('link');
		linkEl.rel = 'stylesheet';
		linkEl.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
		document.head.appendChild(linkEl);

		const linkGm = document.createElement('link');
		linkGm.rel = 'stylesheet';
		linkGm.href = 'https://unpkg.com/@geoman-io/leaflet-geoman-free@2.16.0/dist/leaflet-geoman.css';
		document.head.appendChild(linkGm);

		const linkGc = document.createElement('link');
		linkGc.rel = 'stylesheet';
		linkGc.href = 'https://unpkg.com/leaflet-control-geocoder@2.4.0/dist/Control.Geocoder.css';
		document.head.appendChild(linkGc);

		const script = document.createElement('script');
		script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
		script.onload = () => {
			// Load Geoman and Geocoder in parallel, init when both ready
			let loaded = 0;
			const onPluginReady = () => { if (++loaded === 2) initMap(); };

			const gmScript = document.createElement('script');
			gmScript.src = 'https://unpkg.com/@geoman-io/leaflet-geoman-free@2.16.0/dist/leaflet-geoman.min.js';
			gmScript.onload = onPluginReady;
			document.head.appendChild(gmScript);

			const gcScript = document.createElement('script');
			gcScript.src = 'https://unpkg.com/leaflet-control-geocoder@2.4.0/dist/Control.Geocoder.min.js';
			gcScript.onload = onPluginReady;
			document.head.appendChild(gcScript);
		};
		document.head.appendChild(script);

		return () => {
			map?.remove();
		};
	});

	let _lastVenueId = '';
	$effect(() => {
		const vid = venue.id;
		if (vid === _lastVenueId) return;
		_lastVenueId = vid;
		activeZoneId = venue.zones[0]?.id ?? '';
		editMode = false;
		editModeTarget = null;
		editModeLayer = null;
		redrawActive = false;
		redrawOriginalLayer = null;
		if (map) {
			map.remove();
			initMap();
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="editor-wrapper" class:edit-mode-active={editMode}>
	{#if !editMode}
	<div class="editor-toolbar">
		<div class="toolbar-row">
			<span class="venue-name">{venue.name}</span>
			<div class="toolbar-spacer"></div>
		</div>
		{#if editingZoneId}
		<div class="toolbar-row">
				<span class="editing-badge">
					Moving: {venue.zones.find(z => z.id === editingZoneId)?.name ?? ''}
				</span>
		</div>
		{/if}
	</div>

	<div class="zone-selector">
		{#if !isFloorVenue}
			<button
				class="zone-chip"
				class:active={activeZoneId === ''}
				onclick={() => handleZoneSelect('')}
			>
				<span class="zone-chip-name">All</span>
				<span class="zone-chip-count">{venue.zones.length}</span>
			</button>
		{/if}
		{#each venue.zones as zone}
			<button
				class="zone-chip"
				class:active={activeZoneId === zone.id}
				onclick={() => handleZoneSelect(zone.id)}
			>
				{#if zone.zoneType === 'floor'}
					<span class="zone-chip-icon">L{zone.level}</span>
				{/if}
				<span class="zone-chip-name">{zone.name}</span>
				<span class="zone-chip-count">{zone.areas.length}</span>
			</button>
		{/each}
	</div>
	{/if}

	<div class="map-area-wrapper">
		<div class="map-area" bind:this={mapContainer}></div>

		<div class="fab-column" bind:this={fabColumnEl}>
			{#if venueGeoBounds}
				<button
					class="map-fab"
					onclick={(e) => { e.stopPropagation(); map?.flyToBounds(venueGeoBounds, { duration: 0.8 }); }}
					title="Back to venue bounds"
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
						<polyline points="9 22 9 12 15 12 15 22"></polyline>
					</svg>
				</button>
			{/if}

			{#if editMode}
				<button
					class="map-fab"
					class:active={editModeShowMap}
					onclick={(e) => { e.stopPropagation(); toggleEditModeMap(); }}
					title={editModeShowMap ? 'Hide map' : 'Show map'}
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
						<line x1="8" y1="2" x2="8" y2="18"></line>
						<line x1="16" y1="6" x2="16" y2="22"></line>
					</svg>
				</button>
			{/if}
		</div>

		{#if !editMode && toolbarPosition && editingTarget && !isDragging}
			{@const editingEntity = getEditingEntity()}
			{#if editingEntity}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					class="zone-toolbar"
					style="left: {toolbarPosition.x}px; top: {toolbarPosition.y}px;"
					onmousedown={(e) => e.stopPropagation()}
					onclick={(e) => e.stopPropagation()}
				>
					<span class="zt-title">{editingTarget.type === 'spot' ? 'Spot' : editingTarget.type === 'area' ? 'Area' : 'Zone'}: {editingEntity.name}</span>
					{#if deleteConfirming}
						<span class="zt-confirm-text">Delete {editingEntity.name}?</span>
						<button class="zt-btn zt-btn-danger" onclick={handleDelete}>Yes</button>
						<button class="zt-btn" onclick={() => deleteConfirming = false}>No</button>
					{:else if activeToolbarAction === 'rename'}
						<!-- svelte-ignore a11y_autofocus -->
						<input
							class="zt-input"
							type="text"
							bind:value={renameValue}
							placeholder="Name..."
							autofocus
						/>
						<div class="zt-row">
							<button class="zt-btn zt-btn-primary" onclick={handleRenameConfirm} disabled={!renameValue.trim()}>OK</button>
							<button class="zt-btn" onclick={() => activeToolbarAction = null}>Cancel</button>
						</div>
					{:else if activeToolbarAction === 'category'}
						{#each categories as cat}
							<button
								class="zt-cat-chip"
								class:active={editingEntity.category === cat}
								onclick={() => handleCategoryChange(cat)}
							>
								<span class="zt-cat-dot" style="background: {CATEGORY_COLORS[cat]}"></span>
								{cat}
							</button>
						{/each}
					{:else if activeToolbarAction === 'style'}
						<div class="zt-style-row">
							<span class="zt-style-label">Fill</span>
							<div class="zt-swatches">
								{#each colorSwatches as c}
									<button
										class="zt-swatch"
										class:active={styleFill === c}
										style="background: {c}"
										title={c}
										onclick={() => { styleFill = c; applyStyleChange(); }}
									></button>
								{/each}
								<input type="color" class="zt-color-input" bind:value={styleFill} oninput={applyStyleChange} />
							</div>
						</div>
						<div class="zt-style-row">
							<span class="zt-style-label">Opacity</span>
							<input type="range" class="zt-range" min="0.1" max="1" step="0.05" bind:value={styleOpacity} oninput={applyStyleChange} />
							<span class="zt-range-val">{styleOpacity.toFixed(2)}</span>
						</div>
						<div class="zt-style-row">
							<span class="zt-style-label">Stroke</span>
							<div class="zt-swatches">
								{#each colorSwatches as c}
									<button
										class="zt-swatch"
										class:active={styleStroke === c}
										style="background: {c}"
										title={c}
										onclick={() => { styleStroke = c; applyStyleChange(); }}
									></button>
								{/each}
								<input type="color" class="zt-color-input" bind:value={styleStroke} oninput={applyStyleChange} />
							</div>
						</div>
						<div class="zt-style-row">
							<span class="zt-style-label">Width</span>
							<div class="zt-btn-group">
								{#each [1, 2, 3] as w}
									<button
										class="zt-btn"
										class:active={styleStrokeWidth === w}
										onclick={() => { styleStrokeWidth = w; applyStyleChange(); }}
									>{w}</button>
								{/each}
							</div>
						</div>
						<button class="zt-btn zt-btn-primary" onclick={handleStyleConfirm}>Done</button>
					{:else}
						<button class="zt-btn zt-btn-primary" onclick={enterEditMode}>Edit</button>
						<button class="zt-btn" onclick={handleDuplicate}>Duplicate</button>
						<button class="zt-btn zt-btn-danger" onclick={() => deleteConfirming = true}>Delete</button>
					{/if}
				</div>
			{/if}
		{/if}

	</div>

	{#if editMode && editModeTarget}
		{@const editEntity = getEditModeEntity()}
		{@const isAreaEdit = editModeTarget.type === 'area'}
		{@const editZone = venue.zones.find(z => z.id === editModeTarget.zoneId)}
		{#if editEntity}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="side-panel" class:redraw-active={redrawActive} onclick={(e) => e.stopPropagation()}>
			<div class="sp-header">
				<button class="sp-close" onclick={exitEditMode} title="Close">&#x2715;</button>
				<span class="sp-title">Edit {isAreaEdit ? 'Area' : 'Zone'}</span>
				<div class="sp-header-spacer"></div>
			</div>

			<div class="sp-body">

			<div class="sp-section">
				<span class="sp-section-label">{isAreaEdit ? 'Area' : 'Zone'} Name</span>
				<input
					class="sp-input"
					type="text"
					bind:value={panelName}
					oninput={panelUpdateName}
				/>
			</div>

			<div class="sp-section">
				<span class="sp-section-label">Category</span>
				<div class="sp-cat-grid">
					{#each categories as cat}
						<button
							class="sp-cat-chip"
							class:active={panelCategory === cat}
							onclick={() => panelUpdateCategory(cat)}
						>
							<span class="sp-cat-dot" style="background: {CATEGORY_COLORS[cat]}"></span>
							{cat}
						</button>
					{/each}
				</div>
			</div>

			<div class="sp-section">
				<span class="sp-section-label">Fill</span>
				<div class="sp-color-grid">
					{#each colorSwatches as c}
						<button
							class="zt-swatch"
							class:active={panelFill === c}
							style="background: {c}"
							title={c}
							onclick={() => { panelFill = c; panelApplyStyle(); }}
						></button>
					{/each}
					<input type="color" class="zt-color-input" bind:value={panelFill} oninput={panelApplyStyle} />
				</div>
			</div>

			<div class="sp-section">
				<span class="sp-section-label">Opacity</span>
				<div class="sp-style-row">
					<input type="range" class="zt-range sp-range-full" min="0.1" max="1" step="0.05" bind:value={panelOpacity} oninput={panelApplyStyle} />
					<span class="zt-range-val">{panelOpacity.toFixed(2)}</span>
				</div>
			</div>

			<div class="sp-section">
				<span class="sp-section-label">Stroke</span>
				<div class="sp-color-grid">
					{#each strokeSwatches as c}
						<button
							class="zt-swatch"
							class:active={panelStroke === c}
							style="background: {c}"
							title={c}
							onclick={() => { panelStroke = c; panelApplyStyle(); }}
						></button>
					{/each}
					<input type="color" class="zt-color-input" bind:value={panelStroke} oninput={panelApplyStyle} />
				</div>
				<div class="sp-style-row">
					<input type="range" class="zt-range sp-range-full" min="0" max="5" step="0.5" bind:value={panelStrokeWidth} oninput={panelApplyStyle} />
					<span class="zt-range-val">{panelStrokeWidth}</span>
				</div>
			</div>

			<div class="sp-section sp-section-redraw">
				<span class="sp-section-label">Shape</span>
				{#if redrawActive}
					<div class="sp-redraw-hint">Click on map to draw a new polygon. Press Escape to cancel.</div>
					<button class="zt-btn" onclick={cancelRedraw}>Cancel Redraw</button>
				{:else}
					<div class="sp-shape-actions">
						<button class="zt-btn" onclick={startRedraw}>Redraw Shape</button>
						<button class="zt-btn sp-btn-reset" onclick={resetEditModeShapes}>Reset Shape</button>
					</div>
				{/if}
			</div>

			<div class="sp-section sp-section-overlay">
				<span class="sp-section-label">Image Overlay</span>
				{#if overlayImageUrl}
					<div class="sp-overlay-preview">
						<img src={overlayImageUrl} alt="Overlay" class="sp-overlay-thumb" />
						<button class="sp-overlay-remove" onclick={clearOverlay} title="Remove overlay">&#x2715;</button>
					</div>
					<div class="sp-style-row">
						<span class="sp-overlay-label">Opacity</span>
						<input type="range" class="zt-range sp-range-full" min="0" max="1" step="0.05" bind:value={overlayOpacity} oninput={updateOverlayOpacity} />
						<span class="zt-range-val">{overlayOpacity.toFixed(2)}</span>
					</div>
					{:else}
					<label class="sp-overlay-upload">
						<input type="file" accept="image/*" onchange={handleOverlayFile} hidden />
						<span class="zt-btn sp-overlay-btn">Choose Image</span>
					</label>
				{/if}
			</div>

			{#if isAreaEdit}
				{@const editArea = editZone?.areas.find(a => a.id === editModeTarget.areaId)}
				{#if editArea}
				<div class="sp-section">
					<span class="sp-section-label">Spots ({editArea.spots.length})</span>
					<div class="sp-area-list">
						{#each editArea.spots as spot}
							<div class="sp-area-item">
								<span class="sp-cat-dot" style="background: {CATEGORY_COLORS[spot.category]}"></span>
								<span class="sp-area-name">{spot.name}</span>
								<span class="sp-area-cat">{spot.category}</span>
							</div>
						{/each}
						{#if editArea.spots.length === 0}
							<span class="sp-empty">No spots</span>
						{/if}
					</div>
				</div>
				{/if}
			{:else if editZone}
				<div class="sp-section">
					<span class="sp-section-label">Areas ({editZone.areas.length})</span>
					<div class="sp-area-list">
						{#each editZone.areas as area}
							<div class="sp-area-item">
								<span class="sp-cat-dot" style="background: {CATEGORY_COLORS[area.category]}"></span>
								<span class="sp-area-name">{area.name}</span>
								<span class="sp-area-cat">{area.category}</span>
							</div>
						{/each}
						{#if editZone.areas.length === 0}
							<span class="sp-empty">No areas</span>
						{/if}
					</div>
				</div>
			{/if}

			</div>

			<div class="sp-footer">
				<button class="zt-btn zt-btn-primary sp-done-btn" onclick={exitEditMode}>Done</button>
			</div>
		</div>
		{/if}
	{/if}

	{#if showDialog}
		<div class="dialog-overlay">
			<div class="dialog">
				<h3>New {drawLevel}</h3>
				<label>
					Name
					<input type="text" bind:value={dialogName} placeholder="Enter name..." />
				</label>
				<label>
					Category
					<select bind:value={dialogCategory}>
						{#each categories as cat}
							<option value={cat}>{cat}</option>
						{/each}
					</select>
				</label>
				{#if drawLevel === 'spot'}
					<label>
						Description
						<textarea bind:value={dialogDescription} placeholder="Enter description..." rows="2"></textarea>
					</label>
				{/if}
				<div class="dialog-actions">
					<button class="cancel-btn" onclick={cancelDialog}>Cancel</button>
					<button class="confirm-btn" onclick={confirmDialog} disabled={!dialogName.trim()}>Add</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.editor-wrapper {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.editor-wrapper.edit-mode-active {
		position: fixed;
		inset: 0;
		z-index: 9999;
		flex-direction: row;
		background: #0f172a;
	}

	.editor-toolbar {
		display: flex;
		flex-direction: column;
		background: #1e293b;
		border-bottom: 1px solid #334155;
		flex-shrink: 0;
	}

	.toolbar-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 16px;
	}

	.toolbar-row:first-child {
		border-bottom: 1px solid #334155;
	}

	.venue-name {
		font-size: 16px;
		font-weight: 700;
		color: #f1f5f9;
		white-space: nowrap;
	}

	.toolbar-spacer {
		flex: 1;
	}

	/* Zone selector bar */
	.zone-selector {
		display: flex;
		gap: 6px;
		padding: 8px 16px;
		background: #1e293b;
		border-bottom: 1px solid #334155;
		overflow-x: auto;
		flex-shrink: 0;
		scrollbar-width: thin;
		scrollbar-color: #475569 transparent;
	}

	.zone-chip {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border: 1px solid #334155;
		border-radius: 8px;
		background: #0f172a;
		font-size: 13px;
		font-weight: 500;
		font-family: 'Inter', sans-serif;
		color: #94a3b8;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.15s;
	}

	.zone-chip:hover {
		background: #334155;
		color: #f1f5f9;
		border-color: #475569;
	}

	.zone-chip.active {
		background: #312e81;
		border-color: #818cf8;
		color: #c7d2fe;
	}

	.zone-chip-icon {
		font-size: 11px;
		font-weight: 700;
		color: #818cf8;
		background: #1e1b4b;
		padding: 2px 5px;
		border-radius: 4px;
		line-height: 1;
	}

	.zone-chip.active .zone-chip-icon {
		background: #4338ca;
		color: #e0e7ff;
	}

	.zone-chip-name {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.zone-chip-count {
		font-size: 11px;
		color: #64748b;
		background: #1e293b;
		padding: 1px 6px;
		border-radius: 10px;
		line-height: 1.3;
	}

	.zone-chip.active .zone-chip-count {
		background: #4338ca;
		color: #c7d2fe;
	}

	.map-area-wrapper {
		flex: 1;
		min-height: 0;
		min-width: 0;
		position: relative;
	}

	.map-area {
		width: 100%;
		height: 100%;
		background: #0f172a;
	}

	/* Side panel (edit mode) */
	.side-panel {
		width: 320px;
		background: #1e293b;
		border-left: 1px solid #334155;
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		z-index: 500;
		overflow: hidden;
	}

	.sp-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 16px 12px;
		border-bottom: 1px solid #334155;
		flex-shrink: 0;
	}

	.sp-body {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.sp-footer {
		padding: 12px 16px;
		border-top: 1px solid #334155;
		flex-shrink: 0;
	}

	.sp-header-spacer {
		width: 30px;
		flex-shrink: 0;
	}

	.sp-title {
		font-size: 16px;
		font-weight: 700;
		color: #f1f5f9;
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sp-close {
		background: none;
		border: none;
		color: #94a3b8;
		font-size: 18px;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 4px;
		line-height: 1;
	}

	.sp-close:hover {
		background: #334155;
		color: #f1f5f9;
	}

	.sp-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.sp-section-label {
		font-size: 11px;
		font-weight: 700;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.sp-input {
		padding: 8px 10px;
		border: 1px solid #334155;
		border-radius: 8px;
		font-size: 14px;
		font-family: 'Inter', sans-serif;
		background: #0f172a;
		color: #e2e8f0;
		outline: none;
	}

	.sp-input:focus {
		border-color: #818cf8;
	}

	.sp-cat-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.sp-cat-chip {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border: 1px solid #334155;
		border-radius: 6px;
		background: #0f172a;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		font-family: 'Inter', sans-serif;
		color: #94a3b8;
		text-transform: capitalize;
		transition: all 0.12s;
	}

	.sp-cat-chip:hover {
		background: #334155;
		color: #f1f5f9;
	}

	.sp-cat-chip.active {
		border-color: #818cf8;
		background: #312e81;
		color: #818cf8;
	}

	.sp-cat-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.sp-style-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.sp-style-label {
		font-size: 12px;
		font-weight: 600;
		color: #64748b;
		text-transform: uppercase;
		width: 50px;
		flex-shrink: 0;
	}

	.sp-swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
		align-items: center;
	}

	.sp-color-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 4px;
	}

	.sp-color-grid .zt-swatch,
	.sp-color-grid .zt-color-input {
		width: 100%;
		height: 28px;
	}

	.sp-area-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.sp-area-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		background: #0f172a;
		border: 1px solid #334155;
		border-radius: 6px;
	}

	.sp-area-name {
		font-size: 13px;
		font-weight: 500;
		color: #e2e8f0;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sp-area-cat {
		font-size: 11px;
		color: #64748b;
		text-transform: capitalize;
	}

	.sp-empty {
		font-size: 13px;
		color: #475569;
		font-style: italic;
		padding: 8px 0;
	}

	.sp-done-btn {
		width: 100%;
	}

	.side-panel.redraw-active .sp-section:not(.sp-section-redraw):not(.sp-section-overlay) {
		opacity: 0.35;
		pointer-events: none;
	}

	.sp-overlay-preview {
		position: relative;
		border: 1px solid #334155;
		border-radius: 8px;
		overflow: hidden;
	}

	.sp-overlay-thumb {
		width: 100%;
		height: 80px;
		object-fit: cover;
		display: block;
	}

	.sp-overlay-remove {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: none;
		background: rgba(0, 0, 0, 0.6);
		color: #f1f5f9;
		font-size: 12px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}

	.sp-overlay-remove:hover {
		background: #ef4444;
	}

	.sp-overlay-label {
		font-size: 12px;
		font-weight: 500;
		color: #94a3b8;
		width: 50px;
		flex-shrink: 0;
	}

	.sp-overlay-upload {
		cursor: pointer;
	}

	.sp-overlay-btn {
		display: block;
		text-align: center;
		width: 100%;
	}

	.sp-shape-actions {
		display: flex;
		gap: 8px;
	}
	.sp-shape-actions .zt-btn {
		flex: 1;
	}
	.sp-btn-reset {
		background: #374151 !important;
		color: #d1d5db !important;
	}
	.sp-btn-reset:hover {
		background: #4b5563 !important;
	}

	.sp-redraw-hint {
		font-size: 13px;
		color: #fbbf24;
		background: #422006;
		border: 1px solid #92400e;
		border-radius: 8px;
		padding: 10px 12px;
		line-height: 1.4;
	}

	.fab-column {
		position: absolute;
		bottom: 16px;
		left: 16px;
		z-index: 500;
		display: flex;
		flex-direction: column-reverse;
		gap: 8px;
		pointer-events: none;
	}

	.map-fab {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		border: 1px solid #475569;
		background: #1e293b;
		color: #94a3b8;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
		transition: background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s;
		pointer-events: auto;
	}

	.map-fab:hover {
		background: #334155;
		color: #f1f5f9;
		border-color: #64748b;
	}

	.map-fab.active {
		background: #4f46e5;
		border-color: #6366f1;
		color: #fff;
		box-shadow: 0 2px 12px rgba(79, 70, 229, 0.4);
	}

	.map-fab.active:hover {
		background: #4338ca;
	}

	/* Zone floating toolbar */
	.zone-toolbar {
		position: absolute;
		z-index: 500;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 6px;
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 12px;
		padding: 12px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
		pointer-events: auto;
		min-width: 180px;
	}

	.zt-title {
		font-size: 14px;
		font-weight: 600;
		color: #94a3b8;
		padding-bottom: 4px;
		border-bottom: 1px solid #334155;
		margin-bottom: 2px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.zt-btn {
		padding: 10px 20px;
		border: 1px solid #334155;
		border-radius: 8px;
		background: #0f172a;
		font-size: 17px;
		font-weight: 500;
		cursor: pointer;
		font-family: 'Inter', sans-serif;
		color: #94a3b8;
		transition: all 0.12s;
		white-space: nowrap;
	}

	.zt-btn:hover {
		background: #334155;
		color: #f1f5f9;
	}

	.zt-btn.active {
		border-color: #818cf8;
		background: #312e81;
		color: #818cf8;
	}

	.zt-btn-primary {
		border-color: #4f46e5;
		background: #4f46e5;
		color: white;
	}

	.zt-btn-primary:hover {
		background: #4338ca;
	}

	.zt-btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.zt-btn-danger {
		border-color: #ef4444;
		color: #ef4444;
	}

	.zt-btn-danger:hover {
		background: #7f1d1d;
		color: #fca5a5;
	}

	.zt-row {
		display: flex;
		gap: 4px;
	}

	.zt-input {
		padding: 10px 12px;
		border: 1px solid #334155;
		border-radius: 8px;
		font-size: 17px;
		font-family: 'Inter', sans-serif;
		background: #0f172a;
		color: #e2e8f0;
		width: 100%;
		outline: none;
	}

	.zt-input:focus {
		border-color: #818cf8;
	}

	.zt-confirm-text {
		font-size: 17px;
		font-weight: 500;
		color: #fca5a5;
		text-align: center;
	}

	.zt-cat-chip {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		border: 1px solid #334155;
		border-radius: 8px;
		background: #0f172a;
		font-size: 17px;
		font-weight: 500;
		cursor: pointer;
		font-family: 'Inter', sans-serif;
		color: #94a3b8;
		text-transform: capitalize;
		transition: all 0.12s;
	}

	.zt-cat-chip:hover {
		background: #334155;
		color: #f1f5f9;
	}

	.zt-cat-chip.active {
		border-color: #818cf8;
		background: #312e81;
		color: #818cf8;
	}

	.zt-cat-dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	/* Style panel */

	.zt-style-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.zt-style-label {
		font-size: 15px;
		font-weight: 600;
		color: #64748b;
		text-transform: uppercase;
		width: 56px;
		flex-shrink: 0;
	}

	.zt-swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
		align-items: center;
	}

	.zt-swatch {
		width: 26px;
		height: 26px;
		border-radius: 4px;
		border: 1.5px solid #475569;
		cursor: pointer;
		padding: 0;
		transition: transform 0.1s;
	}

	.zt-swatch:hover {
		transform: scale(1.2);
	}

	.zt-swatch.active {
		border-color: #f1f5f9;
		box-shadow: 0 0 0 1px #f1f5f9;
	}

	.zt-color-input {
		width: 28px;
		height: 26px;
		border: 1.5px solid #475569;
		border-radius: 4px;
		padding: 0;
		background: none;
		cursor: pointer;
	}

	.zt-range {
		flex: 1;
		height: 4px;
		accent-color: #818cf8;
		max-width: 100px;
	}

	.zt-range.sp-range-full {
		max-width: none;
	}

	.zt-range-val {
		font-size: 15px;
		color: #94a3b8;
		width: 36px;
		text-align: right;
	}

	.zt-btn-group {
		display: flex;
		gap: 2px;
	}

	.dialog-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.dialog {
		background: #1e293b;
		border-radius: 12px;
		padding: 24px;
		min-width: 320px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.dialog h3 {
		font-size: 18px;
		font-weight: 700;
		margin-bottom: 16px;
		text-transform: capitalize;
		color: #f1f5f9;
	}

	.dialog label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 12px;
		font-size: 13px;
		font-weight: 500;
		color: #94a3b8;
	}

	.dialog input, .dialog select, .dialog textarea {
		padding: 8px 10px;
		border: 1px solid #334155;
		border-radius: 8px;
		font-size: 14px;
		font-family: 'Inter', sans-serif;
		background: #0f172a;
		color: #e2e8f0;
	}

	.dialog textarea {
		resize: vertical;
	}

	.dialog-actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
		margin-top: 16px;
	}

	.cancel-btn {
		padding: 8px 16px;
		border: 1px solid #334155;
		border-radius: 8px;
		background: #1e293b;
		color: #e2e8f0;
		font-size: 13px;
		cursor: pointer;
		font-family: 'Inter', sans-serif;
	}

	.confirm-btn {
		padding: 8px 16px;
		border: none;
		border-radius: 8px;
		background: #4f46e5;
		color: white;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		font-family: 'Inter', sans-serif;
	}

	.confirm-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.editing-badge {
		font-size: 13px;
		font-weight: 600;
		color: #facc15;
		background: #422006;
		padding: 4px 10px;
		border-radius: 6px;
		border: 1px solid #facc15;
		white-space: nowrap;
	}

	:global(.label-zone) {
		font-weight: 600 !important;
		font-size: 12px !important;
	}

	:global(.label-zone::before) {
		display: none !important;
	}

	:global(.label-area) {
		font-weight: 500 !important;
		font-size: 11px !important;
	}

	:global(.label-area.leaflet-tooltip-top) {
		margin-top: -2px !important;
		transform: translate(0, -100%) !important;
	}

	:global(.label-area::before) {
		display: none !important;
	}

	:global(.label-spot) {
		font-size: 10px !important;
	}

	/* Geocoder FAB styling — lives inside .fab-column */
	:global(.fab-column .leaflet-control-geocoder) {
		border: none !important;
		border-radius: 50% !important;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4) !important;
		background: #1e293b !important;
		overflow: visible !important;
		margin: 0 !important;
		pointer-events: auto;
	}

	:global(.leaflet-control-geocoder.leaflet-control-geocoder-expanded) {
		border-radius: 22px !important;
	}

	:global(.leaflet-control-geocoder-icon) {
		width: 44px !important;
		height: 44px !important;
		background-size: 20px !important;
		background-position: center !important;
		border-radius: 50% !important;
		cursor: pointer !important;
		filter: invert(1) brightness(0.7) !important;
		transition: filter 0.15s !important;
	}

	:global(.leaflet-control-geocoder-icon:hover) {
		filter: invert(1) brightness(1) !important;
	}

	:global(.leaflet-control-geocoder-form input) {
		background: #0f172a !important;
		color: #e2e8f0 !important;
		border: none !important;
		font-size: 14px !important;
		font-family: 'Inter', sans-serif !important;
		height: 44px !important;
		padding: 0 12px !important;
	}

	:global(.leaflet-control-geocoder-alternatives) {
		background: #1e293b !important;
		border: 1px solid #334155 !important;
		border-radius: 8px !important;
		overflow: hidden !important;
	}

	:global(.leaflet-control-geocoder-alternatives a) {
		color: #e2e8f0 !important;
		border-bottom-color: #334155 !important;
		padding: 8px 12px !important;
	}

	:global(.leaflet-control-geocoder-alternatives a:hover) {
		background: #334155 !important;
	}

	:global(.overlay-corner-handle) {
		width: 14px !important;
		height: 14px !important;
		background: #facc15;
		border: 2px solid #ffffff;
		border-radius: 50%;
		cursor: grab;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	}

	:global(.overlay-corner-handle:hover) {
		background: #fbbf24;
		transform: scale(1.3);
	}

	:global(.shape-rotate-handle) {
		width: 32px !important;
		height: 32px !important;
		background: #38bdf8;
		border: 2px solid #ffffff;
		border-radius: 50%;
		cursor: grab;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
		display: flex !important;
		align-items: center;
		justify-content: center;
	}

	:global(.shape-rotate-handle::after) {
		content: '\21BB';
		font-size: 18px;
		color: #ffffff;
		line-height: 1;
	}

	:global(.shape-rotate-handle:hover) {
		background: #0ea5e9;
		transform: scale(1.15);
	}

	:global(.overlay-edge-handle-container) {
		background: transparent !important;
		border: none !important;
		box-shadow: none !important;
	}
	:global(.overlay-edge-handle) {
		width: 30px;
		height: 8px;
		background: #facc15;
		border: 2px solid #ffffff;
		border-radius: 3px;
		cursor: grab;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
		position: absolute;
		top: 50%;
		left: 50%;
		margin-left: -15px;
		margin-top: -4px;
		transform-origin: center;
	}
	:global(.overlay-edge-handle:hover) {
		background: #fbbf24;
	}
	:global(.shape-edge-handle) {
		background: #38bdf8;
		border: 2px solid #ffffff;
		border-radius: 3px;
		cursor: grab;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	}
	:global(.shape-edge-handle:hover) {
		background: #0ea5e9;
		transform: scale(1.2);
	}

</style>
