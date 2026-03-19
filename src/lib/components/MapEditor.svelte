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

	<div class="map-area" bind:this={mapContainer}></div>

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

	.map-area {
		flex: 1;
		min-height: 0;
		min-width: 0;
		background: #0f172a;
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
