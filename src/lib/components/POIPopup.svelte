<script lang="ts">
	import { mapStore } from '$lib/mapStore.svelte.ts';
	import { CATEGORY_COLORS, CATEGORY_ICONS } from '$lib/types.ts';

	let popupEl = $state<HTMLDivElement | undefined>();

	function handleClickAway(e: MouseEvent) {
		if (popupEl && !popupEl.contains(e.target as Node)) {
			mapStore.clearSelection();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			mapStore.clearSelection();
		}
	}

	$effect(() => {
		if (mapStore.selectedSpot) {
			window.addEventListener('keydown', handleKeydown);
			setTimeout(() => window.addEventListener('click', handleClickAway), 10);
			return () => {
				window.removeEventListener('keydown', handleKeydown);
				window.removeEventListener('click', handleClickAway);
			};
		}
	});
</script>

{#if mapStore.selectedSpot && mapStore.popupPosition}
	{@const spot = mapStore.selectedSpot}
	{@const pos = mapStore.popupPosition}
	{@const color = CATEGORY_COLORS[spot.category]}
	{@const icon = CATEGORY_ICONS[spot.category]}
	<div
		class="popup"
		bind:this={popupEl}
		style="left: {pos.x}px; top: {pos.y - 10}px;"
	>
		<div class="popup-arrow"></div>
		<div class="popup-header" style="border-color: {color}">
			<span class="popup-icon">{icon}</span>
			<span class="popup-name">{spot.name}</span>
		</div>
		<p class="popup-desc">{spot.description}</p>
		<span class="popup-category" style="background: {color}">{spot.category}</span>
	</div>
{/if}

<style>
	.popup {
		position: absolute;
		transform: translate(-50%, -100%);
		background: #1e293b;
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
		padding: 14px 16px;
		min-width: 200px;
		max-width: 280px;
		z-index: 100;
		pointer-events: auto;
		animation: popup-in 0.2s ease-out;
	}

	@keyframes popup-in {
		from {
			opacity: 0;
			transform: translate(-50%, -90%);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -100%);
		}
	}

	.popup-arrow {
		position: absolute;
		bottom: -6px;
		left: 50%;
		transform: translateX(-50%) rotate(45deg);
		width: 12px;
		height: 12px;
		background: #1e293b;
		box-shadow: 3px 3px 6px rgba(0, 0, 0, 0.3);
	}

	.popup-header {
		display: flex;
		align-items: center;
		gap: 8px;
		border-left: 3px solid;
		padding-left: 8px;
		margin-bottom: 8px;
	}

	.popup-icon {
		font-size: 18px;
	}

	.popup-name {
		font-weight: 600;
		font-size: 15px;
		color: #f1f5f9;
	}

	.popup-desc {
		font-size: 13px;
		color: #94a3b8;
		margin: 0 0 10px 0;
		line-height: 1.4;
	}

	.popup-category {
		display: inline-block;
		font-size: 11px;
		color: white;
		padding: 2px 8px;
		border-radius: 10px;
		font-weight: 500;
		text-transform: capitalize;
	}
</style>
