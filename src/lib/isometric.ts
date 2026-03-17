import Konva from 'konva';
import type { Floor } from '$lib/types.ts';

export interface FloorLayout {
	x: number;
	y: number;
	scaleX: number;
	scaleY: number;
	skewX: number;
	rotation: number;
}

const FLOOR_GAP = 40;
const ISO_VERTICAL_SPACING = 200;
const ISO_SKEW = -0.4;
const ISO_SCALE_Y = 0.65;
const TWEEN_DURATION = 0.6;

export function getFlatLayout(floors: Floor[], stageWidth: number, stageHeight: number): FloorLayout[] {
	const totalWidth = floors.reduce((sum, f) => sum + f.width, 0) + FLOOR_GAP * (floors.length - 1);
	const maxHeight = Math.max(...floors.map(f => f.height));

	const scaleToFit = Math.min(
		(stageWidth - 80) / totalWidth,
		(stageHeight - 80) / maxHeight,
		1
	);

	const layouts: FloorLayout[] = [];
	let offsetX = (stageWidth - totalWidth * scaleToFit) / 2;

	for (const floor of floors) {
		const offsetY = (stageHeight - floor.height * scaleToFit) / 2;
		layouts.push({
			x: offsetX,
			y: offsetY,
			scaleX: scaleToFit,
			scaleY: scaleToFit,
			skewX: 0,
			rotation: 0
		});
		offsetX += (floor.width + FLOOR_GAP) * scaleToFit;
	}

	return layouts;
}

export function getIsometricLayout(floors: Floor[], stageWidth: number, stageHeight: number): FloorLayout[] {
	const maxWidth = Math.max(...floors.map(f => f.width));
	const maxFloorHeight = Math.max(...floors.map(f => f.height));
	const maxLevel = Math.max(...floors.map(f => f.level));
	const stackHeight = maxLevel * ISO_VERTICAL_SPACING + maxFloorHeight * ISO_SCALE_Y;

	const scaleToFit = Math.min(
		(stageWidth - 160) / (maxWidth + maxWidth * Math.abs(ISO_SKEW)),
		(stageHeight - 80) / stackHeight,
		0.9
	);

	const layouts: FloorLayout[] = [];
	// Center horizontally, accounting for skew shifting content left
	const baseX = stageWidth / 2 - (maxWidth * scaleToFit) / 2 + (maxWidth * Math.abs(ISO_SKEW) * scaleToFit) / 3;
	// Center vertically: ground floor Y + upper floors stack upward
	const groundFloorY = stageHeight / 2 + (stackHeight * scaleToFit) / 2 - maxFloorHeight * ISO_SCALE_Y * scaleToFit;

	for (let i = 0; i < floors.length; i++) {
		const level = floors[i].level;
		layouts.push({
			x: baseX,
			y: groundFloorY - level * ISO_VERTICAL_SPACING * scaleToFit,
			scaleX: scaleToFit,
			scaleY: scaleToFit * ISO_SCALE_Y,
			skewX: ISO_SKEW,
			rotation: 0
		});
	}

	return layouts;
}

export function animateToLayout(groups: Konva.Group[], layouts: FloorLayout[], onFinish?: () => void) {
	let completed = 0;
	const total = groups.length;

	groups.forEach((group, i) => {
		const layout = layouts[i];
		if (!layout) return;

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
			onFinish: () => {
				completed++;
				if (completed === total && onFinish) {
					onFinish();
				}
			}
		}).play();
	});
}
