import Konva from 'konva';
import type { Floor, Spot, POICategory, ShapeDef } from '$lib/types.ts';
import { CATEGORY_COLORS } from '$lib/types.ts';
import { renderShape } from '$lib/components/ShapeRenderer.ts';

export interface SpotClickHandler {
	(spot: Spot, evt: Konva.KonvaEventObject<MouseEvent>): void;
}

function createSpotMarker(spot: Spot, onClick: SpotClickHandler): Konva.Group {
	const color = CATEGORY_COLORS[spot.category];
	const shape = spot.shape;
	const cx = shape.type === 'rect' ? shape.x + shape.width / 2
		: shape.type === 'circle' ? shape.x
		: 0;
	const cy = shape.type === 'rect' ? shape.y + shape.height / 2
		: shape.type === 'circle' ? shape.y
		: 0;

	const group = new Konva.Group({
		x: cx,
		y: cy,
		name: `spot-${spot.id}`,
		listening: true
	});

	group.add(new Konva.Circle({ x: 1, y: 2, radius: 10, fill: 'rgba(0,0,0,0.15)' }));
	group.add(new Konva.Circle({ radius: 10, fill: color, stroke: '#ffffff', strokeWidth: 2 }));
	group.add(new Konva.Circle({ radius: 3, fill: '#ffffff' }));

	group.on('mouseenter', () => {
		group.to({ scaleX: 1.3, scaleY: 1.3, duration: 0.15 });
		const stage = group.getStage();
		if (stage) stage.container().style.cursor = 'pointer';
	});

	group.on('mouseleave', () => {
		group.to({ scaleX: 1, scaleY: 1, duration: 0.15 });
		const stage = group.getStage();
		if (stage) stage.container().style.cursor = 'default';
	});

	group.on('click tap', (evt) => {
		onClick(spot, evt as Konva.KonvaEventObject<MouseEvent>);
	});

	return group;
}

function getLabelPosition(shape: ShapeDef): { x: number; y: number; width: number } {
	switch (shape.type) {
		case 'rect':
			return { x: shape.x + 6, y: shape.y + 6, width: shape.width - 12 };
		case 'circle':
			return { x: shape.x - shape.radius + 6, y: shape.y - shape.radius + 6, width: shape.radius * 2 - 12 };
		case 'polygon': {
			let sx = 0, sy = 0;
			const n = shape.points.length / 2;
			for (let i = 0; i < shape.points.length; i += 2) {
				sx += shape.points[i];
				sy += shape.points[i + 1];
			}
			return { x: sx / n - 30, y: sy / n - 8, width: 60 };
		}
	}
}

export interface RenderFloorOptions {
	skipBackground?: boolean;
	skipFloorLabel?: boolean;
}

export function renderFloor(
	floor: Floor,
	onSpotClick: SpotClickHandler,
	activeCategories: Set<POICategory>,
	options?: RenderFloorOptions
): Konva.Group {
	const group = new Konva.Group({ name: `floor-${floor.id}` });

	// Floor background
	if (!options?.skipBackground) {
		group.add(
			new Konva.Rect({
				x: 0, y: 0,
				width: floor.width, height: floor.height,
				fill: floor.color,
				stroke: '#94a3b8', strokeWidth: 2,
				cornerRadius: 8
			})
		);
	}

	for (const zone of floor.zones) {
		const zoneGroup = new Konva.Group({ name: `zone-${zone.id}` });

		zoneGroup.add(renderShape(zone.shape, zone.style));

		const zoneLabel = getLabelPosition(zone.shape);
		zoneGroup.add(
			new Konva.Text({
				x: zoneLabel.x, y: zoneLabel.y,
				text: zone.name,
				fontSize: 12,
				fontFamily: 'Inter, sans-serif',
				fontStyle: '500',
				fill: '#475569',
				width: zoneLabel.width,
				wrap: 'word'
			})
		);

		for (const area of zone.areas) {
			const areaGroup = new Konva.Group({ name: `area-${area.id}` });

			areaGroup.add(renderShape(area.shape, area.style));

			const areaLabel = getLabelPosition(area.shape);
			areaGroup.add(
				new Konva.Text({
					x: areaLabel.x, y: areaLabel.y,
					text: area.name,
					fontSize: 10,
					fontFamily: 'Inter, sans-serif',
					fontStyle: '500',
					fill: '#64748b',
					width: areaLabel.width,
					wrap: 'word'
				})
			);

			for (const spot of area.spots) {
				const marker = createSpotMarker(spot, onSpotClick);
				marker.visible(activeCategories.has(spot.category));
				areaGroup.add(marker);
			}

			zoneGroup.add(areaGroup);
		}

		group.add(zoneGroup);
	}

	// Floor label
	if (!options?.skipFloorLabel) {
		group.add(
			new Konva.Text({
				x: floor.width / 2, y: floor.height + 8,
				text: floor.name,
				fontSize: 14,
				fontFamily: 'Inter, sans-serif',
				fontStyle: '600',
				fill: '#cbd5e1',
				align: 'center',
				offsetX: 60, width: 120
			})
		);
	}

	return group;
}

export function updateSpotVisibility(
	layer: Konva.Layer | Konva.Group,
	floor: Floor,
	activeCategories: Set<POICategory>
) {
	for (const zone of floor.zones) {
		for (const area of zone.areas) {
			for (const spot of area.spots) {
				const marker = layer.findOne(`.spot-${spot.id}`);
				if (marker) {
					marker.visible(activeCategories.has(spot.category));
				}
			}
		}
	}
	(layer as Konva.Layer).batchDraw();
}
