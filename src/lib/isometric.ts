import Konva from 'konva';
import type { Venue } from '$lib/types.ts';

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
