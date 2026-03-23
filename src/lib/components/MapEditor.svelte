<script lang="ts">
	import { onMount } from 'svelte';
	import type { Venue, Zone, Area, Spot, ShapeDef, ShapeStyle, POICategory, EditingTarget } from '$lib/types.ts';
	import { CATEGORY_COLORS } from '$lib/types.ts';
	import { createGeoConverter, type GeoConverter } from '$lib/geoConvert.ts';
	import { saveOverlay, loadOverlay, clearOverlayStorage } from '$lib/storage.ts';

	let {
		venue = $bindable(),
		initialEditTarget = null,
		oneditchange = (_target: EditingTarget | null) => {},
	}: {
		venue: Venue;
		initialEditTarget?: EditingTarget | null;
		oneditchange?: (target: EditingTarget | null) => void;
	} = $props();

	let mapContainer: HTMLDivElement;
	let fabColumnEl: HTMLDivElement;
	let map: any;
	let shapeLayers: any[] = [];
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
	// Area layer lookup (areaId → Leaflet layer)
	let areaLayerMap = new Map<string, any>();

	// Suppress moveend view saves during zone switching
	let suppressViewSave = false;


	// Zone drag-to-move state
	let editingZoneId = $state<string>('');
	let editingLayer: any = null;
	let editingOriginalShape: ShapeDef | null = null;
	let zoneClickedFlag = false;
	let spotClickedFlag = false;

	// Toolbar selection state (works for both zones and areas)
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

	// Remove confirm states
	let removeAreaConfirming = $state(false);
	let removeZoneConfirming = $state(false);

	// Redraw shape state
	let redrawActive = $state(false);
	let redrawOriginalLayer: any = null;
	let redrawUndoneVertices = $state<any[]>([]); // stack of undone vertex latlngs for redo
	let redrawVertexCount = $state(0); // track placed vertex count for undo button state
	let redrawIsRedoing = false; // flag to prevent onRedrawVertexAdded from clearing redo stack
	let redrawRestarting = false; // flag to prevent pm:drawend from cancelling during undo/redo restart
	let redrawEntity: (Zone | Area | Spot) | null = null; // entity being redrawn in-place (when not editModeEntity)

	// Shape toolbox popover state
	let shapeToolboxPanel = $state<'fill' | 'stroke' | null>(null);

	// Side panel color popup state
	let spColorPopup = $state<'fill' | 'stroke' | null>(null);

	// Label placement state
	let placingLabel = $state(false);
	let labelMarker: any = null; // draggable label marker in edit mode

	// Add-spot-in-edit-mode state
	let addingSpot = $state(false);
	let addSpotName = $state('');
	let addSpotDrawing = $state(false); // true when polygon draw is active

	// Add-area-in-edit-mode state
	let addingArea = $state(false);
	let addAreaName = $state('');
	let addAreaDrawing = $state(false);

	// Sub-editing: when editing a zone, drill into an area without changing the canvas
	let editPanelAreaId = $state<string>('');
	let editPanelSpotId = $state<string>('');
	let spotLayerMap = new Map<string, any>();
	let removeSpotConfirming = $state(false);

	// Relocate zone state
	let relocatingZoneId = $state<string>('');

	// Original shape snapshot for reset
	let editModeOriginalShapes: any = null;
	// Full entity snapshot for discard (X button)
	let editModeOriginalEntity: any = null;

	// Undo/redo history
	let undoStack = $state<any[]>([]);
	let redoStack = $state<any[]>([]);
	let canUndo = $derived(undoStack.length > 0);
	let canRedo = $derived(redoStack.length > 0);

	// Derived: any polygon draw mode is active (redraw, add area, add spot)
	let isDrawingPolygon = $derived(redrawActive || addAreaDrawing || addSpotDrawing);

	// Edit mode map visibility (persisted)
	let editModeShowMap = $state(false);

	// Vertex circle size (persisted)
	let vertexSize = $state(20);

	// Selected vertex state (for delete button)
	let selectedVertexMarker = $state<any>(null);

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
			return { fill: CATEGORY_COLORS[category], opacity: 0.8, stroke: '#cbd5e1', strokeWidth: 1 };
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

		// Use a simple flag — the toolbar uses CSS bottom/left positioning
		toolbarPosition = { x: 0, y: 0 };
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

	function startRelocateZone() {
		if (!editingTarget || editingTarget.type !== 'zone') return;
		relocatingZoneId = editingTarget.zoneId;
		deselectEntity();
		deselectZone();
		renderExistingShapes();
		mapContainer.style.cursor = 'crosshair';
	}

	function handleRelocateClick(e: any) {
		if (!relocatingZoneId) return;
		const zone = venue.zones.find(z => z.id === relocatingZoneId);
		if (!zone) { relocatingZoneId = ''; return; }

		const converter = getGeoConverter();
		const clickPos = converter
			? converter.latLngToPixel(e.latlng.lat, e.latlng.lng)
			: { x: e.latlng.lng, y: e.latlng.lat };

		// Compute current zone center in pixel coords
		let cx: number, cy: number;
		if (zone.shape.type === 'rect') {
			cx = zone.shape.x + zone.shape.width / 2;
			cy = zone.shape.y + zone.shape.height / 2;
		} else if (zone.shape.type === 'circle') {
			cx = zone.shape.x;
			cy = zone.shape.y;
		} else {
			let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
			for (let i = 0; i < zone.shape.points.length; i += 2) {
				minX = Math.min(minX, zone.shape.points[i]);
				maxX = Math.max(maxX, zone.shape.points[i]);
				minY = Math.min(minY, zone.shape.points[i + 1]);
				maxY = Math.max(maxY, zone.shape.points[i + 1]);
			}
			cx = (minX + maxX) / 2;
			cy = (minY + maxY) / 2;
		}

		const dx = clickPos.x - cx;
		const dy = clickPos.y - cy;

		zone.shape = applyDelta(zone.shape, dx, dy);
		if (zone.labelPosition) {
			zone.labelPosition = { x: zone.labelPosition.x + dx, y: zone.labelPosition.y + dy };
		}
		for (const area of zone.areas) {
			area.shape = applyDelta(area.shape, dx, dy);
			if (area.labelPosition) {
				area.labelPosition = { x: area.labelPosition.x + dx, y: area.labelPosition.y + dy };
			}
			for (const spot of area.spots) {
				spot.shape = applyDelta(spot.shape, dx, dy);
			}
		}

		venue = { ...venue };
		relocatingZoneId = '';
		mapContainer.style.cursor = '';
		renderExistingShapes();
	}

	function handleDelete() {
		if (!editingTarget) return;
		const wasInEditMode = editMode;
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
		if (wasInEditMode) {
			renderEditModeShapes();
		} else {
			deselectZone();
			renderExistingShapes();
		}
	}

	function removeAreaInEdit(zoneId: string, areaId: string) {
		pushUndoSnapshot();
		const zone = venue.zones.find(z => z.id === zoneId);
		if (!zone) return;
		const area = zone.areas.find(a => a.id === areaId);
		if (!area) return;

		// Move spots to an "Unassigned" area
		if (area.spots.length > 0) {
			let unassigned = zone.areas.find(a => a.name === 'Unassigned');
			if (!unassigned) {
				unassigned = {
					id: generateId('area'),
					name: 'Unassigned',
					category: 'info' as POICategory,
					shape: { type: 'polygon', points: [] },
					style: defaultStyle('area', 'info'),
					spots: []
				};
				zone.areas.push(unassigned);
			}
			unassigned.spots.push(...area.spots);
		}

		// Remove the area
		zone.areas = zone.areas.filter(a => a.id !== areaId);
		venue = { ...venue };
		removeAreaConfirming = false;

		// If we're in panelArea sub-view, just go back to zone panel
		if (editModeTarget?.type === 'zone') {
			clearPanelArea();
			renderEditModeShapes();
		} else {
			// Direct area edit — navigate back to zone edit
			switchToEditTarget({ type: 'zone', zoneId });
		}
	}

	function removeZoneInEdit(zoneId: string) {
		venue.zones = venue.zones.filter(z => z.id !== zoneId);
		venue = { ...venue };
		removeZoneConfirming = false;
		exitEditMode(false);
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
				shape: zone.shape, style: zone.style, name: zone.name,
				labelPosition: zone.labelPosition,
				areas: zone.areas.map(a => ({
					id: a.id, name: a.name, category: a.category, shape: a.shape, style: a.style, labelPosition: a.labelPosition,
					spots: a.spots.map(s => ({ id: s.id, name: s.name, description: s.description, category: s.category, shape: s.shape, style: s.style }))
				}))
			}));
		} else if (target.type === 'area') {
			const area = zone.areas.find(a => a.id === target.areaId);
			if (!area) return null;
			return JSON.parse(JSON.stringify({
				name: area.name, category: area.category, shape: area.shape, style: area.style,
				labelPosition: area.labelPosition,
				spots: area.spots.map(s => ({ id: s.id, name: s.name, description: s.description, category: s.category, shape: s.shape, style: s.style }))
			}));
		} else {
			const area = zone.areas.find(a => a.id === target.areaId);
			const spot = area?.spots.find(s => s.id === target.spotId);
			if (!spot) return null;
			return JSON.parse(JSON.stringify({ name: spot.name, description: spot.description, category: spot.category, shape: spot.shape, style: spot.style }));
		}
	}

	function resetEditModeShapes() {
		if (!editModeTarget || !editModeOriginalShapes) return;
		const zone = venue.zones.find(z => z.id === editModeTarget.zoneId);
		if (!zone) return;

		if (editModeTarget.type === 'zone') {
			zone.shape = editModeOriginalShapes.shape;
			zone.labelPosition = editModeOriginalShapes.labelPosition;
			for (const aSnap of editModeOriginalShapes.areas) {
				const area = zone.areas.find(a => a.id === aSnap.id);
				if (area) {
					area.shape = aSnap.shape;
					area.labelPosition = aSnap.labelPosition;
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
				area.labelPosition = editModeOriginalShapes.labelPosition;
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
		enterEditModeForTarget({ ...editingTarget } as EditingTarget);
	}

	function enterEditModeForTarget(target: EditingTarget) {
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
		oneditchange(target);

		// Snapshot original shapes for reset
		editModeOriginalShapes = snapshotEditModeShapes(target);
		// Snapshot full entity for discard
		editModeOriginalEntity = JSON.parse(JSON.stringify(entity));
		undoStack = [];
		redoStack = [];

		// Hide Geoman drawing controls (not useful in edit mode)
		map.pm.removeControls();

		// Initialize side panel state from entity
		panelName = entity.name;
		panelCategory = 'category' in entity ? entity.category : 'info';
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
		}

		// Clear all shape layers
		for (const sl of shapeLayers) {
			map.removeLayer(sl);
		}
		shapeLayers = [];

		// Render only the target entity
		renderEditModeShapes();

		// Restore saved overlay
		const savedOverlay = loadOverlay(editModeTarget.zoneId);
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
		if (addSpotDrawing || addAreaDrawing) return;
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
				selectedVertexMarker = null;
				hookVertexMarkerClicks();
			});

			setupShapeDragOnPath();
			createShapeRotateMarker();
			createShapeEdgeMarkers();
			hookVertexMarkerClicks();
		} else if (item === 'overlay') {
			createOverlaySelectionRect();
			createOverlayCornerMarkers();
		}
		editModeSelection = item;
	}

	// ── Vertex selection (for delete button) ──

	function hookVertexMarkerClicks() {
		if (!editModeLayer) return;
		selectedVertexMarker = null;
		// Geoman stores vertex markers in layer.pm._markers (array of rings, each an array of markers)
		const markerGroups = editModeLayer.pm?._markers;
		if (!markerGroups) return;
		const markers = Array.isArray(markerGroups[0]) ? markerGroups[0] : markerGroups;
		for (const m of markers) {
			if (!m || !m.on) continue;
			m.on('click', () => {
				selectedVertexMarker = m;
				highlightSelectedVertex(m);
			});
		}
	}

	function highlightSelectedVertex(marker: any) {
		// Reset all vertex marker styles, highlight the selected one
		const markerGroups = editModeLayer?.pm?._markers;
		if (!markerGroups) return;
		const markers = Array.isArray(markerGroups[0]) ? markerGroups[0] : markerGroups;
		for (const m of markers) {
			const el = m?._icon;
			if (!el) continue;
			el.style.outline = m === marker ? '3px solid #ef4444' : '';
			el.style.outlineOffset = m === marker ? '2px' : '';
		}
	}

	function deleteSelectedVertex() {
		if (!selectedVertexMarker || !editModeLayer) return;
		const latlngs = editModeLayer.getLatLngs()[0];
		if (!latlngs || latlngs.length <= 3) return; // need at least 3 vertices for a polygon

		// Find the index of the selected vertex
		const markerGroups = editModeLayer.pm._markers;
		const markers = Array.isArray(markerGroups[0]) ? markerGroups[0] : markerGroups;
		const idx = markers.indexOf(selectedVertexMarker);
		if (idx === -1) return;

		// Remove the vertex
		latlngs.splice(idx, 1);
		editModeLayer.setLatLngs([latlngs]);

		// Re-enable pm to refresh vertex markers
		editModeLayer.pm.disable();
		editModeLayer.pm.enable({ allowSelfIntersection: false });

		selectedVertexMarker = null;

		// Re-hook vertex clicks on new markers
		hookVertexMarkerClicks();

		// Update handles + save
		const p = getShapeRotateHandlePos();
		if (p && shapeRotateMarker) shapeRotateMarker.setLatLng(p);
		repositionShapeEdgeMarkers();
		saveEditModeShapesToData();
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
					hookVertexMarkerClicks();
				}
				selectedVertexMarker = null;
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
			selectedVertexMarker = null;
			hookVertexMarkerClicks();
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

	function snapshotOverlayState(): any {
		if (!overlayLayer) {
			return { hasOverlay: false, imageUrl: overlayImageUrl, opacity: overlayOpacity, rotation: overlayRotation, bounds: null };
		}
		const b = overlayLayer.getBounds();
		return {
			hasOverlay: true,
			imageUrl: overlayImageUrl,
			opacity: overlayOpacity,
			rotation: overlayRotation,
			bounds: [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]]
		};
	}

	function pushUndoSnapshot() {
		if (!editModeTarget) return;
		const snap = snapshotEditModeShapes(editModeTarget);
		if (snap) {
			snap.overlay = snapshotOverlayState();
			undoStack.push(snap);
			undoStack = undoStack; // trigger reactivity
			redoStack = [];
		}
	}

	function applySnapshot(snap: any) {
		if (!editModeTarget) return;
		const zone = venue.zones.find(z => z.id === editModeTarget.zoneId);
		if (!zone) return;

		if (editModeTarget.type === 'zone') {
			zone.shape = snap.shape;
			zone.style = snap.style ?? zone.style;
			zone.name = snap.name ?? zone.name;
			zone.labelPosition = snap.labelPosition;
			// Restore full area+spot list from snapshot (handles add/remove)
			if (snap.areas) {
				zone.areas = snap.areas.map((aSnap: any) => {
					const existing = zone.areas.find((a: any) => a.id === aSnap.id);
					return {
						...(existing || {}),
						id: aSnap.id, name: aSnap.name, category: aSnap.category,
						shape: aSnap.shape, style: aSnap.style, labelPosition: aSnap.labelPosition,
						spots: (aSnap.spots || []).map((sSnap: any) => {
							const existingSpot = existing?.spots.find((s: any) => s.id === sSnap.id);
							return {
								...(existingSpot || {}),
								id: sSnap.id, name: sSnap.name, description: sSnap.description,
								category: sSnap.category, shape: sSnap.shape, style: sSnap.style
							};
						})
					};
				});
			}
		} else if (editModeTarget.type === 'area') {
			const area = zone.areas.find((a: any) => a.id === (editModeTarget as any).areaId);
			if (area) {
				area.shape = snap.shape;
				area.style = snap.style ?? area.style;
				area.name = snap.name ?? area.name;
				area.category = snap.category ?? area.category;
				area.labelPosition = snap.labelPosition;
				// Restore full spot list from snapshot (handles add/remove)
				if (snap.spots) {
					area.spots = snap.spots.map((sSnap: any) => {
						const existing = area.spots.find((s: any) => s.id === sSnap.id);
						return {
							...(existing || {}),
							id: sSnap.id, name: sSnap.name, description: sSnap.description,
							category: sSnap.category, shape: sSnap.shape, style: sSnap.style
						};
					});
				}
			}
		} else {
			const area = zone.areas.find((a: any) => a.id === (editModeTarget as any).areaId);
			const spot = area?.spots.find((s: any) => s.id === (editModeTarget as any).spotId);
			if (spot) {
				spot.shape = snap.shape;
				spot.style = snap.style ?? spot.style;
				spot.name = snap.name ?? spot.name;
				spot.description = snap.description ?? spot.description;
				spot.category = snap.category ?? spot.category;
			}
		}

		venue = { ...venue };
		deselectEditModeItem();
		renderEditModeShapes();

		// Sync panel state vars with restored entity
		const entity = getEditModeEntity();
		if (entity) {
			panelName = entity.name;
			panelFill = entity.style.fill;
			panelOpacity = entity.style.opacity ?? 0.85;
			panelStroke = entity.style.stroke ?? '#cbd5e1';
			panelStrokeWidth = entity.style.strokeWidth ?? 1;
			if ('category' in entity) panelCategory = (entity as any).category;
			if ('description' in entity) panelDescription = (entity as any).description ?? '';
		}

		// Restore overlay state if present in snapshot
		if (snap.overlay) {
			if (editModeSelection === 'overlay') editModeSelection = null;
			if (snap.overlay.hasOverlay && snap.overlay.bounds) {
				overlayOpacity = snap.overlay.opacity;
				overlayRotation = snap.overlay.rotation;
				overlayImageUrl = snap.overlay.imageUrl;
				removeOverlayFromMap();
				addOverlayToMap(snap.overlay.bounds);
				persistOverlay();
			} else if (!snap.overlay.hasOverlay) {
				removeOverlayFromMap();
				overlayImageUrl = '';
				overlayOpacity = 0.5;
				overlayRotation = 0;
				clearOverlayStorage(venue.id);
			}
		}
	}

	function undo() {
		if (!editModeTarget || undoStack.length === 0) return;
		const currentSnap = snapshotEditModeShapes(editModeTarget);
		if (currentSnap) {
			currentSnap.overlay = snapshotOverlayState();
			redoStack.push(currentSnap);
			redoStack = redoStack;
		}
		const snap = undoStack.pop()!;
		undoStack = undoStack;
		applySnapshot(snap);
	}

	function redo() {
		if (!editModeTarget || redoStack.length === 0) return;
		const currentSnap = snapshotEditModeShapes(editModeTarget);
		if (currentSnap) {
			currentSnap.overlay = snapshotOverlayState();
			undoStack.push(currentSnap);
			undoStack = undoStack;
		}
		const snap = redoStack.pop()!;
		redoStack = redoStack;
		applySnapshot(snap);
	}

	function saveEditModeShapesToData() {
		if (!editModeTarget || !editModeLayer) return;
		pushUndoSnapshot();
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

		const size = 30;
		for (let i = 0; i < 4; i++) {
			const angle = getShapeEdgeAngle(i);
			const icon = L.divIcon({
				className: 'shape-edge-handle-container',
				iconSize: [size, size],
				iconAnchor: [size / 2, size / 2],
				html: `<div class="shape-edge-handle" style="transform: rotate(${angle}deg)"></div>`
			});
			const marker = L.marker(midpoints[i], {
				icon,
				draggable: true,
				zIndexOffset: 10000
			}).addTo(map);

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
			const el = shapeEdgeMarkers[i].getElement();
			if (el) {
				const bar = el.querySelector('.shape-edge-handle');
				if (bar) bar.style.transform = `rotate(${getShapeEdgeAngle(i)}deg)`;
			}
		}
	}

	function handleShapeEdgeDrag(edgeIndex: number, newLatLng: any) {
		if (!editModeLayer || !map) return;
		const L = (window as any).L;
		const latlngs = editModeLayer.getLatLngs?.();
		if (!latlngs) return;
		const ring: any[] = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
		if (ring.length !== 4) return;

		// Dragged edge vertices
		const i0 = edgeIndex;
		const i1 = (edgeIndex + 1) % 4;
		// Opposite edge vertices (fixed during drag) — i0 pairs with i3, i1 pairs with i2
		const i2 = (edgeIndex + 2) % 4;
		const i3 = (edgeIndex + 3) % 4;

		const op2 = map.latLngToContainerPoint(ring[i2]);
		const op3 = map.latLngToContainerPoint(ring[i3]);

		// Perpendicular direction derived from opposite edge (stable reference)
		const oppDx = op2.x - op3.x;
		const oppDy = op2.y - op3.y;
		const oppLen = Math.sqrt(oppDx * oppDx + oppDy * oppDy);
		if (oppLen === 0) return;

		let perpX = -oppDy / oppLen;
		let perpY = oppDx / oppLen;

		// Ensure perpendicular points from opposite edge toward dragged edge
		const curP0 = map.latLngToContainerPoint(ring[i0]);
		if ((curP0.x - op3.x) * perpX + (curP0.y - op3.y) * perpY < 0) {
			perpX = -perpX;
			perpY = -perpY;
		}

		// Project drag point: perpendicular distance from opposite edge
		const dragPt = map.latLngToContainerPoint(newLatLng);
		const dragPerp = (dragPt.x - op3.x) * perpX + (dragPt.y - op3.y) * perpY;

		if (dragPerp < 5) return; // prevent flipping past opposite edge

		// Set dragged vertices to absolute positions (no delta accumulation)
		const newRing = ring.map((ll: any, idx: number) => {
			if (idx === i0) {
				return map.containerPointToLatLng(L.point(
					op3.x + dragPerp * perpX, op3.y + dragPerp * perpY
				));
			}
			if (idx === i1) {
				return map.containerPointToLatLng(L.point(
					op2.x + dragPerp * perpX, op2.y + dragPerp * perpY
				));
			}
			return ll;
		});

		editModeLayer.setLatLngs([newRing]);
		editModeLayer.pm.disable();

		repositionShapeEdgeMarkers();
		const p = getShapeRotateHandlePos();
		if (p && shapeRotateMarker) shapeRotateMarker.setLatLng(p);
	}

	function handleShapeEdgeDragEnd() {
		if (!editModeLayer) return;
		editModeLayer.pm.enable({ allowSelfIntersection: false });
		requestAnimationFrame(() => setupShapeDragOnPath());
		selectedVertexMarker = null;
		hookVertexMarkerClicks();
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
		selectedVertexMarker = null;
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
		shapeToolboxPanel = null;
	}

	function addDraggableLabelMarker(entity: Zone | Area, level: string, converter?: GeoConverter) {
		if (!entity.labelPosition || !map) return;
		const L = (window as any).L;
		const lp = converter
			? converter.pixelToLatLng(entity.labelPosition.x, entity.labelPosition.y)
			: { lat: entity.labelPosition.y, lng: entity.labelPosition.x };
		const cssClass = level === 'zone' ? 'label-zone' : 'label-area';
		const icon = L.divIcon({
			className: `label-drag-marker ${cssClass}`,
			html: `<span>${entity.name}</span>`,
			iconSize: [0, 0],
			iconAnchor: [0, 0],
		});
		labelMarker = L.marker([lp.lat, lp.lng], { icon, draggable: true, zIndexOffset: 1000 }).addTo(map);
		let dragUndoPushed = false;
		labelMarker.on('dragstart', () => {
			if (!dragUndoPushed) { pushUndoSnapshot(); dragUndoPushed = true; }
		});
		labelMarker.on('dragend', () => {
			const pos = labelMarker.getLatLng();
			entity.labelPosition = converter
				? converter.latLngToPixel(pos.lat, pos.lng)
				: { x: pos.lng, y: pos.lat };
			venue = { ...venue };
			dragUndoPushed = false;
		});
	}

	function renderEditModeShapes() {
		if (!map || !editModeTarget) return;
		const L = (window as any).L;
		const converter = getGeoConverter();
		const zone = venue.zones.find(z => z.id === editModeTarget.zoneId);
		if (!zone) return;

		// Clear existing
		if (labelMarker) { map.removeLayer(labelMarker); labelMarker = null; }
		for (const sl of shapeLayers) {
			map.removeLayer(sl);
		}
		shapeLayers = [];
		editModeLayer = null;
		areaLayerMap = new Map();
		spotLayerMap = new Map();

		if (editModeTarget.type === 'zone') {
			// Editing a zone: show zone + all its areas + spots
			const zoneLayer = shapeDefToLayer(zone.shape, zone.style, zone.name, 'zone', converter, zone.labelPosition);
			if (zoneLayer) {
				zoneLayer.addTo(map);
				shapeLayers.push(zoneLayer);
				editModeLayer = zoneLayer;
				if (zone.labelPosition) { zoneLayer.unbindTooltip(); addDraggableLabelMarker(zone, 'zone', converter); }
				zoneLayer.on('click', () => {
					zoneClickedFlag = true;
					setTimeout(() => zoneClickedFlag = false, 0);
					if (editingTarget) deselectEntity(); // deselect any selected area/spot
					if (editPanelSpotId) clearPanelSpot();
					if (editPanelAreaId) clearPanelArea(); // back to Edit Zone
					selectEditModeItem('shape');
				});
			}
			for (const area of zone.areas) {
				const areaChildLayers: any[] = [];
				const areaLayer = shapeDefToLayer(area.shape, area.style, area.name, 'area', converter, area.labelPosition);
				if (areaLayer) {
					areaLayer.addTo(map);
					shapeLayers.push(areaLayer);
					areaLayerMap.set(area.id, areaLayer);

					const handleAreaClick = () => {
						if (addSpotDrawing || addAreaDrawing || redrawActive) return;
						if (spotClickedFlag) return; // spot takes priority
						zoneClickedFlag = true;
						setTimeout(() => zoneClickedFlag = false, 0);
						deselectEditModeItem(); // deselect zone shape toolbox
						if (editingTarget) deselectEntity();
						if (editPanelSpotId) clearPanelSpot();
						// Show Edit Area in sidebar without changing the canvas
						selectPanelArea(area.id);
					};

					// Leaflet click handler for area selection
					areaLayer.on('click', (e: any) => {
						if (e.originalEvent) e.originalEvent.stopPropagation();
						handleAreaClick();
					});

					// Native pointerdown for drag-to-move
					const areaEl = areaLayer.getElement();
					if (areaEl) {
						areaEl.style.cursor = 'grab';
						areaEl.addEventListener('pointerdown', (pe: PointerEvent) => {
							if (pe.button !== 0) return;
							if (addSpotDrawing || addAreaDrawing || redrawActive) return;
							pe.stopImmediatePropagation();
							zoneClickedFlag = true;
							map.dragging.disable();

							const startPoint = map.mouseEventToContainerPoint(pe);
							const startLatLng = map.containerPointToLatLng(startPoint);
							let prevLatLng = startLatLng;
							let dragging = false;

							const onPointerMove = (moveEvt: PointerEvent) => {
								const curPoint = map.mouseEventToContainerPoint(moveEvt);
								if (!dragging) {
									const ddx = curPoint.x - startPoint.x;
									const ddy = curPoint.y - startPoint.y;
									if (Math.sqrt(ddx * ddx + ddy * ddy) > 3) {
										dragging = true;
										isDragging = true;
										areaEl.style.cursor = 'grabbing';
										areaLayer.setStyle({ weight: 3, dashArray: '6 4', color: '#facc15' });
										for (const cl of areaChildLayers) {
											cl.setStyle?.({ opacity: 0, fillOpacity: 0 });
											cl.unbindTooltip?.();
										}
									}
								}
								if (dragging) {
									const curLatLng = map.containerPointToLatLng(curPoint);
									const dlat = curLatLng.lat - prevLatLng.lat;
									const dlng = curLatLng.lng - prevLatLng.lng;
									if (areaLayer.setBounds && areaLayer instanceof L.Rectangle) {
										const b = areaLayer.getBounds();
										areaLayer.setBounds(L.latLngBounds(
											[b.getSouth() + dlat, b.getWest() + dlng],
											[b.getNorth() + dlat, b.getEast() + dlng]
										));
									} else if (areaLayer.getLatLngs) {
										const latlngs = areaLayer.getLatLngs()[0].map((ll: any) => L.latLng(ll.lat + dlat, ll.lng + dlng));
										areaLayer.setLatLngs(latlngs);
									}
									prevLatLng = curLatLng;
								}
							};

							const onPointerUp = (upEvt: PointerEvent) => {
								document.removeEventListener('pointermove', onPointerMove);
								document.removeEventListener('pointerup', onPointerUp);
								map.dragging.enable();
								if (dragging) {
									const endPoint = map.mouseEventToContainerPoint(upEvt);
									const endLatLng = map.containerPointToLatLng(endPoint);
									const conv = getGeoConverter();
									let dx: number, dy: number;
									if (conv) {
										const startPx = conv.latLngToPixel(startLatLng.lat, startLatLng.lng);
										const endPx = conv.latLngToPixel(endLatLng.lat, endLatLng.lng);
										dx = endPx.x - startPx.x;
										dy = endPx.y - startPx.y;
									} else {
										dx = endLatLng.lng - startLatLng.lng;
										dy = endLatLng.lat - startLatLng.lat;
									}
									const z = venue.zones.find(zn => zn.id === zone.id);
									const a = z?.areas.find(ar => ar.id === area.id);
									if (a) {
										a.shape = applyDelta(a.shape, dx, dy);
										if (a.labelPosition) a.labelPosition = { x: a.labelPosition.x + dx, y: a.labelPosition.y + dy };
										for (const s of a.spots) {
											s.shape = applyDelta(s.shape, dx, dy);
										}
									}
									venue = { ...venue };
									isDragging = false;
									const areaId = area.id;
									renderEditModeShapes();
									selectPanelArea(areaId);
								}
								setTimeout(() => { zoneClickedFlag = false; }, 300);
							};

							document.addEventListener('pointermove', onPointerMove);
							document.addEventListener('pointerup', onPointerUp);
						});
					}
				}

				for (const spot of area.spots) {
					const spotLayer = shapeDefToLayer(spot.shape, spot.style, spot.name, 'spot', converter);
					if (spotLayer) {
						spotLayer.addTo(map);
						shapeLayers.push(spotLayer);
						areaChildLayers.push(spotLayer);
						spotLayerMap.set(spot.id, spotLayer);

						spotLayer.on('click', (e: any) => {
							if (e.originalEvent) e.originalEvent.stopPropagation();
							spotClickedFlag = true;
							zoneClickedFlag = true;
							setTimeout(() => { spotClickedFlag = false; zoneClickedFlag = false; }, 0);
							if (editingTarget) deselectEntity();
							deselectEditModeItem();
							if (editPanelAreaId) unhighlightPanelArea();
							selectPanelSpot(spot.id, area.id);
						});
					}
				}
			}
		} else if (editModeTarget.type === 'area') {
			// Editing an area: show only the area + its spots
			const area = zone.areas.find(a => a.id === (editModeTarget as any).areaId);
			if (!area) return;
			const areaLayer = shapeDefToLayer(area.shape, area.style, area.name, 'area', converter, area.labelPosition);
			if (areaLayer) {
				areaLayer.addTo(map);
				shapeLayers.push(areaLayer);
				editModeLayer = areaLayer;
				if (area.labelPosition) { areaLayer.unbindTooltip(); addDraggableLabelMarker(area, 'area', converter); }
				areaLayer.on('click', () => {
					zoneClickedFlag = true;
					setTimeout(() => zoneClickedFlag = false, 0);
					if (editPanelSpotId) clearPanelSpot();
					selectEditModeItem('shape');
				});
			}
			for (const spot of area.spots) {
				const spotLayer = shapeDefToLayer(spot.shape, spot.style, spot.name, 'spot', converter);
				if (spotLayer) {
					spotLayer.addTo(map);
					shapeLayers.push(spotLayer);
					spotLayerMap.set(spot.id, spotLayer);
					const el = spotLayer.getElement?.();
					if (el) el.style.cursor = 'pointer';
					spotLayer.on('click', () => {
						zoneClickedFlag = true;
						setTimeout(() => zoneClickedFlag = false, 0);
						deselectEditModeItem();
						selectPanelSpot(spot.id, area.id);
					});
				}
			}
		} else if (editModeTarget.type === 'spot') {
			// Editing a spot: show the parent area as background + the spot
			const area = zone.areas.find(a => a.id === (editModeTarget as any).areaId);
			if (!area) return;
			const areaLayer = shapeDefToLayer(area.shape, area.style, area.name, 'area', converter, area.labelPosition);
			if (areaLayer) {
				areaLayer.addTo(map);
			}
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

		// Re-apply highlight on the selected panel area/spot after re-render
		// Only highlight one thing at a time: spot takes priority over area
		if (editPanelSpotId) {
			const layer = spotLayerMap.get(editPanelSpotId);
			if (layer) {
				layer.setStyle({ weight: 3, dashArray: '6 4', color: '#facc15' });
			}
		} else if (editPanelAreaId) {
			const layer = areaLayerMap.get(editPanelAreaId);
			if (layer) {
				layer.setStyle({ weight: 3, dashArray: '6 4', color: '#facc15' });
			}
		}
	}

	function discardEditMode() {
		if (!editMode || !editModeTarget) return;

		// Restore original entity (name, style, shape, description)
		if (editModeOriginalEntity) {
			const zone = venue.zones.find(z => z.id === editModeTarget.zoneId);
			if (zone) {
				if (editModeTarget.type === 'zone') {
					Object.assign(zone, { name: editModeOriginalEntity.name, style: editModeOriginalEntity.style, shape: editModeOriginalEntity.shape, labelPosition: editModeOriginalEntity.labelPosition });
					// Restore child areas/spots if they were part of the snapshot
					if (editModeOriginalEntity.areas) {
						zone.areas = editModeOriginalEntity.areas;
					}
				} else if (editModeTarget.type === 'area') {
					const area = zone.areas.find(a => a.id === (editModeTarget as any).areaId);
					if (area) {
						Object.assign(area, { name: editModeOriginalEntity.name, category: editModeOriginalEntity.category, style: editModeOriginalEntity.style, shape: editModeOriginalEntity.shape, labelPosition: editModeOriginalEntity.labelPosition });
						if (editModeOriginalEntity.spots) {
							area.spots = editModeOriginalEntity.spots;
						}
					}
				} else {
					const area = zone.areas.find(a => a.id === (editModeTarget as any).areaId);
					const spot = area?.spots.find(s => s.id === (editModeTarget as any).spotId);
					if (spot) {
						Object.assign(spot, { name: editModeOriginalEntity.name, category: editModeOriginalEntity.category, style: editModeOriginalEntity.style, shape: editModeOriginalEntity.shape, description: editModeOriginalEntity.description });
					}
				}
			}
		}

		// Skip saving — go straight to cleanup
		exitEditMode(false);
	}

	function startAddSpotDraw() {
		if (!map || !addSpotName.trim()) return;
		addSpotDrawing = true;
		redrawUndoneVertices = [];
		redrawVertexCount = 0;
		deselectEditModeItem();
		map.pm.enableDraw('Polygon', {
			pathOptions: {
				color: '#cbd5e1',
				weight: 1,
				fillColor: CATEGORY_COLORS['info'],
				fillOpacity: 0.8
			}
		});
		map.on('pm:vertexadded', onRedrawVertexAdded);
	}

	function cancelAddSpot() {
		addingSpot = false;
		addSpotName = '';
		if (addSpotDrawing) {
			map?.off('pm:vertexadded', onRedrawVertexAdded);
			map?.pm.disableDraw();
			addSpotDrawing = false;
			redrawUndoneVertices = [];
			redrawVertexCount = 0;
		}
	}

	function completeAddSpot(layer: any) {
		if (!editModeTarget || editModeTarget.type !== 'area') return;
		const zone = venue.zones.find(z => z.id === editModeTarget.zoneId);
		if (!zone) return;
		const area = zone.areas.find(a => a.id === (editModeTarget as any).areaId);
		if (!area) return;

		let shapeDef = layerToShapeDef(layer);
		const converter = getGeoConverter();
		if (converter) shapeDef = converter.shapeToPixel(shapeDef);

		pushUndoSnapshot();
		const spot: Spot = {
			id: generateId('spot'),
			name: addSpotName.trim(),
			description: '',
			category: 'info',
			shape: shapeDef,
			style: defaultStyle('spot', 'info')
		};
		area.spots = [...area.spots, spot];
		venue = { ...venue };

		// Remove the drawn layer (we re-render from data)
		map.removeLayer(layer);
		map.off('pm:vertexadded', onRedrawVertexAdded);
		addingSpot = false;
		addSpotName = '';
		addSpotDrawing = false;
		redrawUndoneVertices = [];
		redrawVertexCount = 0;
		renderEditModeShapes();
	}

	function startAddAreaDraw() {
		if (!map || !addAreaName.trim()) return;
		addAreaDrawing = true;
		redrawUndoneVertices = [];
		redrawVertexCount = 0;
		deselectEditModeItem();
		map.pm.enableDraw('Polygon', {
			pathOptions: {
				color: '#cbd5e1',
				weight: 1,
				fillColor: CATEGORY_COLORS['info'],
				fillOpacity: 0.7
			}
		});
		map.on('pm:vertexadded', onRedrawVertexAdded);
	}

	function cancelAddArea() {
		addingArea = false;
		addAreaName = '';
		if (addAreaDrawing) {
			map?.off('pm:vertexadded', onRedrawVertexAdded);
			map?.pm.disableDraw();
			addAreaDrawing = false;
			redrawUndoneVertices = [];
			redrawVertexCount = 0;
		}
	}

	function completeAddArea(layer: any) {
		if (!editModeTarget || editModeTarget.type !== 'zone') return;
		const zone = venue.zones.find(z => z.id === editModeTarget.zoneId);
		if (!zone) return;

		let shapeDef = layerToShapeDef(layer);
		const converter = getGeoConverter();
		if (converter) shapeDef = converter.shapeToPixel(shapeDef);

		pushUndoSnapshot();
		const area: Area = {
			id: generateId('area'),
			name: addAreaName.trim(),
			category: 'info',
			shape: shapeDef,
			style: defaultStyle('area', 'info'),
			spots: []
		};
		zone.areas = [...zone.areas, area];
		venue = { ...venue };

		map.removeLayer(layer);
		map.off('pm:vertexadded', onRedrawVertexAdded);
		addingArea = false;
		addAreaName = '';
		addAreaDrawing = false;
		redrawUndoneVertices = [];
		redrawVertexCount = 0;

		// Show the newly created area in the sidebar, re-render to show it on canvas
		renderEditModeShapes();
		selectPanelArea(area.id);
	}

	function exitEditMode(save = true) {
		if (!editMode) return;

		placingLabel = false;
		if (labelMarker) { map?.removeLayer(labelMarker); labelMarker = null; }
		cancelAddSpot();

		// Cancel any active redraw first
		if (redrawActive) cancelRedraw();

		// Deselect any active edit-mode selection (disables pm / removes overlay handles)
		deselectEditModeItem();

		// Capture final shape from layer geometry (only when saving)
		if (save && editModeLayer && editModeTarget) {
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
		editModeOriginalEntity = null;
		editPanelAreaId = '';
		editPanelSpotId = '';
		removeZoneConfirming = false;
		oneditchange(null);

		// Re-add tile layer and floor background
		if (tileLayerRef && map) tileLayerRef.addTo(map);

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

		// Invalidate map size since the container changed back (keep current view position)
		setTimeout(() => {
			if (!map) return;
			map.invalidateSize();
		}, 50);
	}

	function switchToEditTarget(target: EditingTarget) {
		removeAreaConfirming = false;
		removeSpotConfirming = false;
		editPanelSpotId = '';
		exitEditMode(true);
		enterEditModeForTarget(target);
	}

	/** Show area details in sidebar without changing the canvas (zone stays rendered) */
	function selectPanelArea(areaId: string) {
		spColorPopup = null;
		// Unhighlight previous
		if (editPanelAreaId && editPanelAreaId !== areaId) {
			unhighlightPanelArea();
		}
		editPanelAreaId = areaId;
		// Highlight the selected area layer
		const layer = areaLayerMap.get(areaId);
		if (layer) {
			layer.setStyle({ weight: 3, dashArray: '6 4', color: '#facc15' });
		}
	}

	function clearPanelArea() {
		removeAreaConfirming = false;
		if (editPanelSpotId) clearPanelSpot();
		unhighlightPanelArea();
		editPanelAreaId = '';
	}

	function unhighlightPanelArea() {
		if (!editPanelAreaId) return;
		const layer = areaLayerMap.get(editPanelAreaId);
		const zone = venue.zones.find(z => z.id === editModeTarget?.zoneId);
		const area = zone?.areas.find(a => a.id === editPanelAreaId);
		if (layer && area) {
			layer.setStyle({
				color: area.style.stroke ?? '#cbd5e1',
				weight: area.style.strokeWidth ?? 1,
				dashArray: ''
			});
		}
	}

	function selectPanelSpot(spotId: string, parentAreaId: string) {
		spColorPopup = null;
		if (editPanelSpotId && editPanelSpotId !== spotId) {
			unhighlightPanelSpot();
		}
		// If coming from zone edit and no area selected yet, select the area too
		if (editModeTarget?.type === 'zone' && !editPanelAreaId) {
			editPanelAreaId = parentAreaId;
		}
		editPanelSpotId = spotId;
		removeSpotConfirming = false;
		const layer = spotLayerMap.get(spotId);
		if (layer) {
			layer.setStyle({ weight: 3, dashArray: '6 4', color: '#facc15' });
		}
	}

	function clearPanelSpot() {
		spColorPopup = null;
		removeSpotConfirming = false;
		unhighlightPanelSpot();
		editPanelSpotId = '';
	}

	function unhighlightPanelSpot() {
		if (!editPanelSpotId) return;
		const layer = spotLayerMap.get(editPanelSpotId);
		const zone = venue.zones.find(z => z.id === editModeTarget?.zoneId);
		let spot: any;
		for (const a of zone?.areas ?? []) {
			spot = a.spots.find(s => s.id === editPanelSpotId);
			if (spot) break;
		}
		if (layer && spot) {
			layer.setStyle({
				color: spot.style.stroke ?? '#cbd5e1',
				weight: spot.style.strokeWidth ?? 1,
				dashArray: ''
			});
		}
	}

	function removeSpotInEdit(zoneId: string, areaId: string, spotId: string) {
		pushUndoSnapshot();
		const zone = venue.zones.find(z => z.id === zoneId);
		if (!zone) return;
		const area = zone.areas.find(a => a.id === areaId);
		if (!area) return;
		area.spots = area.spots.filter(s => s.id !== spotId);
		venue = { ...venue };
		removeSpotConfirming = false;
		clearPanelSpot();
		renderEditModeShapes();
	}

	// Side panel handlers (work for both zone and area editing)
	function panelUpdateName() {
		const entity = getEditModeEntity();
		if (entity && panelName.trim()) {
			entity.name = panelName.trim();
			venue = { ...venue };
			if (labelMarker) {
				const el = labelMarker.getElement();
				if (el) { const span = el.querySelector('span'); if (span) span.textContent = entity.name; }
			} else if (editModeLayer) {
				const level = editModeTarget?.type ?? 'zone';
				const cls = `label-${level}`;
				editModeLayer.unbindTooltip();
				editModeLayer.bindTooltip(entity.name, { permanent: true, direction: 'right', className: cls });
			}
		}
	}

	function panelUpdateCategory(cat: POICategory) {
		pushUndoSnapshot();
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
			for (const sl of shapeLayers) sl.bringToFront();
		} else {
			tileLayerRef?.remove();
		}
	}

	function onRedrawVertexAdded(e: any) {
		if (!isDrawingPolygon || !map) return;
		const marker = e.marker;
		const workingLayer = e.workingLayer;
		if (!marker || !workingLayer) return;

		// Clear redo stack when a new vertex is placed manually (not via redo)
		if (!redrawIsRedoing) {
			redrawUndoneVertices = [];
		}
		redrawVertexCount = redrawVertexCount + 1;

		marker.options.draggable = true;
		if (marker.dragging) marker.dragging.enable();

		marker.on('drag', () => {
			const drawMode = map.pm.Draw.Polygon;
			if (drawMode?._markers) {
				const latlngs = drawMode._markers.map((m: any) => m.getLatLng());
				workingLayer.setLatLngs(latlngs);
			}
		});
	}

	// Collect all current draw-mode vertex latlngs
	function getRedrawVertices(): Array<{ lat: number; lng: number }> {
		const drawMode = map?.pm?.Draw?.Polygon;
		if (!drawMode?._markers) return [];
		return drawMode._markers.map((m: any) => {
			const ll = m.getLatLng();
			return { lat: ll.lat, lng: ll.lng };
		});
	}

	// Restart polygon draw with a given set of vertices
	function restartRedrawWith(vertices: Array<{ lat: number; lng: number }>) {
		if (!map) return;
		const L = (window as any).L;

		// Determine path options based on active drawing mode
		let pathOptions: any;
		if (redrawActive) {
			const entity = getEditModeEntity();
			pathOptions = {
				color: entity?.style.stroke ?? '#cbd5e1',
				weight: entity?.style.strokeWidth ?? 1,
				fillColor: entity?.style.fill ?? '#3b82f6',
				fillOpacity: entity?.style.opacity ?? 0.6
			};
		} else {
			// addAreaDrawing or addSpotDrawing — use default draw styles
			pathOptions = {
				color: '#cbd5e1',
				weight: 1,
				fillColor: CATEGORY_COLORS['info'],
				fillOpacity: addSpotDrawing ? 0.8 : 0.7
			};
		}

		// Stop current draw (removes all markers/layers)
		redrawRestarting = true;
		map.pm.disableDraw();
		redrawRestarting = false;
		map.off('pm:vertexadded', onRedrawVertexAdded);

		// Re-enable draw
		map.pm.enableDraw('Polygon', { pathOptions });
		map.on('pm:vertexadded', onRedrawVertexAdded);

		// Re-place each vertex
		const drawMode = map.pm.Draw.Polygon;
		if (drawMode && typeof drawMode._createVertex === 'function') {
			redrawIsRedoing = true;
			for (const v of vertices) {
				drawMode._createVertex({ latlng: L.latLng(v.lat, v.lng) });
			}
			redrawIsRedoing = false;
		}
	}

	function redrawUndo() {
		if (!map || !isDrawingPolygon) return;
		const vertices = getRedrawVertices();
		if (vertices.length === 0) return;

		// Save removed vertex for redo
		const removed = vertices.pop()!;
		redrawUndoneVertices = [...redrawUndoneVertices, removed];

		// Restart draw with remaining vertices
		restartRedrawWith(vertices);
	}

	function redrawRedo() {
		if (!map || !isDrawingPolygon || redrawUndoneVertices.length === 0) return;
		const vertices = getRedrawVertices();

		// Pop from redo stack
		const restored = redrawUndoneVertices[redrawUndoneVertices.length - 1];
		redrawUndoneVertices = redrawUndoneVertices.slice(0, -1);

		// Add it back and restart
		vertices.push(restored);
		restartRedrawWith(vertices);
	}

	function startRedraw(targetLayer?: any, targetEntity?: Zone | Area | Spot) {
		const layer = targetLayer ?? editModeLayer;
		const entity = targetEntity ?? getEditModeEntity();
		if (!layer || !map || !entity) return;

		// Deselect current edit-mode selection (disables pm / removes overlay handles)
		deselectEditModeItem();

		// Track in-place entity if different from editModeEntity
		redrawEntity = targetEntity ?? null;

		// Remove the current layer from the map entirely (prevents click-selection)
		if (layer.getTooltip()) layer.closeTooltip();
		map.removeLayer(layer);

		// Stash reference
		redrawOriginalLayer = layer;

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

		// Allow dragging already-placed vertices during draw
		map.on('pm:vertexadded', onRedrawVertexAdded);

		redrawUndoneVertices = [];
		redrawVertexCount = 0;
		redrawActive = true;
	}

	function cancelRedraw() {
		if (!map) return;

		const inPlace = !!redrawEntity;

		// Stop drawing
		map.pm.disableDraw();
		map.off('pm:vertexadded', onRedrawVertexAdded);

		// Re-add original layer to the map
		if (redrawOriginalLayer) {
			redrawOriginalLayer.addTo(map);
			const entity = redrawEntity ?? getEditModeEntity();
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
		redrawEntity = null;

		if (inPlace) {
			// Re-highlight the panel spot/area
			if (editPanelSpotId) {
				const layer = spotLayerMap.get(editPanelSpotId);
				if (layer) layer.setStyle({ weight: 3, dashArray: '6 4', color: '#facc15' });
			} else if (editPanelAreaId) {
				const layer = areaLayerMap.get(editPanelAreaId);
				if (layer) layer.setStyle({ weight: 3, dashArray: '6 4', color: '#facc15' });
			}
		} else {
			// Re-select shape so vertex editing is restored
			editModeSelection = null;
			selectEditModeItem('shape');
		}
	}

	function completeRedraw(newLayer: any) {
		if (!map || !editModeTarget) return;
		map.off('pm:vertexadded', onRedrawVertexAdded);

		const inPlace = !!redrawEntity;

		// Extract shape from the newly drawn layer
		let newShape = layerToShapeDef(newLayer);
		const converter = getGeoConverter();
		if (converter) newShape = converter.shapeToPixel(newShape);

		// Update entity shape in data model
		const entity = redrawEntity ?? getEditModeEntity();
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
		redrawEntity = null;

		// Rebuild with new shape (re-enables vertex editing)
		renderEditModeShapes();

		if (!inPlace) {
			// Fit bounds to new shape
			setTimeout(() => {
				if (editModeLayer) {
					map.fitBounds(editModeLayer.getBounds().pad(0.2));
				}
			}, 50);
		}
	}

	function handleOverlayFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			pushUndoSnapshot();
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

	function onOverlayOpacityStart() {
		pushUndoSnapshot();
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
		unhookOverlayRotation();
		if (overlayLayer && map) {
			map.removeLayer(overlayLayer);
			overlayLayer = null;
		}
	}

	function clearOverlay() {
		pushUndoSnapshot();
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

	function resetOverlay() {
		if (!overlayLayer || !map || !overlayImageUrl) return;
		pushUndoSnapshot();
		const wasSelected = editModeSelection === 'overlay';
		if (wasSelected) deselectEditModeItem();
		overlayRotation = 0;
		removeOverlayFromMap();
		addOverlayToMap(); // re-adds with default venue bounds, rotation 0
		if (wasSelected) selectEditModeItem('overlay');
		persistOverlay();
	}

	function persistOverlay() {
		if (!overlayImageUrl || !overlayLayer) return;
		const bounds = overlayLayer.getBounds();
		saveOverlay(editModeTarget!.zoneId, {
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

			marker.on('dragstart', () => pushUndoSnapshot());
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
		let startAngle = 0;
		let startRotation = 0;

		const onRotateDown = (e: any) => {
			if (!overlayLayer || editModeSelection !== 'overlay') return;
			pushUndoSnapshot();
			e.stopPropagation();
			e.preventDefault();
			map.dragging.disable();
			rotating = true;

			const bounds = overlayLayer.getBounds();
			centerPt = map.latLngToContainerPoint(bounds.getCenter());
			startRotation = overlayRotation;

			const touch = e.touches ? e.touches[0] : e;
			const container = map.getContainer();
			const containerRect = container.getBoundingClientRect();
			const mx = (touch.clientX ?? touch.pageX) - containerRect.left;
			const my = (touch.clientY ?? touch.pageY) - containerRect.top;
			startAngle = Math.atan2(mx - centerPt.x, -(my - centerPt.y)) * (180 / Math.PI);
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
			let currentAngle = Math.atan2(dx, -dy) * (180 / Math.PI);
			let delta = currentAngle - startAngle;
			let angle = startRotation + delta;
			// Normalize to 0–360
			angle = ((angle % 360) + 360) % 360;
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

			marker.on('dragstart', () => pushUndoSnapshot());
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

		// Save opposite edge visual position before changing bounds
		const oppIdx = (edgeIndex + 2) % 4;
		const oldOppMid = getRotatedOverlayEdgeMidpoints()[oppIdx];

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

		// Compensate: changing one bound shifts the center/rotation pivot,
		// causing the opposite edge to drift visually. Shift entire bounds to fix.
		if (overlayRotation !== 0) {
			const newOppMid = getRotatedOverlayEdgeMidpoints()[oppIdx];
			const dLat = oldOppMid.lat - newOppMid.lat;
			const dLng = oldOppMid.lng - newOppMid.lng;
			if (Math.abs(dLat) > 1e-10 || Math.abs(dLng) > 1e-10) {
				const b = overlayLayer.getBounds();
				overlayLayer.setBounds(L.latLngBounds(
					[b.getSouth() + dLat, b.getWest() + dLng],
					[b.getNorth() + dLat, b.getEast() + dLng]
				));
				applyOverlayRotation();
			}
		}

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
			pushUndoSnapshot();

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
		unhookOverlayRotation();

		const el = overlayLayer.getElement();
		if (!el) return;

		// MutationObserver catches ALL transform changes — zoom animations,
		// moveend resets, etc. — regardless of whether Leaflet uses events,
		// requestAnimationFrame, or CSS transitions.
		const observer = new MutationObserver(() => {
			if (!overlayLayer) return;
			const transform = el.style.transform || '';
			const expected = `rotate(${overlayRotation}deg)`;
			if (!transform.includes(expected)) {
				const cleaned = transform.replace(/\s*rotate\([^)]*\)/g, '');
				el.style.transform = cleaned + ` ${expected}`;
				el.style.transformOrigin = 'center center';
			}
		});

		observer.observe(el, { attributes: true, attributeFilter: ['style'] });
		(overlayLayer as any)._rotationObserver = observer;
		applyOverlayRotation();
	}

	function unhookOverlayRotation() {
		if (!overlayLayer) return;
		const observer = (overlayLayer as any)._rotationObserver;
		if (observer) {
			observer.disconnect();
			(overlayLayer as any)._rotationObserver = null;
		}
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

		// Deselect previous zone without re-rendering
		if (editingLayer && editingLayer !== layer) {
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

		layer.setStyle({ weight: 3, dashArray: '6 4', color: '#facc15' });

		// Set toolbar target to the zone
		selectEntityForToolbar({ type: 'zone', zoneId }, layer);
	}

	function deselectZone() {
		deselectEntity();
		if (editingLayer) {
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
			if (zone.labelPosition) {
				zone.labelPosition = { x: zone.labelPosition.x + delta.dx, y: zone.labelPosition.y + delta.dy };
			}
			for (const area of zone.areas) {
				area.shape = applyDelta(area.shape, delta.dx, delta.dy);
				if (area.labelPosition) {
					area.labelPosition = { x: area.labelPosition.x + delta.dx, y: area.labelPosition.y + delta.dy };
				}
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
		if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
			if (isDrawingPolygon) {
				e.preventDefault();
				if (e.shiftKey) { redrawRedo(); } else { redrawUndo(); }
				return;
			}
			if (editMode) {
				e.preventDefault();
				if (e.shiftKey) { redo(); } else { undo(); }
				return;
			}
		}
		if (e.key === 'Escape') {
			if (relocatingZoneId) { relocatingZoneId = ''; mapContainer.style.cursor = ''; return; }
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

		// Save current view for the zone we're leaving (before changing activeZoneId)
		const center = map.getCenter();
		const zoom = map.getZoom();
		localStorage.setItem(`mapEditor:view:${venue.id}:${activeZoneId}`, JSON.stringify({ lat: center.lat, lng: center.lng, zoom }));

		// Suppress moveend saves during the switch (cleared async after all events settle)
		suppressViewSave = true;

		activeZoneId = zoneId;
		deselectEntity();
		deselectZone();
		renderExistingShapes();

		// Restore saved view for the zone we're switching to
		const saved = localStorage.getItem(`mapEditor:view:${venue.id}:${zoneId}`);
		if (saved) {
			try {
				const v = JSON.parse(saved);
				map.setView([v.lat, v.lng], v.zoom, { animate: false });
			} catch {}
		}

		// Clear suppression after all async Leaflet events have settled
		setTimeout(() => { suppressViewSave = false; }, 100);
	}

	function addShapeToVenue(shapeDef: ShapeDef, name: string, category: POICategory, description: string) {
		if (drawLevel === 'zone') {
			const zone: Zone = {
				id: generateId('zone'),
				name,
				shape: shapeDef,
				style: { fill: '#3b82f6', opacity: 0.85, stroke: '#cbd5e1', strokeWidth: 1 },
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
		areaLayerMap = new Map();
		spotLayerMap = new Map();

		// Filter zones based on activeZoneId
		const zonesToRender = activeZoneId
			? venue.zones.filter(z => z.id === activeZoneId)
			: venue.zones;

		for (const zone of zonesToRender) {
			const zoneChildLayers: any[] = [];

			// Render zone shape in zonePane (lower z-index so areas stay clickable on top)
			const zoneLayer = shapeDefToLayer(zone.shape, zone.style, zone.name, 'zone', converter, zone.labelPosition);
			if (zoneLayer) {
				zoneLayer.unbindTooltip();
				zoneLayer.options.pane = 'zonePane';
				zoneLayer.addTo(map);
				shapeLayers.push(zoneLayer);
				zoneLayerMap.set(zone.id, zoneLayer);
				// Native mousedown on SVG element — stopImmediatePropagation prevents
				// the event from reaching Leaflet's map drag handler on the container
				const zoneEl = zoneLayer.getElement();
				if (zoneEl) {
					zoneEl.style.cursor = 'pointer';
					zoneEl.addEventListener('pointerdown', (pe: PointerEvent) => {
						if (pe.button !== 0) return;
						pe.stopImmediatePropagation();
						pe.preventDefault();
						zoneClickedFlag = true;
						// Toggle zone selection (click only, no drag)
						if (editingTarget?.type === 'zone' && editingTarget.zoneId === zone.id) {
							deselectZone();
						} else {
							selectZoneForDrag(zone.id, zoneLayer);
						}
						setTimeout(() => { zoneClickedFlag = false; }, 300);
					});
					// Prevent click from bubbling to map container (which would deselect the zone)
					zoneEl.addEventListener('click', (e: Event) => {
						e.stopPropagation();
					});
				}
			}

			for (const area of zone.areas) {
				const areaLayer = shapeDefToLayer(area.shape, area.style, area.name, 'area', converter, area.labelPosition);
				if (areaLayer) {
					areaLayer.addTo(map);
					shapeLayers.push(areaLayer);
					zoneChildLayers.push(areaLayer);
				}

				for (const spot of area.spots) {
					const spotLayer = shapeDefToLayer(spot.shape, spot.style, spot.name, 'spot', converter);
					if (spotLayer) {
						spotLayer.addTo(map);
						shapeLayers.push(spotLayer);
						zoneChildLayers.push(spotLayer);
					}
				}
			}
		}
	}

	function shapeDefToLayer(shape: ShapeDef, style: ShapeStyle, name: string, level: string, converter?: GeoConverter, labelPosition?: { x: number; y: number }): any {
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
			const zoneDir = labelPosition ? 'center' : 'right';
			layer.bindTooltip(name, { permanent: true, direction: zoneDir, className: 'label-zone' });
			layer.on('add', function () {
				if (labelPosition) {
					const lp = converter
						? converter.pixelToLatLng(labelPosition.x, labelPosition.y)
						: { lat: labelPosition.y, lng: labelPosition.x };
					this.getTooltip()?.setLatLng([lp.lat, lp.lng]);
				} else {
					const bounds = this.getBounds();
					const topLeft = converter ? bounds.getNorthWest() : bounds.getSouthWest();
					this.getTooltip()?.setLatLng(topLeft);
				}
			});
		} else if (level === 'area') {
			const areaDir = labelPosition ? 'center' : 'top';
			layer.bindTooltip(name, { permanent: true, direction: areaDir, className: 'label-area', offset: [0, 0] });
			layer.on('add', function () {
				if (labelPosition) {
					const lp = converter
						? converter.pixelToLatLng(labelPosition.x, labelPosition.y)
						: { lat: labelPosition.y, lng: labelPosition.x };
					this.getTooltip()?.setLatLng([lp.lat, lp.lng]);
				} else {
					const bounds = this.getBounds();
					const topLeft = converter ? bounds.getNorthWest() : bounds.getSouthWest();
					this.getTooltip()?.setLatLng(topLeft);
				}
			});
		} else if (level === 'spot') {
			layer.bindTooltip(name, { permanent: true, direction: 'top', className: 'label-spot', offset: [0, -5] });
		} else {
			layer.bindTooltip(name, { permanent: true, direction: 'center', className: `label-${level}` });
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

			L.control.zoom({ position: 'topright' }).addTo(map);

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

			map.fitBounds(geoBounds);
		} else {
			// Pixel mode (fallback): Y-down CRS, no tiles
			const YDownCRS = L.Util.extend({}, L.CRS.Simple, {
				transformation: new L.Transformation(1, 0, 1, 0)
			});

			map = L.map(mapContainer, {
				crs: YDownCRS,
				minZoom: -2,
				maxZoom: 40,
				zoomSnap: 0.25
			});

			const bounds = [[0, 0], [venue.height, venue.width]];

			map.fitBounds(bounds);

		}

		// Create a lower z-index pane for zone shapes so areas (in overlayPane z:400) stay on top
		map.createPane('zonePane');
		map.getPane('zonePane')!.style.zIndex = '350';

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

		// Disable snapping globally — prevents circles/shapes from snapping to
		// other layers' edges during drag, which causes the "straight line" glitch
		map.pm.setGlobalOptions({ snappable: false });

		// Listen for shape creation
		map.on('pm:create', (e: any) => {
			if (redrawActive) { completeRedraw(e.layer); return; }
			if (addSpotDrawing) { completeAddSpot(e.layer); return; }
			if (addAreaDrawing) { completeAddArea(e.layer); return; }
			pendingLayer = e.layer;
			showDialog = true;
		});

		// Click on map background deselects zone/area
		map.on('click', (e: any) => {
			if (relocatingZoneId) {
				handleRelocateClick(e);
				return;
			}
			if (placingLabel && editModeTarget && editModeTarget.type !== 'spot') {
				const converter = getGeoConverter();
				const pos = converter
					? converter.latLngToPixel(e.latlng.lat, e.latlng.lng)
					: { x: e.latlng.lng, y: e.latlng.lat };
				pushUndoSnapshot();
				const entity = getEditModeEntity() as Zone | Area | undefined;
				if (entity) entity.labelPosition = pos;
				venue = { ...venue };
				placingLabel = false;
				renderEditModeShapes();
				return;
			}
			if (zoneClickedFlag) return;
			if (editMode) {
				if (redrawActive || addSpotDrawing || addAreaDrawing) return; // don't select anything during draw
				// Deselect area/spot toolbar if active
				if (editingTarget) deselectEntity();
				if (editPanelSpotId) clearPanelSpot();
				if (editPanelAreaId) clearPanelArea(); // back to Edit Zone
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
			if (redrawRestarting) return; // undo/redo restart — ignore
			if (redrawActive) cancelRedraw();
			if (addSpotDrawing) { addSpotDrawing = false; }
			if (addAreaDrawing) { addAreaDrawing = false; }
		});

		renderExistingShapes();

		// Persist map view on move/zoom, per venue + zone
		map.on('moveend', () => {
			if (!map || suppressViewSave) return;
			const center = map.getCenter();
			const zoom = map.getZoom();
			localStorage.setItem(`mapEditor:view:${venue.id}:${activeZoneId}`, JSON.stringify({ lat: center.lat, lng: center.lng, zoom }));
		});

		// Restore persisted map view after map has fully initialized
		suppressViewSave = true;
		setTimeout(() => {
			map.invalidateSize();
			const savedView = localStorage.getItem(`mapEditor:view:${venue.id}:${activeZoneId}`);
			if (savedView) {
				try {
					const v = JSON.parse(savedView);
					map.setView([v.lat, v.lng], v.zoom, { animate: false });
				} catch {}
			}
			suppressViewSave = false;
		}, 50);

		// Auto-enter edit mode if initialEditTarget was provided
		if (initialEditTarget) {
			setTimeout(() => {
				enterEditModeForTarget(initialEditTarget);
			}, 100);
		}
	}

	onMount(() => {
		editModeShowMap = localStorage.getItem('mapEditor:showMap') === 'true';
		const savedVertexSize = localStorage.getItem('mapEditor:vertexSize');
		if (savedVertexSize) vertexSize = parseFloat(savedVertexSize);

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
		<div class="map-area" class:placing-label={placingLabel} bind:this={mapContainer} style="--vertex-size: {vertexSize}px;"></div>

		<div class="fab-column" bind:this={fabColumnEl}>
			{#if venueGeoBounds}
				<button
					class="map-fab"
					onclick={(e) => {
						e.stopPropagation();
						const zoneLayer = activeZoneId ? zoneLayerMap.get(activeZoneId) : null;
						if (zoneLayer) {
							map?.flyToBounds(zoneLayer.getBounds().pad(0.2), { duration: 0.8 });
						} else {
							map?.flyToBounds(venueGeoBounds, { duration: 0.8 });
						}
					}}
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

		{#if editMode && selectedVertexMarker}
			<div class="fab-center-bottom">
				<button class="vertex-delete-btn" onclick={(e) => { e.stopPropagation(); deleteSelectedVertex(); }}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="3 6 5 6 21 6"></polyline>
						<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
					</svg>
					Delete Vertex
				</button>
			</div>
		{/if}

		{#if editMode}
			<div class="fab-row-bottom-right">
				<button
					class="map-fab"
					onclick={(e) => { e.stopPropagation(); isDrawingPolygon ? redrawUndo() : undo(); }}
					title="Undo"
					disabled={!isDrawingPolygon && !canUndo}
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="1 4 1 10 7 10"></polyline>
						<path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
					</svg>
				</button>
				<button
					class="map-fab"
					onclick={(e) => { e.stopPropagation(); isDrawingPolygon ? redrawRedo() : redo(); }}
					title="Redo"
					disabled={!isDrawingPolygon && !canRedo}
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="23 4 23 10 17 10"></polyline>
						<path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"></path>
					</svg>
				</button>
			</div>
		{/if}

		{#if relocatingZoneId}
		<div class="relocate-banner">
			Click on the map to place the zone — <button class="relocate-cancel" onclick={() => { relocatingZoneId = ''; mapContainer.style.cursor = ''; }}>Cancel</button>
		</div>
	{/if}

	{#if toolbarPosition && editingTarget && !isDragging && (!editMode || editingTarget.type === 'area' || editingTarget.type === 'spot')}
			{@const editingEntity = getEditingEntity()}
			{#if editingEntity}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					class="zone-toolbar zone-toolbar-bottom"
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
					{:else if editMode}
						<!-- Edit mode: area/spot selected — show Edit + Remove only -->
						<button class="zt-btn zt-btn-primary" onclick={() => { const target = { ...editingTarget }; deselectEntity(); switchToEditTarget(target); }} title="Edit">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
						</button>
						<button class="zt-btn zt-btn-danger" onclick={() => deleteConfirming = true} title="Remove">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
						</button>
					{:else}
						<button class="zt-btn zt-btn-primary" onclick={enterEditMode} title="Edit">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
						</button>
						{#if editingTarget?.type === 'zone'}
							<button class="zt-btn" onclick={startRelocateZone} title="Relocate">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>
							</button>
						{:else}
							<button class="zt-btn" onclick={handleDuplicate} title="Duplicate">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
							</button>
						{/if}
						<button class="zt-btn zt-btn-danger" onclick={() => deleteConfirming = true} title="Delete">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
						</button>
					{/if}
				</div>
			{/if}
		{/if}


	</div>

	{#if editMode && editModeTarget}
		{@const editEntity = getEditModeEntity()}
		{@const isAreaEdit = editModeTarget.type === 'area'}
		{@const isSpotEdit = editModeTarget.type === 'spot'}
		{@const editZone = venue.zones.find(z => z.id === editModeTarget.zoneId)}
		{@const panelArea = (editModeTarget.type === 'zone' && editPanelAreaId) ? editZone?.areas.find(a => a.id === editPanelAreaId) : null}
		{@const panelSpotAreaId = isAreaEdit ? (editModeTarget as any).areaId : editPanelAreaId}
		{@const panelSpotArea = editZone?.areas.find(a => a.id === panelSpotAreaId)}
		{@const panelSpot = editPanelSpotId ? panelSpotArea?.spots.find(s => s.id === editPanelSpotId) ?? null : null}
		{@const showingArea = isAreaEdit || !!panelArea}
		{@const showingSpot = !!panelSpot}
		{#if editEntity}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="side-panel" class:redraw-active={redrawActive} onclick={(e) => e.stopPropagation()}>
			<div class="sp-header">
				<div class="sp-header-balance"></div>
				<span class="sp-title">Edit {showingSpot || isSpotEdit ? 'Spot' : showingArea ? 'Area' : 'Zone'}</span>
				<button class="sp-close" onclick={discardEditMode} title="Discard changes">&#x2715;</button>
			</div>

			<div class="sp-body">

			{#if panelSpot}
				<button class="sp-back-btn" onclick={clearPanelSpot}>
					&#x2190; Back to {isAreaEdit ? 'Area' : panelArea ? 'Area' : 'Zone'}
				</button>
			{:else if isSpotEdit}
				<button class="sp-back-btn" onclick={() => switchToEditTarget({ type: 'area', zoneId: editModeTarget.zoneId, areaId: (editModeTarget as any).areaId })}>
					&#x2190; Back to Area
				</button>
			{:else if panelArea}
				<button class="sp-back-btn" onclick={clearPanelArea}>
					&#x2190; Back to Zone
				</button>
			{:else if isAreaEdit}
				<button class="sp-back-btn" onclick={() => switchToEditTarget({ type: 'zone', zoneId: editModeTarget.zoneId })}>
					&#x2190; Back to Zone
				</button>
			{/if}

			{#if panelSpot}
				<!-- Spot sub-panel -->
				<div class="sp-section">
					<span class="sp-section-label">Spot Name</span>
					<input
						class="sp-input"
						type="text"
						value={panelSpot.name}
						onfocus={pushUndoSnapshot}
						oninput={(e) => { panelSpot.name = e.currentTarget.value.trim() || panelSpot.name; venue = { ...venue }; renderEditModeShapes(); }}
					/>
				</div>

				<div class="sp-section">
					<span class="sp-section-label">Description</span>
					<textarea
						class="sp-input sp-textarea"
						value={panelSpot.description}
						onfocus={pushUndoSnapshot}
						oninput={(e) => { panelSpot.description = e.currentTarget.value; venue = { ...venue }; }}
						rows="2"
						placeholder="Enter description..."
					></textarea>
				</div>

				<div class="sp-section">
					<span class="sp-section-label">Category</span>
					<select class="sp-select" value={panelSpot.category} onchange={(e) => { pushUndoSnapshot(); panelSpot.category = e.currentTarget.value as POICategory; panelSpot.style = defaultStyle('spot', panelSpot.category); venue = { ...venue }; renderEditModeShapes(); }}>
						{#each categories as cat}
							<option value={cat}>{cat}</option>
						{/each}
					</select>
				</div>

				<div class="sp-section sp-color-row-section">
					<div class="sp-color-item">
						<span class="sp-section-label">Fill</span>
						<button class="sp-color-btn" style="background: {panelSpot.style.fill}; opacity: {panelSpot.style.opacity ?? 0.8}" onclick={() => { if (spColorPopup !== 'fill') pushUndoSnapshot(); spColorPopup = spColorPopup === 'fill' ? null : 'fill'; }}></button>
						{#if spColorPopup === 'fill'}
							<div class="sp-color-popup">
								<div class="sp-color-popup-grid">
									{#each colorSwatches as c}
										<button class="zt-swatch" class:active={panelSpot.style.fill === c} style="background: {c}" onclick={() => { panelSpot.style.fill = c; venue = { ...venue }; renderEditModeShapes(); }}></button>
									{/each}
									<input type="color" class="zt-color-input" value={panelSpot.style.fill} oninput={(e) => { panelSpot.style.fill = e.currentTarget.value; venue = { ...venue }; renderEditModeShapes(); }} />
								</div>
								<div class="sp-color-popup-slider">
									<span class="sp-color-popup-label">Opacity</span>
									<input type="range" class="zt-range" min="0.1" max="1" step="0.05" value={panelSpot.style.opacity ?? 0.8} oninput={(e) => { panelSpot.style.opacity = parseFloat(e.currentTarget.value); venue = { ...venue }; renderEditModeShapes(); }} />
									<span class="zt-range-val">{(panelSpot.style.opacity ?? 0.8).toFixed(2)}</span>
								</div>
							</div>
						{/if}
					</div>
					<div class="sp-color-item">
						<span class="sp-section-label">Stroke</span>
						<button class="sp-color-btn sp-color-btn-stroke" style="border-color: {panelSpot.style.stroke ?? '#cbd5e1'}" onclick={() => { if (spColorPopup !== 'stroke') pushUndoSnapshot(); spColorPopup = spColorPopup === 'stroke' ? null : 'stroke'; }}></button>
						{#if spColorPopup === 'stroke'}
							<div class="sp-color-popup">
								<div class="sp-color-popup-grid">
									{#each strokeSwatches as c}
										<button class="zt-swatch" class:active={(panelSpot.style.stroke ?? '#cbd5e1') === c} style="background: {c}" onclick={() => { panelSpot.style.stroke = c; venue = { ...venue }; renderEditModeShapes(); }}></button>
									{/each}
									<input type="color" class="zt-color-input" value={panelSpot.style.stroke ?? '#cbd5e1'} oninput={(e) => { panelSpot.style.stroke = e.currentTarget.value; venue = { ...venue }; renderEditModeShapes(); }} />
								</div>
							</div>
						{/if}
					</div>
				</div>

				<div class="sp-section sp-area-actions">
					{#if removeSpotConfirming}
						<span class="sp-confirm-text">Remove "{panelSpot.name}"?</span>
						<div class="sp-confirm-actions">
							<button class="zt-btn zt-btn-danger" onclick={() => removeSpotInEdit(editModeTarget.zoneId, panelSpotAreaId, panelSpot.id)}>Remove</button>
							<button class="zt-btn" onclick={() => removeSpotConfirming = false}>Cancel</button>
						</div>
					{:else}
						<div class="sp-area-action-row">
							<button class="zt-btn zt-btn-danger sp-area-action-btn" onclick={() => removeSpotConfirming = true}>Remove Spot</button>
							<button class="zt-btn sp-btn-reset sp-area-action-btn" onclick={() => { const layer = spotLayerMap.get(panelSpot.id); if (layer) startRedraw(layer, panelSpot); }}>Redraw Shape</button>
						</div>
					{/if}
				</div>
			{:else if panelArea}
				<!-- Area sub-panel (zone canvas stays) -->
				<div class="sp-section">
					<span class="sp-section-label">Area Name</span>
					<div class="sp-name-row">
						<input
							class="sp-input"
							type="text"
							value={panelArea.name}
							onfocus={pushUndoSnapshot}
							oninput={(e) => { panelArea.name = e.currentTarget.value.trim() || panelArea.name; venue = { ...venue }; renderEditModeShapes(); }}
						/>
					</div>
				</div>

				<div class="sp-section">
					<span class="sp-section-label">Category</span>
					<select class="sp-select" value={panelArea.category} onchange={(e) => { pushUndoSnapshot(); panelArea.category = e.currentTarget.value as POICategory; panelArea.style = defaultStyle('area', panelArea.category); venue = { ...venue }; renderEditModeShapes(); }}>
						{#each categories as cat}
							<option value={cat}>{cat}</option>
						{/each}
					</select>
				</div>

				<div class="sp-section sp-color-row-section">
					<div class="sp-color-item">
						<span class="sp-section-label">Fill</span>
						<button class="sp-color-btn" style="background: {panelArea.style.fill}; opacity: {panelArea.style.opacity ?? 0.85}" onclick={() => { if (spColorPopup !== 'fill') pushUndoSnapshot(); spColorPopup = spColorPopup === 'fill' ? null : 'fill'; }}></button>
						{#if spColorPopup === 'fill'}
							<div class="sp-color-popup">
								<div class="sp-color-popup-grid">
									{#each colorSwatches as c}
										<button class="zt-swatch" class:active={panelArea.style.fill === c} style="background: {c}" onclick={() => { panelArea.style.fill = c; venue = { ...venue }; renderEditModeShapes(); }}></button>
									{/each}
									<input type="color" class="zt-color-input" value={panelArea.style.fill} oninput={(e) => { panelArea.style.fill = e.currentTarget.value; venue = { ...venue }; renderEditModeShapes(); }} />
								</div>
								<div class="sp-color-popup-slider">
									<span class="sp-color-popup-label">Opacity</span>
									<input type="range" class="zt-range" min="0.1" max="1" step="0.05" value={panelArea.style.opacity ?? 0.85} oninput={(e) => { panelArea.style.opacity = parseFloat(e.currentTarget.value); venue = { ...venue }; renderEditModeShapes(); }} />
									<span class="zt-range-val">{(panelArea.style.opacity ?? 0.85).toFixed(2)}</span>
								</div>
							</div>
						{/if}
					</div>
					<div class="sp-color-item">
						<span class="sp-section-label">Stroke</span>
						<button class="sp-color-btn sp-color-btn-stroke" style="border-color: {panelArea.style.stroke ?? '#cbd5e1'}" onclick={() => { if (spColorPopup !== 'stroke') pushUndoSnapshot(); spColorPopup = spColorPopup === 'stroke' ? null : 'stroke'; }}></button>
						{#if spColorPopup === 'stroke'}
							<div class="sp-color-popup">
								<div class="sp-color-popup-grid">
									{#each strokeSwatches as c}
										<button class="zt-swatch" class:active={(panelArea.style.stroke ?? '#cbd5e1') === c} style="background: {c}" onclick={() => { panelArea.style.stroke = c; venue = { ...venue }; renderEditModeShapes(); }}></button>
									{/each}
									<input type="color" class="zt-color-input" value={panelArea.style.stroke ?? '#cbd5e1'} oninput={(e) => { panelArea.style.stroke = e.currentTarget.value; venue = { ...venue }; renderEditModeShapes(); }} />
								</div>
							</div>
						{/if}
					</div>
				</div>

				<div class="sp-section sp-area-actions">
					{#if removeAreaConfirming}
						<span class="sp-confirm-text">Remove "{panelArea.name}"?{panelArea.spots.length > 0 ? ` ${panelArea.spots.length} spot(s) will be moved to Unassigned.` : ''}</span>
						<div class="sp-confirm-actions">
							<button class="zt-btn zt-btn-danger" onclick={() => removeAreaInEdit(editModeTarget.zoneId, panelArea.id)}>Remove</button>
							<button class="zt-btn" onclick={() => removeAreaConfirming = false}>Cancel</button>
						</div>
					{:else}
						<button class="zt-btn sp-btn-reset sp-area-action-btn" onclick={() => { const layer = areaLayerMap.get(panelArea.id); if (layer) startRedraw(layer, panelArea); }}>Redraw Shape</button>
						<button class="zt-btn zt-btn-danger sp-area-action-btn" onclick={() => removeAreaConfirming = true}>Remove Area</button>
					{/if}
				</div>

				<div class="sp-section">
					<span class="sp-section-label">Spots ({panelArea.spots.length})</span>
					<div class="sp-spot-list">
						{#each panelArea.spots as spot}
							<button class="sp-spot-card" onclick={() => selectPanelSpot(spot.id, panelArea.id)}>
								<span class="sp-spot-dot" style="background: {CATEGORY_COLORS[spot.category]}"></span>
								<div class="sp-spot-info">
									<span class="sp-spot-name">{spot.name}</span>
									<span class="sp-spot-cat">{spot.category}</span>
								</div>
								<span class="sp-area-arrow">&#x203A;</span>
							</button>
						{/each}
						{#if panelArea.spots.length === 0}
							<span class="sp-empty">No spots</span>
						{/if}
					</div>
				</div>
			{:else}
			<div class="sp-section">
				<span class="sp-section-label">{isSpotEdit ? 'Spot' : isAreaEdit ? 'Area' : 'Zone'} Name</span>
				{#if !isSpotEdit}
					<div class="sp-name-row">
						<input
							class="sp-input"
							type="text"
							bind:value={panelName}
							onfocus={pushUndoSnapshot}
							oninput={panelUpdateName}
						/>
						<button class="sp-label-place-btn" class:active={placingLabel}
							onclick={() => { placingLabel = !placingLabel; }}
							title="Place label on map"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg></button>
					</div>
					{#if placingLabel}
						<span class="sp-label-hint">Click on map to place label</span>
					{/if}
					{#if (editEntity as any).labelPosition}
						<button class="sp-label-reset" onclick={() => {
							pushUndoSnapshot();
							(editEntity as any).labelPosition = undefined;
							venue = { ...venue };
							renderEditModeShapes();
						}}>Reset label position</button>
					{/if}
				{:else}
					<input
						class="sp-input"
						type="text"
						bind:value={panelName}
						onfocus={pushUndoSnapshot}
						oninput={panelUpdateName}
					/>
				{/if}
			</div>

			{#if isSpotEdit}
				<div class="sp-section">
					<span class="sp-section-label">Description</span>
					<textarea
						class="sp-input sp-textarea"
						bind:value={panelDescription}
						onfocus={pushUndoSnapshot}
						oninput={panelUpdateDescription}
						rows="2"
						placeholder="Enter description..."
					></textarea>
				</div>
			{/if}

			{#if isAreaEdit || isSpotEdit}
			<div class="sp-section">
				<span class="sp-section-label">Category</span>
				<select class="sp-select" value={panelCategory} onchange={(e) => panelUpdateCategory(e.currentTarget.value)}>
					{#each categories as cat}
						<option value={cat}>{cat}</option>
					{/each}
				</select>
			</div>
			{/if}

			<div class="sp-section sp-color-row-section">
				<div class="sp-color-item">
					<span class="sp-section-label">Fill</span>
					<button class="sp-color-btn" style="background: {panelFill}; opacity: {panelOpacity}" onclick={() => { if (spColorPopup !== 'fill') pushUndoSnapshot(); spColorPopup = spColorPopup === 'fill' ? null : 'fill'; }}></button>
					{#if spColorPopup === 'fill'}
						<div class="sp-color-popup">
							<div class="sp-color-popup-grid">
								{#each colorSwatches as c}
									<button class="zt-swatch" class:active={panelFill === c} style="background: {c}" onclick={() => { panelFill = c; panelApplyStyle(); }}></button>
								{/each}
								<input type="color" class="zt-color-input" bind:value={panelFill} oninput={panelApplyStyle} />
							</div>
							<div class="sp-color-popup-slider">
								<span class="sp-color-popup-label">Opacity</span>
								<input type="range" class="zt-range" min="0.1" max="1" step="0.05" bind:value={panelOpacity} oninput={panelApplyStyle} />
								<span class="zt-range-val">{panelOpacity.toFixed(2)}</span>
							</div>
						</div>
					{/if}
				</div>
				<div class="sp-color-item">
					<span class="sp-section-label">Stroke</span>
					<button class="sp-color-btn sp-color-btn-stroke" style="border-color: {panelStroke}" onclick={() => { if (spColorPopup !== 'stroke') pushUndoSnapshot(); spColorPopup = spColorPopup === 'stroke' ? null : 'stroke'; }}></button>
					{#if spColorPopup === 'stroke'}
						<div class="sp-color-popup">
							<div class="sp-color-popup-grid">
								{#each strokeSwatches as c}
									<button class="zt-swatch" class:active={panelStroke === c} style="background: {c}" onclick={() => { panelStroke = c; panelApplyStyle(); }}></button>
								{/each}
								<input type="color" class="zt-color-input" bind:value={panelStroke} oninput={panelApplyStyle} />
							</div>
						</div>
					{/if}
				</div>
			</div>

			{#if !isAreaEdit && !isSpotEdit}
			<div class="sp-section sp-section-overlay">
				<span class="sp-section-label">Image Overlay</span>
				{#if overlayImageUrl}
					<div class="sp-overlay-preview">
						<img src={overlayImageUrl} alt="Overlay" class="sp-overlay-thumb" />
						<button class="sp-overlay-remove" onclick={clearOverlay} title="Remove overlay">&#x2715;</button>
					</div>
					<div class="sp-style-row">
						<span class="sp-overlay-label">Opacity</span>
						<input type="range" class="zt-range sp-range-full" min="0" max="1" step="0.05" bind:value={overlayOpacity} oninput={updateOverlayOpacity} onpointerdown={onOverlayOpacityStart} />
						<span class="zt-range-val">{overlayOpacity.toFixed(2)}</span>
					</div>
					<button class="zt-btn sp-btn-reset" onclick={resetOverlay}>Reset Image</button>
					{:else}
					<label class="sp-overlay-upload">
						<input type="file" accept="image/*" onchange={handleOverlayFile} hidden />
						<span class="zt-btn sp-overlay-btn">Choose Image</span>
					</label>
				{/if}
			</div>

			<div class="sp-section sp-area-actions">
				{#if removeZoneConfirming}
					<span class="sp-confirm-text">Remove this zone and all its areas?</span>
					<div class="sp-confirm-actions">
						<button class="zt-btn zt-btn-danger" onclick={() => removeZoneInEdit(editModeTarget.zoneId)}>Remove</button>
						<button class="zt-btn" onclick={() => removeZoneConfirming = false}>Cancel</button>
					</div>
				{:else}
					<button class="zt-btn sp-btn-reset sp-area-action-btn" onclick={startRedraw}>Redraw Shape</button>
					<button class="zt-btn zt-btn-danger sp-area-action-btn" onclick={() => removeZoneConfirming = true}>Remove Zone</button>
				{/if}
			</div>
			{:else}
			<div class="sp-section">
				<span class="sp-section-label">Shape</span>
				<div class="sp-style-row">
					<span class="sp-section-label" style="margin-bottom: 0; font-size: 11px;">Vertex Size</span>
					<input type="range" class="zt-range sp-range-full" min="20" max="50" step="1" bind:value={vertexSize} oninput={() => localStorage.setItem('mapEditor:vertexSize', String(vertexSize))} />
					<span class="zt-range-val">{vertexSize}</span>
				</div>
				<button class="zt-btn sp-btn-reset" onclick={resetEditModeShapes}>Reset Shape</button>
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
						<input type="range" class="zt-range sp-range-full" min="0" max="1" step="0.05" bind:value={overlayOpacity} oninput={updateOverlayOpacity} onpointerdown={onOverlayOpacityStart} />
						<span class="zt-range-val">{overlayOpacity.toFixed(2)}</span>
					</div>
					<button class="zt-btn sp-btn-reset" onclick={resetOverlay}>Reset Image</button>
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
					<div class="sp-spot-list">
						{#if addingSpot}
							<div class="sp-add-spot-form">
								{#if addSpotDrawing}
									<span class="sp-add-spot-hint">Draw the spot shape on the map</span>
									<button class="zt-btn sp-add-spot-cancel" onclick={cancelAddSpot}>Cancel</button>
								{:else}
									<input
										class="sp-input"
										type="text"
										placeholder="Spot name..."
										bind:value={addSpotName}
										onkeydown={(e) => { if (e.key === 'Enter' && addSpotName.trim()) startAddSpotDraw(); if (e.key === 'Escape') cancelAddSpot(); }}
									/>
									<div class="sp-add-spot-actions">
										<button class="zt-btn zt-btn-primary" onclick={startAddSpotDraw} disabled={!addSpotName.trim()}>Draw</button>
										<button class="zt-btn" onclick={cancelAddSpot}>Cancel</button>
									</div>
								{/if}
							</div>
						{:else}
							<button class="sp-spot-card sp-spot-add-row" onclick={() => { addingSpot = true; addSpotName = ''; }}>
								<span class="sp-spot-add-icon">+</span>
								<span class="sp-spot-add-text">Add Spot</span>
							</button>
						{/if}
						{#each editArea.spots as spot}
							<button class="sp-spot-card" onclick={() => selectPanelSpot(spot.id, (editModeTarget as any).areaId)}>
								<span class="sp-spot-dot" style="background: {CATEGORY_COLORS[spot.category]}"></span>
								<div class="sp-spot-info">
									<span class="sp-spot-name">{spot.name}</span>
									<span class="sp-spot-cat">{spot.category}</span>
								</div>
								<span class="sp-area-arrow">&#x203A;</span>
							</button>
						{/each}
						{#if editArea.spots.length === 0 && !addingSpot}
							<span class="sp-empty">No spots</span>
						{/if}
					</div>
				</div>

				<div class="sp-section sp-area-actions">
					{#if removeAreaConfirming}
						<span class="sp-confirm-text">Remove "{editArea.name}"?{editArea.spots.length > 0 ? ` ${editArea.spots.length} spot(s) will be moved to Unassigned.` : ''}</span>
						<div class="sp-confirm-actions">
							<button class="zt-btn zt-btn-danger" onclick={() => removeAreaInEdit(editModeTarget.zoneId, (editModeTarget as any).areaId)}>Remove</button>
							<button class="zt-btn" onclick={() => removeAreaConfirming = false}>Cancel</button>
						</div>
					{:else}
						<div class="sp-area-action-row">
							<button class="zt-btn zt-btn-danger sp-area-action-btn" onclick={() => removeAreaConfirming = true}>Remove Area</button>
							<button class="zt-btn sp-btn-reset sp-area-action-btn" onclick={startRedraw}>Redraw Shape</button>
						</div>
					{/if}
				</div>
				{/if}
			{:else if editZone}
				<div class="sp-section">
					<span class="sp-section-label">Areas ({editZone.areas.length})</span>
					<div class="sp-area-list">
						{#if addingArea}
							<div class="sp-add-spot-form">
								{#if addAreaDrawing}
									<span class="sp-add-spot-hint">Draw the area shape on the map</span>
									<button class="zt-btn sp-add-spot-cancel" onclick={cancelAddArea}>Cancel</button>
								{:else}
									<input
										class="sp-input"
										type="text"
										placeholder="Area name..."
										bind:value={addAreaName}
										onkeydown={(e) => { if (e.key === 'Enter' && addAreaName.trim()) startAddAreaDraw(); if (e.key === 'Escape') cancelAddArea(); }}
									/>
									<div class="sp-add-spot-actions">
										<button class="zt-btn zt-btn-primary" onclick={startAddAreaDraw} disabled={!addAreaName.trim()}>Draw</button>
										<button class="zt-btn" onclick={cancelAddArea}>Cancel</button>
									</div>
								{/if}
							</div>
						{:else}
							<button class="sp-spot-card sp-spot-add-row" onclick={() => { addingArea = true; addAreaName = ''; }}>
								<span class="sp-spot-add-icon">+</span>
								<span class="sp-spot-add-text">Add Area</span>
							</button>
						{/if}
						{#each editZone.areas as area}
							<button class="sp-spot-card" onclick={() => selectPanelArea(area.id)}>
								<span class="sp-spot-dot" style="background: {CATEGORY_COLORS[area.category]}"></span>
								<div class="sp-spot-info">
									<span class="sp-spot-name">{area.name}</span>
									<span class="sp-spot-cat">{area.category}</span>
								</div>
								<span class="sp-area-arrow">&#x203A;</span>
							</button>
						{/each}
						{#if editZone.areas.length === 0 && !addingArea}
							<span class="sp-empty">No areas</span>
						{/if}
					</div>
				</div>
			{/if}
			{/if}
			{/if}

			</div>

			<div class="sp-footer">
				<button class="zt-btn zt-btn-primary sp-done-btn" onclick={() => exitEditMode()}>Save</button>
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
				{#if drawLevel !== 'zone'}
				<label>
					Category
					<select bind:value={dialogCategory}>
						{#each categories as cat}
							<option value={cat}>{cat}</option>
						{/each}
					</select>
				</label>
				{/if}
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
		overflow: visible;
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
		padding-bottom: 40px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.sp-footer {
		padding: 12px 16px;
		border-top: 1px solid #334155;
		flex-shrink: 0;
	}

	.sp-header-balance {
		width: 30px;
		flex-shrink: 0;
	}

	.sp-title {
		flex: 1;
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

	.sp-section-area-style {
		gap: 12px;
	}

	.sp-section-label {
		font-size: 11px;
		font-weight: 700;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.sp-section-stroke {
		margin-top: 8px;
		padding-top: 16px;
		border-top: 1px solid #334155;
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

	.sp-select {
		width: 100%;
		padding: 8px 10px;
		border: 1px solid #334155;
		border-radius: 8px;
		font-size: 14px;
		font-family: 'Inter', sans-serif;
		background: #0f172a;
		color: #e2e8f0;
		outline: none;
		text-transform: capitalize;
		cursor: pointer;
	}

	.sp-select:focus {
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
		width: 12px;
		height: 12px;
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

	.sp-swatches-single-row {
		flex-wrap: nowrap;
		overflow: hidden;
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
		gap: 6px;
	}

	.sp-area-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		background: #0f172a;
		border: 1px solid #334155;
		border-radius: 8px;
	}

	.sp-area-name {
		font-size: 15px;
		font-weight: 500;
		color: #e2e8f0;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sp-area-cat {
		font-size: 13px;
		color: #64748b;
		text-transform: capitalize;
	}

	.sp-area-item-clickable {
		cursor: pointer;
		font-family: inherit;
		text-align: left;
		transition: background 0.15s;
	}
	.sp-area-item-clickable:hover {
		background: #1e293b;
		border-color: #475569;
	}

	.sp-area-arrow {
		color: #64748b;
		font-size: 18px;
		font-weight: 600;
	}

	/* Spot cards (bigger style) */
	.sp-add-spot-form {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		background: #0f172a;
		border: 1px solid #475569;
		border-radius: 6px;
		margin-bottom: 8px;
	}
	.sp-add-spot-actions {
		display: flex;
		gap: 6px;
	}
	.sp-add-spot-hint {
		font-size: 12px;
		color: #facc15;
	}
	.sp-add-spot-cancel {
		align-self: flex-start;
	}
	.sp-spot-add-row {
		border-style: dashed;
		border-color: #475569;
		justify-content: center;
		gap: 6px;
	}
	.sp-spot-add-row:hover {
		border-color: #60a5fa;
		background: #1e293b;
	}
	.sp-spot-add-icon {
		font-size: 18px;
		font-weight: 600;
		color: #60a5fa;
		line-height: 1;
	}
	.sp-spot-add-text {
		font-size: 13px;
		font-weight: 500;
		color: #94a3b8;
	}
	.sp-spot-add-row:hover .sp-spot-add-text {
		color: #e2e8f0;
	}
	.sp-spot-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.sp-spot-card {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		background: #0f172a;
		border: 1px solid #334155;
		border-radius: 8px;
		cursor: pointer;
		font-family: inherit;
		text-align: left;
		transition: background 0.15s, border-color 0.15s;
	}
	.sp-spot-card:hover {
		background: #1e293b;
		border-color: #475569;
	}
	.sp-spot-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.sp-spot-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.sp-spot-name {
		font-size: 14px;
		font-weight: 500;
		color: #e2e8f0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sp-spot-cat {
		font-size: 11px;
		color: #64748b;
		text-transform: capitalize;
	}

	.sp-back-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 10px;
		margin-bottom: 4px;
		background: none;
		border: none;
		color: #60a5fa;
		font-size: 12px;
		font-family: inherit;
		cursor: pointer;
		border-radius: 4px;
	}
	.sp-back-btn:hover {
		background: #1e293b;
	}

	.sp-textarea {
		resize: vertical;
		min-height: 40px;
		font-family: inherit;
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

	.sp-area-actions {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.sp-area-action-row {
		display: flex;
		gap: 8px;
	}
	.sp-area-action-btn {
		flex: 1;
	}
	.sp-confirm-text {
		font-size: 13px;
		color: #fbbf24;
		line-height: 1.4;
	}
	.sp-confirm-actions {
		display: flex;
		gap: 8px;
	}

	/* Color picker row (fill + stroke buttons side by side) */
	.sp-color-row-section {
		flex-direction: row;
		gap: 12px;
	}
	.sp-color-item {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
	}
	.sp-color-btn {
		width: 32px;
		height: 32px;
		border-radius: 6px;
		border: 2px solid #475569;
		cursor: pointer;
		padding: 0;
		transition: transform 0.1s;
	}
	.sp-color-btn:hover {
		transform: scale(1.1);
	}
	.sp-color-btn-stroke {
		background: transparent;
		border-width: 4px;
	}
	.sp-color-popup {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 20;
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 10px;
		padding: 10px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
		min-width: 200px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.sp-color-popup-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		align-items: center;
	}
	.sp-color-popup-slider {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.sp-color-popup-label {
		font-size: 11px;
		font-weight: 600;
		color: #94a3b8;
		text-transform: uppercase;
		width: 48px;
		flex-shrink: 0;
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

	.map-fab:disabled {
		opacity: 0.35;
		cursor: default;
		pointer-events: none;
	}

	.fab-row-bottom-right {
		position: absolute;
		bottom: 16px;
		right: 16px;
		z-index: 500;
		display: flex;
		flex-direction: row;
		gap: 8px;
		pointer-events: none;
	}

	.fab-center-bottom {
		position: absolute;
		bottom: 16px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 500;
	}
	.vertex-delete-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		background: #ef4444;
		color: #fff;
		border: none;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		transition: background 0.15s;
	}
	.vertex-delete-btn:hover {
		background: #dc2626;
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

	.zone-toolbar-bottom {
		bottom: 20px;
		left: 50%;
		transform: translateX(-50%);
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		min-width: auto;
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
		-webkit-appearance: none;
		appearance: none;
		background: #334155;
		border-radius: 2px;
	}

	.zt-range::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #818cf8;
		border: 2px solid #fff;
		cursor: pointer;
	}

	.zt-range::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #818cf8;
		border: 2px solid #fff;
		cursor: pointer;
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

	.relocate-banner {
		position: absolute;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 1000;
		background: #1e293b;
		border: 1px solid #818cf8;
		color: #e2e8f0;
		padding: 8px 16px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 500;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
		white-space: nowrap;
	}

	.relocate-cancel {
		background: none;
		border: none;
		color: #818cf8;
		cursor: pointer;
		font-size: 13px;
		font-weight: 600;
		text-decoration: underline;
		padding: 0;
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
	:global(.shape-edge-handle-container) {
		background: transparent !important;
		border: none !important;
		box-shadow: none !important;
	}
	:global(.shape-edge-handle) {
		width: 30px;
		height: 8px;
		background: #38bdf8;
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
	:global(.shape-edge-handle:hover) {
		background: #0ea5e9;
	}

	/* Geoman vertex marker sizing via CSS variable */
	:global(.map-area .marker-icon) {
		width: var(--vertex-size, 20px) !important;
		height: var(--vertex-size, 20px) !important;
		margin-left: calc(var(--vertex-size, 20px) / -2) !important;
		margin-top: calc(var(--vertex-size, 20px) / -2) !important;
		border-radius: 50%;
		background: #3b82f6 !important;
		border-color: #60a5fa !important;
	}
	:global(.map-area .marker-icon-middle) {
		background: #ffffff !important;
		border-color: #cbd5e1 !important;
		opacity: 0.8;
	}
	:global(.map-area .marker-icon-middle:hover) {
		opacity: 1;
	}

	/* Label placement */
	.sp-name-row { display: flex; gap: 6px; align-items: center; }
	.sp-name-row .sp-input { flex: 1; }
	.sp-label-place-btn {
		width: 32px; height: 32px;
		background: #1e293b; border: 1px solid #334155;
		border-radius: 6px; color: #94a3b8;
		font-size: 16px; cursor: pointer;
		display: flex; align-items: center; justify-content: center;
		flex-shrink: 0;
	}
	.sp-label-place-btn:hover { background: #334155; color: #e2e8f0; }
	.sp-label-place-btn.active { background: #facc15; color: #000; border-color: #facc15; }
	.sp-label-hint {
		font-size: 11px; color: #facc15; margin-top: 4px; display: block;
	}
	.sp-label-reset {
		font-size: 11px; color: #94a3b8; background: none; border: none;
		cursor: pointer; padding: 0; margin-top: 4px; text-decoration: underline;
	}
	.sp-label-reset:hover { color: #e2e8f0; }
	.placing-label { cursor: crosshair !important; }
	:global(.label-drag-marker) {
		cursor: grab !important;
		white-space: nowrap;
	}
	:global(.label-drag-marker span) {
		position: relative;
		left: -50%;
		pointer-events: auto;
		padding: 2px 6px;
		border-radius: 3px;
		background: rgba(0,0,0,0.5);
	}
	:global(.label-drag-marker.label-zone span) {
		font-weight: 600;
		font-size: 12px;
	}
	:global(.label-drag-marker.label-area span) {
		font-weight: 500;
		font-size: 11px;
	}
	:global(.leaflet-dragging .label-drag-marker) {
		cursor: grabbing !important;
	}

	/* Shape toolbox (center-bottom of canvas) */
	.shape-toolbox {
		position: absolute;
		bottom: 16px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 600;
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 6px;
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 10px;
		padding: 6px 8px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
		pointer-events: auto;
	}
	.stb-item {
		position: relative;
	}
	.stb-swatch {
		width: 28px;
		height: 28px;
		border-radius: 6px;
		border: 2px solid #475569;
		cursor: pointer;
		padding: 0;
		transition: transform 0.1s;
	}
	.stb-swatch:hover {
		transform: scale(1.12);
	}
	.stb-stroke-swatch {
		background: transparent;
		border-width: 3px;
	}
	.stb-btn {
		width: 28px;
		height: 28px;
		border-radius: 6px;
		border: 1px solid #334155;
		background: #0f172a;
		color: #94a3b8;
		cursor: pointer;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.12s;
	}
	.stb-btn:hover {
		background: #334155;
		color: #f1f5f9;
	}
	.stb-popover {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%);
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 10px;
		padding: 10px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
		min-width: 200px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.stb-popover-title {
		font-size: 11px;
		font-weight: 600;
		color: #94a3b8;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.stb-popover-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		align-items: center;
	}
	.stb-opacity-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.stb-label {
		font-size: 11px;
		color: #94a3b8;
		font-weight: 600;
		text-transform: uppercase;
		width: 48px;
		flex-shrink: 0;
	}
	.stb-range {
		max-width: none;
		flex: 1;
	}

</style>
