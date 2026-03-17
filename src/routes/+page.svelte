<script lang="ts">
	import VenueCard from '$lib/components/VenueCard.svelte';
	import { parkVenue } from '$lib/data/park.ts';
	import { mallVenue } from '$lib/data/mall.ts';
	import { airportVenue } from '$lib/data/airport.ts';
	import type { Venue } from '$lib/types.ts';

	const venues = [parkVenue, mallVenue, airportVenue];

	function countSpots(venue: Venue): number {
		let count = 0;
		for (const floor of venue.floors) {
			for (const zone of floor.zones) {
				for (const area of zone.areas) {
					count += area.spots.length;
				}
			}
		}
		return count;
	}
</script>

<svelte:head>
	<title>POC-Map — Venue Explorer</title>
</svelte:head>

<div class="home">
	<div class="hero">
		<h1>Venue Map Explorer</h1>
		<p>Interactive floor plans with flat and isometric views. Choose a venue to explore.</p>
	</div>
	<div class="grid">
		{#each venues as venue}
			<VenueCard
				name={venue.name}
				type={venue.type}
				description={venue.description}
				floorCount={venue.floors.length}
				spotCount={countSpots(venue)}
			/>
		{/each}
	</div>
</div>

<style>
	.home {
		max-width: 960px;
		margin: 0 auto;
		padding: 48px 24px;
		overflow-y: auto;
		height: 100%;
	}

	.hero {
		text-align: center;
		margin-bottom: 40px;
	}

	.hero h1 {
		font-size: 36px;
		font-weight: 800;
		color: #0f172a;
		letter-spacing: -0.03em;
		margin-bottom: 8px;
	}

	.hero p {
		font-size: 16px;
		color: #64748b;
		max-width: 480px;
		margin: 0 auto;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 24px;
	}
</style>
