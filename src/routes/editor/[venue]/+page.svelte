<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { parkVenue } from '$lib/data/park.ts';
	import { mallVenue } from '$lib/data/mall.ts';
	import { airportVenue } from '$lib/data/airport.ts';
	import { loadVenue, saveVenue } from '$lib/storage.ts';
	import MapEditor from '$lib/components/MapEditor.svelte';
	import type { Venue, EditingTarget } from '$lib/types.ts';

	const defaultVenues: Record<string, Venue> = {
		park: parkVenue,
		mall: mallVenue,
		airport: airportVenue
	};

	let venueId = $derived($page.params.venue ?? 'park');
	let venue = $state<Venue>(getVenue($page.params.venue ?? 'park'));

	function getVenue(id: string): Venue {
		const saved = loadVenue(id);
		if (saved) return saved;
		return structuredClone(defaultVenues[id] ?? parkVenue);
	}

	// Parse edit target from URL query params
	function getInitialEditTarget(): EditingTarget | null {
		const url = $page.url;
		const editType = url.searchParams.get('edit');
		const zoneId = url.searchParams.get('zone');
		const areaId = url.searchParams.get('area');
		const spotId = url.searchParams.get('spot');

		if (!editType || !zoneId) return null;

		if (editType === 'spot' && areaId && spotId) {
			return { type: 'spot', zoneId, areaId, spotId };
		}
		if (editType === 'area' && areaId) {
			return { type: 'area', zoneId, areaId };
		}
		if (editType === 'zone') {
			return { type: 'zone', zoneId };
		}
		return null;
	}

	let initialEditTarget = getInitialEditTarget();

	function handleEditChange(target: EditingTarget | null) {
		const url = new URL($page.url);
		if (target) {
			url.searchParams.set('edit', target.type);
			url.searchParams.set('zone', target.zoneId);
			if ('areaId' in target) {
				url.searchParams.set('area', target.areaId);
			} else {
				url.searchParams.delete('area');
			}
			if ('spotId' in target) {
				url.searchParams.set('spot', target.spotId);
			} else {
				url.searchParams.delete('spot');
			}
		} else {
			url.searchParams.delete('edit');
			url.searchParams.delete('zone');
			url.searchParams.delete('area');
			url.searchParams.delete('spot');
		}
		// Replace URL without navigation (no page reload)
		goto(url.pathname + url.search, { replaceState: true, noScroll: true, keepFocus: true });
	}

	// React to route param changes
	$effect(() => {
		const id = $page.params.venue ?? 'park';
		venue = getVenue(id);
	});

	// Auto-save venue changes to localStorage
	$effect(() => {
		if (venue) saveVenue(venue);
	});
</script>

<svelte:head>
	<title>Editor — {venue.name} — POC-Map</title>
</svelte:head>

<div class="editor-page">
	<MapEditor bind:venue {initialEditTarget} oneditchange={handleEditChange} />
</div>

<style>
	.editor-page {
		height: 100%;
	}
</style>
