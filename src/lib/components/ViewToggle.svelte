<script lang="ts">
	import { mapStore } from '$lib/mapStore.svelte.ts';
</script>

<div class="view-toggle">
	<button
		class:active={mapStore.viewMode === 'flat'}
		onclick={() => { if (mapStore.viewMode !== 'flat') mapStore.toggleView(); }}
	>
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
			<rect x="1" y="4" width="5" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/>
			<rect x="10" y="4" width="5" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/>
		</svg>
		Flat
	</button>
	<button
		class:active={mapStore.viewMode === 'isometric'}
		onclick={() => { if (mapStore.viewMode !== 'isometric') mapStore.toggleView(); }}
	>
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
			<path d="M2 10L8 13L14 10L14 6L8 3L2 6Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
			<path d="M2 7L8 10L14 7" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
		</svg>
		3D
	</button>
</div>

<style>
	.view-toggle {
		display: flex;
		gap: 2px;
		background: #f1f5f9;
		border-radius: 10px;
		padding: 3px;
	}

	button {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 6px 14px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: #64748b;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		font-family: 'Inter', sans-serif;
	}

	button:hover {
		color: #334155;
	}

	button.active {
		background: white;
		color: #1e293b;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}
</style>
