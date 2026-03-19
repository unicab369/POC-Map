<script lang="ts">
	import { page } from '$app/stores';
	import { parkVenue } from '$lib/data/park.ts';
	import { mallVenue } from '$lib/data/mall.ts';
	import { airportVenue } from '$lib/data/airport.ts';
	import { loadVenue } from '$lib/storage.ts';
	import MapEditor from '$lib/components/MapEditor.svelte';
	import type { Venue } from '$lib/types.ts';

	const defaultVenues: Record<string, Venue> = {
		park: parkVenue,
		mall: mallVenue,
		airport: airportVenue
	};

	let venueId = $derived($page.params.venue ?? 'park');
	let venue = $state<Venue>(getVenue($page.params.venue ?? 'park'));
	let floorIndex = $state(0);

	function getVenue(id: string): Venue {
		const saved = loadVenue(id);
		if (saved) return saved;
		return structuredClone(defaultVenues[id] ?? parkVenue);
	}

	// React to route param changes
	$effect(() => {
		const id = $page.params.venue ?? 'park';
		venue = getVenue(id);
		floorIndex = 0;
	});
</script>

<svelte:head>
	<title>Editor — {venue.name} — POC-Map</title>
</svelte:head>

<div class="editor-page">
	<MapEditor bind:venue bind:floorIndex />
</div>

<style>
	.editor-page {
		height: 100%;
	}
</style>
