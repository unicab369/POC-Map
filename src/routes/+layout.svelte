<script lang="ts">
	import { page } from '$app/stores';
	import { base } from '$app/paths';

	let { children } = $props();

	const navLinks = [
		{ href: `${base}/`, label: 'Home', icon: '🏠' },
		{ href: `${base}/park`, label: 'Theme Park', icon: '🎢' },
		{ href: `${base}/mall`, label: 'Mall', icon: '🏬' },
		{ href: `${base}/airport`, label: 'Airport', icon: '✈️' },
	];

	const editorLinks = [
		{ href: `${base}/editor/park`, label: 'Park', icon: '🎢' },
		{ href: `${base}/editor/mall`, label: 'Mall', icon: '🏬' },
		{ href: `${base}/editor/airport`, label: 'Airport', icon: '✈️' },
	];

	function isActive(href: string): boolean {
		const path = $page.url.pathname;
		if (href === `${base}/`) return path === href || path === `${base}`;
		return path === href || path === href + '/';
	}
</script>

<div class="app-shell">
	<main class="main-content">
		{@render children()}
	</main>

	<nav class="side-panel">
		<a href="{base}/" class="nav-brand">
			<span class="brand-icon">🗺</span>
			<span class="brand-text">POC-Map</span>
		</a>

		<div class="nav-section">
			<span class="nav-section-label">Venues</span>
			<div class="nav-links">
				{#each navLinks as link}
					<a href={link.href} class="nav-link" class:active={isActive(link.href)}>
						<span class="nav-icon">{link.icon}</span>
						<span class="nav-label">{link.label}</span>
					</a>
				{/each}
			</div>
		</div>

		<div class="nav-divider"></div>

		<div class="nav-section">
			<span class="nav-section-label">Editor</span>
			<div class="nav-links">
				{#each editorLinks as link}
					<a href={link.href} class="nav-link" class:active={isActive(link.href)}>
						<span class="nav-icon">✏️</span>
						<span class="nav-label">{link.label}</span>
					</a>
				{/each}
			</div>
		</div>
	</nav>
</div>

<style>
	:global(*) {
		margin: 0;
		padding: 0;
		box-sizing: border-box;
	}

	:global(body) {
		font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
		background: #f1f5f9;
		color: #1e293b;
		overflow: hidden;
		height: 100vh;
	}

	.app-shell {
		display: flex;
		flex-direction: row;
		height: 100vh;
	}

	.main-content {
		flex: 1;
		overflow: hidden;
		min-width: 0;
	}

	.side-panel {
		width: 200px;
		flex-shrink: 0;
		background: white;
		border-left: 1px solid #e2e8f0;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		overflow-y: auto;
	}

	.nav-brand {
		display: flex;
		align-items: center;
		gap: 8px;
		text-decoration: none;
		color: #1e293b;
	}

	.brand-icon {
		font-size: 20px;
	}

	.brand-text {
		font-size: 16px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}

	.nav-section {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.nav-section-label {
		font-size: 11px;
		font-weight: 600;
		color: #94a3b8;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.nav-links {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		text-decoration: none;
		color: #64748b;
		font-size: 13px;
		font-weight: 500;
		border-radius: 6px;
		transition: all 0.15s;
	}

	.nav-link:hover {
		background: #f1f5f9;
		color: #334155;
	}

	.nav-link.active {
		background: #eef2ff;
		color: #4f46e5;
	}

	.nav-icon {
		font-size: 14px;
	}

	.nav-divider {
		height: 1px;
		background: #e2e8f0;
	}

	@media (max-width: 640px) {
		.side-panel {
			width: 52px;
			padding: 12px 8px;
			align-items: center;
		}
		.nav-label, .brand-text, .nav-section-label {
			display: none;
		}
		.nav-link {
			justify-content: center;
			padding: 8px;
		}
		.nav-icon {
			font-size: 18px;
		}
	}
</style>
