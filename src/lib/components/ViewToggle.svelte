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
		background: #0f172a;
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
		color: #94a3b8;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		font-family: 'Inter', sans-serif;
	}

	button:hover {
		color: #e2e8f0;
	}

	button.active {
		background: #334155;
		color: #f1f5f9;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
	}
</style>
