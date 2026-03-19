<script lang="ts">
	import { base } from '$app/paths';
	import type { VenueType } from '$lib/types.ts';

	let { name, type, description, zoneCount, spotCount }: {
		name: string;
		type: VenueType;
		description: string;
		zoneCount: number;
		spotCount: number;
	} = $props();

	const venueIcons: Record<VenueType, string> = {
		park: '🎢',
		mall: '🏬',
		airport: '✈️'
	};

	const venueGradients: Record<VenueType, string> = {
		park: 'linear-gradient(135deg, #34d399, #059669)',
		mall: 'linear-gradient(135deg, #818cf8, #6366f1)',
		airport: 'linear-gradient(135deg, #38bdf8, #0284c7)'
	};
</script>

<a href="{base}/{type}" class="venue-card">
	<div class="card-hero" style="background: {venueGradients[type]}">
		<span class="card-icon">{venueIcons[type]}</span>
	</div>
	<div class="card-body">
		<h2>{name}</h2>
		<p>{description}</p>
		<div class="card-meta">
			<span>{zoneCount} {zoneCount === 1 ? 'zone' : 'zones'}</span>
			<span class="dot"></span>
			<span>{spotCount} points of interest</span>
		</div>
	</div>
	<div class="card-footer">
		<span>Explore Map</span>
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
			<path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
	</div>
</a>

<style>
	.venue-card {
		display: flex;
		flex-direction: column;
		background: #1e293b;
		border-radius: 16px;
		overflow: hidden;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
		text-decoration: none;
		color: inherit;
		transition: transform 0.25s ease, box-shadow 0.25s ease;
	}

	.venue-card:hover {
		transform: translateY(-4px);
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
	}

	.card-hero {
		height: 140px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.card-icon {
		font-size: 56px;
		filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2));
	}

	.card-body {
		padding: 20px;
		flex: 1;
	}

	.card-body h2 {
		font-size: 20px;
		font-weight: 700;
		color: #f1f5f9;
		margin: 0 0 6px 0;
	}

	.card-body p {
		font-size: 14px;
		color: #94a3b8;
		margin: 0 0 12px 0;
		line-height: 1.4;
	}

	.card-meta {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: #64748b;
	}

	.dot {
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: #475569;
	}

	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 20px;
		border-top: 1px solid #334155;
		font-size: 14px;
		font-weight: 600;
		color: #818cf8;
	}
</style>
