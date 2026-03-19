<script lang="ts">
	import { onMount } from 'svelte';
	import Konva from 'konva';
	import type { Venue, Spot } from '$lib/types.ts';
	import { mapStore } from '$lib/mapStore.svelte.ts';
	import { renderVenue, updateSpotVisibility } from '$lib/components/FloorRenderer.ts';
	import { getFlatLayout, getIsometricLayout, animateToLayout } from '$lib/isometric.ts';

	let { venue }: { venue: Venue } = $props();

	let containerEl: HTMLDivElement;
	let stage: Konva.Stage;
	let layer: Konva.Layer;
	let venueGroup: Konva.Group;

	function handleSpotClick(spot: Spot, evt: Konva.KonvaEventObject<MouseEvent>) {
		const markerNode = evt.currentTarget;
		const transform = markerNode.getAbsoluteTransform();
		const pos = transform.point({ x: 0, y: 0 });
		mapStore.selectSpot(spot, pos.x, pos.y);
	}

	function applyLayout() {
		if (!stage || !venueGroup) return;
		const layout =
			mapStore.viewMode === 'isometric'
				? getIsometricLayout(venue, stage.width(), stage.height())
				: getFlatLayout(venue, stage.width(), stage.height());
		animateToLayout(venueGroup, layout);
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

		const wrapper = new Konva.Group({ name: `venuegroup-${venue.id}` });
		const venueShape = renderVenue(venue, handleSpotClick, mapStore.activeCategories);
		wrapper.add(venueShape);

		layer.add(wrapper);
		venueGroup = wrapper;

		// Apply initial flat layout
		const layout = getFlatLayout(venue, width, height);
		wrapper.setAttrs({
			x: layout.x,
			y: layout.y,
			scaleX: layout.scaleX,
			scaleY: layout.scaleY,
			skewX: layout.skewX,
			rotation: layout.rotation
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
		if (stage && venueGroup) {
			applyLayout();
		}
	});

	// React to category filter changes
	$effect(() => {
		const _cats = mapStore.activeCategories;
		if (layer) {
			updateSpotVisibility(layer, venue, mapStore.activeCategories);
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
