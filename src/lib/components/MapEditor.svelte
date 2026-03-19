<script lang="ts">
	import { onMount } from 'svelte';
	import type { Venue, Floor, Zone, Area, Spot, ShapeDef, ShapeStyle, POICategory } from '$lib/types.ts';
	import { CATEGORY_COLORS } from '$lib/types.ts';
	import { saveVenue } from '$lib/storage.ts';
	import { createKonvaOverlay, type KonvaOverlayHandle } from '$lib/components/KonvaOverlay.ts';
	import { createGeoConverter, type GeoConverter } from '$lib/geoConvert.ts';

	let {
		venue = $bindable(),
		floorIndex = $bindable(0),
		onreset
	}: {
		venue: Venue;
		floorIndex?: number;
		onreset?: () => void;
	} = $props();

	let mapContainer: HTMLDivElement;
	let map: any;
	let shapeLayers: any[] = [];
	let previewMode = $state(false);
	let overlay: KonvaOverlayHandle | null = null;
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

	// Zone toolbar state
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

	function currentFloor(): Floor {
		return venue.floors[floorIndex];
	}

	function getGeoConverter(): GeoConverter | undefined {
		const floor = currentFloor();
		if (!floor.geoBounds) return undefined;
		return createGeoConverter(floor.geoBounds, floor.width, floor.height);
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
		if (!editingLayer || !map || !mapContainer) {
			toolbarPosition = null;
			return;
		}
		const bounds = editingLayer.getBounds();
		const topCenter = bounds.getNorth
			? (window as any).L.latLng(bounds.getNorth(), (bounds.getWest() + bounds.getEast()) / 2)
			: bounds.getCenter();
		const point = map.latLngToContainerPoint(topCenter);
		const containerRect = mapContainer.getBoundingClientRect();
		// Clamp within map container
		const x = Math.max(120, Math.min(point.x, containerRect.width - 120));
		const y = Math.max(10, point.y - 50);
		toolbarPosition = { x, y };
	}

	function resetToolbarSubState() {
		activeToolbarAction = null;
		renameValue = '';
		deleteConfirming = false;
	}

	function getEditingZone(): Zone | undefined {
		return currentFloor().zones.find(z => z.id === editingZoneId);
	}

	function handleRenameConfirm() {
		const zone = getEditingZone();
		if (zone && renameValue.trim()) {
			zone.name = renameValue.trim();
			venue = { ...venue };
			// Update tooltip on the layer
			if (editingLayer) {
				editingLayer.unbindTooltip();
				editingLayer.bindTooltip(zone.name, { permanent: true, direction: 'center', className: 'label-zone' });
			}
		}
		activeToolbarAction = null;
	}

	function handleCategoryChange(cat: POICategory) {
		const zone = getEditingZone();
		if (zone) {
			zone.category = cat;
			zone.style = defaultStyle('zone', cat);
			venue = { ...venue };
			// Apply new style to layer
			if (editingLayer) {
				editingLayer.setStyle({
					fillColor: zone.style.fill,
					fillOpacity: zone.style.opacity ?? 0.6,
					color: '#facc15',
					weight: 3,
					dashArray: '6 4'
				});
			}
		}
		activeToolbarAction = null;
	}

	function openStyleEditor() {
		const zone = getEditingZone();
		if (zone) {
			styleFill = zone.style.fill;
			styleOpacity = zone.style.opacity ?? 0.85;
			styleStroke = zone.style.stroke ?? '#cbd5e1';
			styleStrokeWidth = zone.style.strokeWidth ?? 1;
		}
		activeToolbarAction = 'style';
	}

	function applyStyleChange() {
		const zone = getEditingZone();
		if (zone && editingLayer) {
			zone.style.fill = styleFill;
			zone.style.opacity = styleOpacity;
			zone.style.stroke = styleStroke;
			zone.style.strokeWidth = styleStrokeWidth;
			editingLayer.setStyle({
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
		if (!editingLayer) return;
		if (resizeActive) {
			// Finalize
			editingLayer.pm.disable();
			let newShape = layerToShapeDef(editingLayer);
			const converter = getGeoConverter();
			if (converter) newShape = converter.shapeToPixel(newShape);
			const zone = getEditingZone();
			if (zone) {
				zone.shape = newShape;
				venue = { ...venue };
			}
			resizeActive = false;
		} else {
			// Enable editing
			editingLayer.pm.enable({ allowSelfIntersection: false });
			resizeActive = true;
		}
	}

	function handleDuplicate() {
		const zone = getEditingZone();
		if (!zone) return;
		const cloned: Zone = JSON.parse(JSON.stringify(zone));
		cloned.id = generateId('zone');
		cloned.name = zone.name + ' (copy)';
		// Offset by 20px
		cloned.shape = applyDelta(cloned.shape, 20, 20);
		for (const area of cloned.areas) {
			area.id = generateId('area');
			area.shape = applyDelta(area.shape, 20, 20);
			for (const spot of area.spots) {
				spot.id = generateId('spot');
				spot.shape = applyDelta(spot.shape, 20, 20);
			}
		}
		const floor = currentFloor();
		floor.zones = [...floor.zones, cloned];
		venue = { ...venue };
		deselectZone();
		renderExistingShapes();
	}

	function handleDelete() {
		const floor = currentFloor();
		floor.zones = floor.zones.filter(z => z.id !== editingZoneId);
		venue = { ...venue };
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
		// Deselect previous without re-rendering
		if (editingLayer && editingLayer !== layer) {
			editingLayer.pm.disableLayerDrag();
			editingLayer.off('pm:dragend');
			if (resizeActive) { editingLayer.pm.disable(); resizeActive = false; }
			const prevZone = currentFloor().zones.find(z => z.id === editingZoneId);
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
		const zone = currentFloor().zones.find(z => z.id === zoneId);
		if (zone) {
			editingOriginalShape = zone.shape.type === 'polygon'
				? { ...zone.shape, points: [...zone.shape.points] }
				: { ...zone.shape };
		}

		layer.setStyle({ weight: 3, dashArray: '6 4', color: '#facc15' });
		layer.pm.enableLayerDrag();
		layer.on('pm:dragstart', () => { isDragging = true; });
		layer.on('pm:dragend', () => handleZoneDragEnd(layer));

		resetToolbarSubState();
		updateToolbarPosition();
	}

	function deselectZone() {
		if (editingLayer) {
			editingLayer.pm.disableLayerDrag();
			editingLayer.off('pm:dragend');
			editingLayer.off('pm:dragstart');
			if (resizeActive) { editingLayer.pm.disable(); resizeActive = false; }
			const prevZone = currentFloor().zones.find(z => z.id === editingZoneId);
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
		toolbarPosition = null;
		isDragging = false;
		resetToolbarSubState();
	}

	function handleZoneDragEnd(layer: any) {
		isDragging = false;
		if (!editingOriginalShape || !editingZoneId) return;

		let newShape = layerToShapeDef(layer);
		const converter = getGeoConverter();
		if (converter) newShape = converter.shapeToPixel(newShape);

		const delta = computeShapeDelta(editingOriginalShape, newShape);

		const floor = currentFloor();
		const zone = floor.zones.find(z => z.id === editingZoneId);
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
			if (resizeActive && editingLayer) {
				editingLayer.pm.disable();
				resizeActive = false;
				// Revert shape on layer from data
				renderExistingShapes();
				return;
			}
			if (activeToolbarAction || deleteConfirming) {
				resetToolbarSubState();
				return;
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
		const floor = currentFloor();

		if (drawLevel === 'zone') {
			const zone: Zone = {
				id: generateId('zone'),
				name,
				category,
				shape: shapeDef,
				style: defaultStyle('zone', category),
				areas: []
			};
			floor.zones = [...floor.zones, zone];
		} else if (drawLevel === 'area') {
			const zone = floor.zones.find(z => z.id === selectedZoneId);
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
			const zone = floor.zones.find(z => z.id === selectedZoneId);
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

		// Clear existing
		for (const sl of shapeLayers) {
			map.removeLayer(sl);
		}
		shapeLayers = [];

		const floor = currentFloor();

		for (const zone of floor.zones) {
			const zoneLayer = shapeDefToLayer(zone.shape, zone.style, zone.name, 'zone', converter);
			if (zoneLayer) {
				zoneLayer.addTo(map);
				shapeLayers.push(zoneLayer);

				// Click to select/deselect zone for dragging
				zoneLayer.on('click', () => {
					zoneClickedFlag = true;
					setTimeout(() => zoneClickedFlag = false, 0);
					if (editingZoneId === zone.id) {
						deselectZone();
					} else {
						selectZoneForDrag(zone.id, zoneLayer);
					}
				});
			}

			for (const area of zone.areas) {
				const areaLayer = shapeDefToLayer(area.shape, area.style, area.name, 'area', converter);
				if (areaLayer) {
					areaLayer.addTo(map);
					shapeLayers.push(areaLayer);
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

		layer.bindTooltip(name, { permanent: level !== 'spot', direction: 'center', className: `label-${level}` });
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

	function handleSave() {
		saveVenue(venue);
	}

	function initMap() {
		const L = (window as any).L;
		const floor = currentFloor();
		const converter = getGeoConverter();

		if (converter && floor.geoBounds) {
			// GPS mode: standard Leaflet CRS with OSM tiles
			map = L.map(mapContainer, {
				minZoom: 2,
				maxZoom: 20,
				zoomSnap: 0,
				zoomDelta: 1,
				wheelPxPerZoomLevel: 20,
				wheelDebounceTime: 0,
				zoomAnimation: false,
				zoomControl: false
			});

			L.control.zoom({ position: 'bottomright' }).addTo(map);

			// Add OpenStreetMap tiles
			L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
				maxZoom: 20
			}).addTo(map);

			const geoBounds = L.latLngBounds(
				[floor.geoBounds.sw[0], floor.geoBounds.sw[1]],
				[floor.geoBounds.ne[0], floor.geoBounds.ne[1]]
			);

			// Semi-transparent floor background rectangle
			floorBackgroundLayer = L.rectangle(geoBounds, {
				color: '#94a3b8',
				weight: 2,
				fillColor: floor.color,
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

			const bounds = [[0, 0], [floor.height, floor.width]];

			setTimeout(() => {
				map.invalidateSize();
				map.fitBounds(bounds);
			}, 0);
			map.fitBounds(bounds);

			floorBackgroundLayer = L.rectangle(bounds, {
				color: '#94a3b8',
				weight: 2,
				fillColor: floor.color,
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

		// Click on map background deselects zone
		map.on('click', () => {
			if (zoneClickedFlag) return;
			if (editingZoneId) deselectZone();
		});

		// Update toolbar position on map move/zoom
		map.on('move zoom zoomend', () => {
			if (editingZoneId) updateToolbarPosition();
		});

		// Deselect zone when starting to draw
		map.on('pm:drawstart', () => {
			if (editingZoneId) deselectZone();
		});

		renderExistingShapes();

		// Create Konva overlay (initially hidden)
		overlay?.destroy();
		const allCategories = new Set<POICategory>(['food', 'attraction', 'shop', 'restroom', 'info', 'gate', 'security']);
		overlay = createKonvaOverlay(mapContainer, map, floor, allCategories, converter);
		previewMode = false;
	}

	function togglePreview() {
		previewMode = !previewMode;
		if (previewMode) {
			deselectZone();
			// Update overlay with latest data, then show it
			const allCategories = new Set<POICategory>(['food', 'attraction', 'shop', 'restroom', 'info', 'gate', 'security']);
			overlay?.update(currentFloor(), allCategories);
			overlay?.show();
			// Hide Leaflet shape layers
			for (const sl of shapeLayers) {
				sl.setStyle({ opacity: 0, fillOpacity: 0 });
				if (sl.getTooltip()) sl.closeTooltip();
			}
			// Disable geoman drawing
			map.pm.disableDraw();
			map.pm.removeControls();
		} else {
			overlay?.hide();
			// Restore Leaflet shape layers
			renderExistingShapes();
			// Re-enable geoman controls
			map.pm.addControls({
				position: 'bottomright',
				drawCircleMarker: false,
				drawMarker: false,
				drawPolyline: false,
				drawText: false,
				cutPolygon: false,
				rotateMode: false
			});
		}
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
			overlay?.destroy();
			overlay = null;
			map?.remove();
		};
	});

	$effect(() => {
		const _fi = floorIndex;
		const _vid = venue.id;
		if (map) {
			overlay?.destroy();
			overlay = null;
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
			<div class="toolbar-sep"></div>
			<div class="toolbar-group">
				{#each venue.floors as floor, i}
					<button class="tb-btn" class:active={floorIndex === i} onclick={() => floorIndex = i}>
						{floor.name}
					</button>
				{/each}
			</div>
			<div class="toolbar-spacer"></div>
			<button class="tb-btn preview-btn" class:active={previewMode} onclick={togglePreview}>
				{previewMode ? 'Edit' : 'Preview'}
			</button>
			<button class="save-btn" onclick={handleSave}>Save</button>
			{#if onreset}
				<button class="reset-btn" onclick={onreset}>Reset</button>
			{/if}
		</div>
		<div class="toolbar-row">
			<span class="toolbar-label">Draw:</span>
			<div class="toolbar-group">
				<button class="tb-btn" class:active={drawLevel === 'zone'} onclick={() => drawLevel = 'zone'}>Zone</button>
				<button class="tb-btn" class:active={drawLevel === 'area'} onclick={() => drawLevel = 'area'}>Area</button>
				<button class="tb-btn" class:active={drawLevel === 'spot'} onclick={() => drawLevel = 'spot'}>Spot</button>
			</div>
			{#if drawLevel === 'area' || drawLevel === 'spot'}
				<div class="toolbar-sep"></div>
				<span class="toolbar-label">in Zone:</span>
				<select class="tb-select" bind:value={selectedZoneId}>
					<option value="">-- select --</option>
					{#each currentFloor().zones as zone}
						<option value={zone.id}>{zone.name}</option>
					{/each}
				</select>
			{/if}
			{#if editingZoneId}
				<div class="toolbar-sep"></div>
				<span class="editing-badge">
					Moving: {currentFloor().zones.find(z => z.id === editingZoneId)?.name ?? ''}
				</span>
			{/if}
			{#if drawLevel === 'spot' && selectedZoneId}
				{@const parentZone = currentFloor().zones.find(z => z.id === selectedZoneId)}
				{#if parentZone}
					<span class="toolbar-label">in Area:</span>
					<select class="tb-select" bind:value={selectedAreaId}>
						<option value="">-- select --</option>
						{#each parentZone.areas as area}
							<option value={area.id}>{area.name}</option>
						{/each}
					</select>
				{/if}
			{/if}
		</div>
	</div>

	<div class="map-area-wrapper">
		<div class="map-area" bind:this={mapContainer}></div>

		{#if toolbarPosition && editingZoneId && !isDragging && !previewMode}
			{@const editingZone = getEditingZone()}
			{#if editingZone}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					class="zone-toolbar"
					style="left: {toolbarPosition.x}px; top: {toolbarPosition.y}px;"
					onmousedown={(e) => e.stopPropagation()}
					onclick={(e) => e.stopPropagation()}
				>
					<div class="zone-toolbar-arrow"></div>

					{#if deleteConfirming}
						<div class="zt-confirm">
							<span class="zt-confirm-text">Delete {editingZone.name}?</span>
							<button class="zt-btn zt-btn-danger" onclick={handleDelete}>Yes</button>
							<button class="zt-btn" onclick={() => deleteConfirming = false}>No</button>
						</div>
					{:else if activeToolbarAction === 'rename'}
						<div class="zt-inline">
							<!-- svelte-ignore a11y_autofocus -->
							<input
								class="zt-input"
								type="text"
								bind:value={renameValue}
								placeholder="Zone name..."
								autofocus
							/>
							<button class="zt-btn zt-btn-primary" onclick={handleRenameConfirm} disabled={!renameValue.trim()}>OK</button>
							<button class="zt-btn" onclick={() => activeToolbarAction = null}>Cancel</button>
						</div>
					{:else if activeToolbarAction === 'category'}
						<div class="zt-category-picker">
							{#each categories as cat}
								<button
									class="zt-cat-chip"
									class:active={editingZone.category === cat}
									onclick={() => handleCategoryChange(cat)}
								>
									<span class="zt-cat-dot" style="background: {CATEGORY_COLORS[cat]}"></span>
									{cat}
								</button>
							{/each}
						</div>
					{:else if activeToolbarAction === 'style'}
						<div class="zt-style-panel">
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
							<div class="zt-style-actions">
								<button class="zt-btn zt-btn-primary" onclick={handleStyleConfirm}>Done</button>
							</div>
						</div>
					{:else}
						<button class="zt-btn" onclick={() => { renameValue = editingZone.name; activeToolbarAction = 'rename'; }}>Rename</button>
						<button class="zt-btn" onclick={() => activeToolbarAction = 'category'}>Category</button>
						<button class="zt-btn" onclick={openStyleEditor}>Style</button>
						<button class="zt-btn" class:active={resizeActive} onclick={toggleResize}>Resize</button>
						<button class="zt-btn" onclick={handleDuplicate}>Dup</button>
						<button class="zt-btn zt-btn-danger" onclick={() => deleteConfirming = true}>✕</button>
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
		gap: 8px;
		padding: 5px 12px;
	}

	.toolbar-row:first-child {
		border-bottom: 1px solid #334155;
	}

	.venue-name {
		font-size: 14px;
		font-weight: 700;
		color: #f1f5f9;
		white-space: nowrap;
	}

	.toolbar-label {
		font-size: 11px;
		font-weight: 600;
		color: #64748b;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.toolbar-group {
		display: flex;
		gap: 3px;
	}

	.toolbar-sep {
		width: 1px;
		height: 20px;
		background: #334155;
	}

	.toolbar-spacer {
		flex: 1;
	}

	.tb-btn {
		padding: 4px 10px;
		border: 1.5px solid #334155;
		border-radius: 6px;
		background: #1e293b;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		font-family: 'Inter', sans-serif;
		color: #94a3b8;
		transition: all 0.15s;
		white-space: nowrap;
	}

	.tb-btn.active {
		border-color: #818cf8;
		background: #312e81;
		color: #818cf8;
	}

	.tb-select {
		padding: 4px 8px;
		border: 1px solid #334155;
		border-radius: 6px;
		font-size: 12px;
		font-family: 'Inter', sans-serif;
		background: #0f172a;
		color: #e2e8f0;
		max-width: 160px;
	}

	.preview-btn.active {
		border-color: #10b981;
		background: #064e3b;
		color: #34d399;
	}

	.save-btn {
		padding: 4px 14px;
		background: #4f46e5;
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		font-family: 'Inter', sans-serif;
	}

	.save-btn:hover {
		background: #4338ca;
	}

	.reset-btn {
		padding: 4px 10px;
		border: 1px solid #fca5a5;
		border-radius: 6px;
		background: #1e293b;
		color: #ef4444;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		font-family: 'Inter', sans-serif;
	}

	.reset-btn:hover {
		background: #451a1a;
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
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 4px;
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 8px;
		padding: 4px 6px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
		white-space: nowrap;
		pointer-events: auto;
	}

	.zone-toolbar-arrow {
		position: absolute;
		bottom: -6px;
		left: 50%;
		transform: translateX(-50%) rotate(45deg);
		width: 10px;
		height: 10px;
		background: #1e293b;
		border-right: 1px solid #334155;
		border-bottom: 1px solid #334155;
	}

	.zt-btn {
		padding: 3px 8px;
		border: 1px solid #334155;
		border-radius: 5px;
		background: #0f172a;
		font-size: 11px;
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

	.zt-inline {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.zt-input {
		padding: 3px 6px;
		border: 1px solid #334155;
		border-radius: 5px;
		font-size: 11px;
		font-family: 'Inter', sans-serif;
		background: #0f172a;
		color: #e2e8f0;
		width: 140px;
		outline: none;
	}

	.zt-input:focus {
		border-color: #818cf8;
	}

	.zt-confirm {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.zt-confirm-text {
		font-size: 11px;
		font-weight: 500;
		color: #fca5a5;
	}

	.zt-category-picker {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
		max-width: 320px;
	}

	.zt-cat-chip {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 3px 8px;
		border: 1px solid #334155;
		border-radius: 5px;
		background: #0f172a;
		font-size: 11px;
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
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	/* Style panel */
	.zt-style-panel {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 260px;
	}

	.zt-style-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.zt-style-label {
		font-size: 10px;
		font-weight: 600;
		color: #64748b;
		text-transform: uppercase;
		width: 42px;
		flex-shrink: 0;
	}

	.zt-swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
		align-items: center;
	}

	.zt-swatch {
		width: 16px;
		height: 16px;
		border-radius: 3px;
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
		width: 20px;
		height: 16px;
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
		font-size: 10px;
		color: #94a3b8;
		width: 28px;
		text-align: right;
	}

	.zt-btn-group {
		display: flex;
		gap: 2px;
	}

	.zt-style-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 2px;
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
		font-size: 11px;
		font-weight: 600;
		color: #facc15;
		background: #422006;
		padding: 2px 8px;
		border-radius: 4px;
		border: 1px solid #facc15;
		white-space: nowrap;
	}

	:global(.label-zone) {
		font-weight: 600 !important;
		font-size: 12px !important;
	}

	:global(.label-area) {
		font-weight: 500 !important;
		font-size: 11px !important;
	}

	:global(.label-spot) {
		font-size: 10px !important;
	}
</style>
