import Konva from 'konva';
import type { ShapeDef, ShapeStyle } from '$lib/types.ts';

export function renderShape(shapeDef: ShapeDef, style: ShapeStyle): Konva.Shape {
	const baseAttrs = {
		fill: style.fill,
		stroke: style.stroke ?? '#cbd5e1',
		strokeWidth: style.strokeWidth ?? 1,
		opacity: style.opacity ?? 1
	};

	switch (shapeDef.type) {
		case 'rect':
			return new Konva.Rect({
				x: shapeDef.x,
				y: shapeDef.y,
				width: shapeDef.width,
				height: shapeDef.height,
				cornerRadius: shapeDef.cornerRadius ?? 4,
				...baseAttrs
			});
		case 'circle':
			return new Konva.Circle({
				x: shapeDef.x,
				y: shapeDef.y,
				radius: shapeDef.radius,
				...baseAttrs
			});
		case 'polygon':
			return new Konva.Line({
				points: shapeDef.points,
				closed: true,
				...baseAttrs
			});
	}
}
