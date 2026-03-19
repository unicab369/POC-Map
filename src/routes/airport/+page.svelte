<script lang="ts">
	import { onMount } from 'svelte';
	import MapCanvas from '$lib/components/MapCanvas.svelte';
	import POIPopup from '$lib/components/POIPopup.svelte';
	import ViewToggle from '$lib/components/ViewToggle.svelte';
	import CategoryFilter from '$lib/components/CategoryFilter.svelte';
	import { airportVenue } from '$lib/data/airport.ts';
	import { mapStore } from '$lib/mapStore.svelte.ts';
	import type { POICategory } from '$lib/types.ts';

	const venue = airportVenue;
	const categories: POICategory[] = ['gate', 'security', 'shop', 'food', 'restroom', 'info'];

	onMount(() => {
		mapStore.clearSelection();
		mapStore.resetFilters();
	});
</script>

<svelte:head>
	<title>{venue.name} — POC-Map</title>
</svelte:head>

<div class="venue-page">
	<div class="toolbar">
		<div class="toolbar-left">
			<h1>{venue.name}</h1>
		</div>
		<div class="toolbar-center">
			<CategoryFilter {categories} />
		</div>
		<div class="toolbar-right">
			<ViewToggle />
		</div>
	</div>
	<div class="canvas-wrapper">
		<MapCanvas {venue} />
		<POIPopup />
	</div>
</div>

<style>
	.venue-page {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 10px 20px;
		background: #1e293b;
		border-bottom: 1px solid #334155;
		flex-shrink: 0;
		flex-wrap: wrap;
	}

	.toolbar-left h1 {
		font-size: 16px;
		font-weight: 700;
		white-space: nowrap;
	}

	.toolbar-center {
		flex: 1;
		display: flex;
		justify-content: center;
	}

	.toolbar-right {
		flex-shrink: 0;
	}

	.canvas-wrapper {
		flex: 1;
		position: relative;
		overflow: hidden;
	}
</style>
