import Konva from 'konva';
import type { Venue, Zone } from '$lib/types.ts';

export interface FloorLayout {
	x: number;
	y: number;
	scaleX: number;
	scaleY: number;
	skewX: number;
	rotation: number;
}

const ISO_SKEW = -0.4;
const ISO_SCALE_Y = 0.65;
const TWEEN_DURATION = 0.6;
const FLOOR_GAP = 40;
const ISO_VERTICAL_SPACING = 120;

export function getFloorZones(venue: Venue): Zone[] {
	return venue.zones.filter((z) => z.zoneType === 'floor').sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
}

export function hasFloorZones(venue: Venue): boolean {
	return venue.zones.some((z) => z.zoneType === 'floor');
}

export function getFlatLayout(venue: Venue, stageWidth: number, stageHeight: number): FloorLayout {
	const scaleToFit = Math.min(
		(stageWidth - 80) / venue.width,
		(stageHeight - 80) / venue.height,
		1
	);

	const offsetX = (stageWidth - venue.width * scaleToFit) / 2;
	const offsetY = (stageHeight - venue.height * scaleToFit) / 2;

	return {
		x: offsetX,
		y: offsetY,
		scaleX: scaleToFit,
		scaleY: scaleToFit,
		skewX: 0,
		rotation: 0
	};
}

export function getIsometricLayout(venue: Venue, stageWidth: number, stageHeight: number): FloorLayout {
	const scaleToFit = Math.min(
		(stageWidth - 160) / (venue.width + venue.width * Math.abs(ISO_SKEW)),
		(stageHeight - 80) / (venue.height * ISO_SCALE_Y),
		0.9
	);

	const baseX = stageWidth / 2 - (venue.width * scaleToFit) / 2 + (venue.width * Math.abs(ISO_SKEW) * scaleToFit) / 3;
	const baseY = stageHeight / 2 - (venue.height * ISO_SCALE_Y * scaleToFit) / 2;

	return {
		x: baseX,
		y: baseY,
		scaleX: scaleToFit,
		scaleY: scaleToFit * ISO_SCALE_Y,
		skewX: ISO_SKEW,
		rotation: 0
	};
}

export function getMultiFloorFlatLayouts(
	venue: Venue, floorCount: number, stageW: number, stageH: number
): FloorLayout[] {
	const totalWidth = venue.width * floorCount + FLOOR_GAP * (floorCount - 1);
	const scaleToFit = Math.min(
		(stageW - 80) / totalWidth,
		(stageH - 80) / venue.height,
		0.8
	);

	const scaledTotalWidth = totalWidth * scaleToFit;
	const startX = (stageW - scaledTotalWidth) / 2;
	const offsetY = (stageH - venue.height * scaleToFit) / 2;

	const layouts: FloorLayout[] = [];
	for (let i = 0; i < floorCount; i++) {
		layouts.push({
			x: startX + i * (venue.width + FLOOR_GAP) * scaleToFit,
			y: offsetY,
			scaleX: scaleToFit,
			scaleY: scaleToFit,
			skewX: 0,
			rotation: 0
		});
	}
	return layouts;
}

export function getMultiFloorIsoLayouts(
	venue: Venue, floorCount: number, stageW: number, stageH: number
): FloorLayout[] {
	const skewedWidth = venue.width + venue.width * Math.abs(ISO_SKEW);
	const totalIsoHeight = venue.height * ISO_SCALE_Y + ISO_VERTICAL_SPACING * (floorCount - 1);

	const scaleToFit = Math.min(
		(stageW - 160) / skewedWidth,
		(stageH - 80) / totalIsoHeight,
		0.7
	);

	const baseX = stageW / 2 - (venue.width * scaleToFit) / 2 + (venue.width * Math.abs(ISO_SKEW) * scaleToFit) / 3;
	const baseY = stageH / 2 + (totalIsoHeight * scaleToFit) / 2 - venue.height * ISO_SCALE_Y * scaleToFit;

	const layouts: FloorLayout[] = [];
	for (let i = 0; i < floorCount; i++) {
		layouts.push({
			x: baseX,
			y: baseY - i * ISO_VERTICAL_SPACING * scaleToFit,
			scaleX: scaleToFit,
			scaleY: scaleToFit * ISO_SCALE_Y,
			skewX: ISO_SKEW,
			rotation: 0
		});
	}
	return layouts;
}

export function animateToLayout(group: Konva.Group, layout: FloorLayout, onFinish?: () => void) {
	new Konva.Tween({
		node: group,
		duration: TWEEN_DURATION,
		easing: Konva.Easings.EaseInOut,
		x: layout.x,
		y: layout.y,
		scaleX: layout.scaleX,
		scaleY: layout.scaleY,
		skewX: layout.skewX,
		rotation: layout.rotation,
		onFinish
	}).play();
}
