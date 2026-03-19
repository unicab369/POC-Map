<script lang="ts">
	import type { POICategory } from '$lib/types.ts';
	import { CATEGORY_COLORS, CATEGORY_ICONS } from '$lib/types.ts';
	import { mapStore } from '$lib/mapStore.svelte.ts';

	let { categories }: { categories: POICategory[] } = $props();
</script>

<div class="category-filter">
	<span class="filter-label">Filter</span>
	<div class="filter-chips">
		{#each categories as cat}
			{@const active = mapStore.isCategoryActive(cat)}
			<button
				class="chip"
				class:active
				style="--chip-color: {CATEGORY_COLORS[cat]}"
				onclick={() => mapStore.toggleCategory(cat)}
			>
				<span class="chip-icon">{CATEGORY_ICONS[cat]}</span>
				<span class="chip-label">{cat}</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.category-filter {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.filter-label {
		font-size: 12px;
		font-weight: 600;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.filter-chips {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}

	.chip {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		border: 1.5px solid #334155;
		border-radius: 20px;
		background: #1e293b;
		cursor: pointer;
		transition: all 0.2s;
		font-family: 'Inter', sans-serif;
		font-size: 12px;
		color: #94a3b8;
	}

	.chip:hover {
		border-color: var(--chip-color);
	}

	.chip.active {
		border-color: var(--chip-color);
		background: color-mix(in srgb, var(--chip-color) 15%, #1e293b);
		color: #e2e8f0;
	}

	.chip-icon {
		font-size: 13px;
	}

	.chip-label {
		text-transform: capitalize;
		font-weight: 500;
	}
</style>
