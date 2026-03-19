<script lang="ts">
	import { onMount } from 'svelte';
	import Konva from 'konva';
	import type { Venue, Spot } from '$lib/types.ts';
	import { mapStore } from '$lib/mapStore.svelte.ts';
	import { renderFloor, updateSpotVisibility } from '$lib/components/FloorRenderer.ts';
	import { getFlatLayout, getIsometricLayout, animateToLayout } from '$lib/isometric.ts';

	let { venue }: { venue: Venue } = $props();

	let containerEl: HTMLDivElement;
	let stage: Konva.Stage;
	let layer: Konva.Layer;
	let floorGroups: Konva.Group[] = [];

	function handleSpotClick(spot: Spot, evt: Konva.KonvaEventObject<MouseEvent>) {
		const markerNode = evt.currentTarget;
		const transform = markerNode.getAbsoluteTransform();
		const pos = transform.point({ x: 0, y: 0 });
		mapStore.selectSpot(spot, pos.x, pos.y);
	}

	function applyLayout() {
		if (!stage || floorGroups.length === 0) return;
		const layouts =
			mapStore.viewMode === 'isometric'
				? getIsometricLayout(venue.floors, stage.width(), stage.height())
				: getFlatLayout(venue.floors, stage.width(), stage.height());
		animateToLayout(floorGroups, layouts);
		mapStore.clearSelection();
	}

	function buildCanvas() {
		if (!containerEl) return;

		const width = containerEl.clientWidth;
		const height = containerEl.clientHeight;

		stage = new Konva.Stage({
			container: containerEl,
			width,
			height,
			draggable: true
		});

		layer = new Konva.Layer();
		stage.add(layer);

		floorGroups = [];

		for (const floor of venue.floors) {
			const floorGroup = new Konva.Group({ name: `floorgroup-${floor.id}` });
			const floorShape = renderFloor(floor, handleSpotClick, mapStore.activeCategories);
			floorGroup.add(floorShape);

			layer.add(floorGroup);
			floorGroups.push(floorGroup);
		}

		// Apply initial flat layout
		const layouts = getFlatLayout(venue.floors, width, height);
		floorGroups.forEach((group, i) => {
			const l = layouts[i];
			group.setAttrs({
				x: l.x,
				y: l.y,
				scaleX: l.scaleX,
				scaleY: l.scaleY,
				skewX: l.skewX,
				rotation: l.rotation
			});
		});

		layer.draw();

		// Zoom via mouse wheel
		stage.on('wheel', (e) => {
			e.evt.preventDefault();
			const scaleBy = 1.08;
			const oldScale = stage.scaleX();
			const pointer = stage.getPointerPosition()!;

			const mousePointTo = {
				x: (pointer.x - stage.x()) / oldScale,
				y: (pointer.y - stage.y()) / oldScale
			};

			const direction = e.evt.deltaY > 0 ? -1 : 1;
			const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
			const clampedScale = Math.max(0.1, Math.min(20, newScale));

			stage.scale({ x: clampedScale, y: clampedScale });

			const newPos = {
				x: pointer.x - mousePointTo.x * clampedScale,
				y: pointer.y - mousePointTo.y * clampedScale
			};
			stage.position(newPos);
		});


		// Click on empty space to deselect
		stage.on('click tap', (e) => {
			if (e.target === stage) {
				mapStore.clearSelection();
			}
		});
	}

	function handleResize() {
		if (!stage || !containerEl) return;
		stage.width(containerEl.clientWidth);
		stage.height(containerEl.clientHeight);
		applyLayout();
	}

	onMount(() => {
		buildCanvas();
		window.addEventListener('resize', handleResize);
		return () => {
			window.removeEventListener('resize', handleResize);
			stage?.destroy();
		};
	});

	// React to view mode changes
	$effect(() => {
		const _mode = mapStore.viewMode;
		if (stage && floorGroups.length > 0) {
			applyLayout();
		}
	});

	// React to category filter changes
	$effect(() => {
		const _cats = mapStore.activeCategories;
		if (layer) {
			for (const floor of venue.floors) {
				updateSpotVisibility(layer, floor, mapStore.activeCategories);
			}
		}
	});
</script>

<div class="map-container" bind:this={containerEl}></div>

<style>
	.map-container {
		width: 100%;
		height: 100%;
		position: relative;
		overflow: hidden;
		background: #0f172a;
		border-radius: 12px;
	}
</style>
