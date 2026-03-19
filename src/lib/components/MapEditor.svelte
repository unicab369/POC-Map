<script lang="ts">
	import { onMount } from 'svelte';
	import type { Venue, Zone, Area, Spot, ShapeDef, ShapeStyle, POICategory } from '$lib/types.ts';
	import { CATEGORY_COLORS } from '$lib/types.ts';
	import { createGeoConverter, type GeoConverter } from '$lib/geoConvert.ts';

	let {
		venue = $bindable(),
	}: {
		venue: Venue;
	} = $props();

	let mapContainer: HTMLDivElement;
	let map: any;
	let shapeLayers: any[] = [];
	let floorBackgroundLayer: any = null;

	type DrawLevel = 'zone' | 'area' | 'spot';
	let drawLevel = $state<DrawLevel>('zone');
	let selectedZoneId = $state<string>('');
	let selectedAreaId = $state<string>('');
	let showDialog = $state(false);
	let pendingLayer = $state<any>(null);
	let dialogName = $state('');
	let dialogCategory = $state<POICategory>('info');
	let dialogDescription = $state('');

	// Zone drag-to-move state
	let editingZoneId = $state<string>('');
	let editingLayer: any = null;
	let editingOriginalShape: ShapeDef | null = null;
	let zoneClickedFlag = false;

	// Toolbar selection state (works for both zones and areas)
	type EditingTarget = { type: 'zone'; zoneId: string } | { type: 'area'; zoneId: string; areaId: string };
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

	/** Returns the zone or area entity currently selected by the toolbar */
	function getEditingEntity(): (Zone | Area) | undefined {
		if (!editingTarget) return undefined;
		const zone = venue.zones.find(z => z.id === editingTarget!.zoneId);
		if (!zone) return undefined;
		if (editingTarget.type === 'zone') return zone;
		return zone.areas.find(a => a.id === editingTarget!.areaId);
	}

	function getEditingEntityLevel(): DrawLevel {
		return editingTarget?.type === 'area' ? 'area' : 'zone';
	}

	function getEditingEntityLabelClass(): string {
		return editingTarget?.type === 'area' ? 'label-area' : 'label-zone';
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
		} else {
			const zone = venue.zones.find(z => z.id === editingTarget!.zoneId);
			if (!zone) return;
			const area = zone.areas.find(a => a.id === editingTarget!.areaId);
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
		} else {
			const zone = venue.zones.find(z => z.id === editingTarget!.zoneId);
			if (zone) {
				zone.areas = zone.areas.filter(a => a.id !== editingTarget!.areaId);
			}
		}
		venue = { ...venue };
		deselectEntity();
		deselectZone();
		renderExistingShapes();
	}

	const colorSwatches = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#1e293b', '#ffffff', '#fbbf24'];

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
				// If an area is selected (not via zone drag), just deselect entity
				if (editingTarget.type === 'area') {
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

		for (const zone of venue.zones) {
			const zoneLayer = shapeDefToLayer(zone.shape, zone.style, zone.name, 'zone', converter);
			if (zoneLayer) {
				zoneLayer.addTo(map);
				shapeLayers.push(zoneLayer);

				const handleZoneClick = () => {
					zoneClickedFlag = true;
					setTimeout(() => zoneClickedFlag = false, 0);
					if (editingZoneId === zone.id) {
						deselectZone();
					} else {
						selectZoneForDrag(zone.id, zoneLayer);
					}
				};

				zoneLayer.on('click', handleZoneClick);
				makeTooltipClickable(zoneLayer, handleZoneClick);
			}

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
			layer.bindTooltip(name, { permanent: true, direction: 'right', className: 'label-area', offset: [6, -6] });
			layer.on('add', function () {
				const bounds = this.getBounds();
				const bottomLeft = converter ? bounds.getSouthWest() : bounds.getNorthWest();
				if (this.getTooltip()) {
					this.getTooltip().setLatLng(bottomLeft);
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
			L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
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
					position: 'topright',
					placeholder: 'Search for a place...',
					collapsed: true
				});
				geocoder.on('markgeocode', (e: any) => {
					const bbox = e.geocode.bbox;
					map.fitBounds(bbox);
				});
				geocoder.addTo(map);
			}

			// Add "back to venue" button
			const BackControl = L.Control.extend({
				options: { position: 'topright' },
				onAdd() {
					const btn = L.DomUtil.create('div', 'leaflet-bar leaflet-control back-to-venue-btn');
					btn.innerHTML = '<a href="#" title="Back to venue bounds" role="button" aria-label="Back to venue bounds">&#8962;</a>';
					btn.onclick = (e: Event) => {
						e.preventDefault();
						e.stopPropagation();
						map.flyToBounds(geoBounds, { duration: 0.8 });
					};
					L.DomEvent.disableClickPropagation(btn);
					return btn;
				}
			});
			new BackControl().addTo(map);

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

		// Enable geoman controls
		map.pm.addControls({
			position: 'bottomright',
			drawCircleMarker: false,
			drawMarker: false,
			drawPolyline: false,
			drawText: false,
			cutPolygon: false,
			rotateMode: false
		});

		// Listen for shape creation
		map.on('pm:create', (e: any) => {
			pendingLayer = e.layer;
			showDialog = true;
		});

		// Click on map background deselects zone/area
		map.on('click', () => {
			if (zoneClickedFlag) return;
			if (editingTarget) deselectEntity();
			if (editingZoneId) deselectZone();
		});

		// Update toolbar position on map move/zoom
		map.on('move zoom zoomend', () => {
			if (editingTarget) updateToolbarPosition();
		});

		// Deselect zone/area when starting to draw
		map.on('pm:drawstart', () => {
			if (editingTarget) deselectEntity();
			if (editingZoneId) deselectZone();
		});

		renderExistingShapes();
	}

	onMount(() => {
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

	$effect(() => {
		const _vid = venue.id;
		if (map) {
			map.remove();
			initMap();
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="editor-wrapper">
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

	<div class="map-area-wrapper">
		<div class="map-area" bind:this={mapContainer}></div>

		{#if toolbarPosition && editingTarget && !isDragging}
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
					<span class="zt-title">{editingTarget.type === 'area' ? 'Area' : 'Zone'}: {editingEntity.name}</span>
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
						<button class="zt-btn" onclick={() => { renameValue = editingEntity.name; activeToolbarAction = 'rename'; }}>Rename</button>
						<button class="zt-btn" onclick={() => activeToolbarAction = 'category'}>Category</button>
						<button class="zt-btn" onclick={openStyleEditor}>Style</button>
						<button class="zt-btn" class:active={resizeActive} onclick={toggleResize}>Resize</button>
						<button class="zt-btn" onclick={handleDuplicate}>Duplicate</button>
						<button class="zt-btn zt-btn-danger" onclick={() => deleteConfirming = true}>Delete</button>
					{/if}
				</div>
			{/if}
		{/if}
	</div>

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
		border: none;
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

	:global(.back-to-venue-btn a) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		font-size: 20px;
		line-height: 30px;
		text-decoration: none;
		color: #333;
		cursor: pointer;
	}

	:global(.back-to-venue-btn a:hover) {
		background: #f4f4f4;
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

	:global(.label-area::before) {
		display: none !important;
	}

	:global(.label-spot) {
		font-size: 10px !important;
	}
</style>
