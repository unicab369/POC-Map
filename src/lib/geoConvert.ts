import type { GeoBounds, ShapeDef } from '$lib/types.ts';

export interface GeoConverter {
	latLngToPixel(lat: number, lng: number): { x: number; y: number };
	pixelToLatLng(px: number, py: number): { lat: number; lng: number };
	shapeToPixel(shape: ShapeDef): ShapeDef;
	shapeToLatLng(shape: ShapeDef): ShapeDef;
	metersToPixelRadius(meters: number): number;
	pixelRadiusToMeters(pixels: number): number;
}

export function createGeoConverter(
	bounds: GeoBounds,
	floorWidth: number,
	floorHeight: number
): GeoConverter {
	const [swLat, swLng] = bounds.sw;
	const [neLat, neLng] = bounds.ne;
	const dLng = neLng - swLng;
	const dLat = neLat - swLat;

	// Meters per degree at the center latitude (for circle radius conversion)
	const centerLat = (swLat + neLat) / 2;
	const metersPerDegreeLat = 111320;
	const metersPerDegreeLng = 111320 * Math.cos((centerLat * Math.PI) / 180);
	const metersPerPixelX = (dLng * metersPerDegreeLng) / floorWidth;
	const metersPerPixelY = (dLat * metersPerDegreeLat) / floorHeight;
	const metersPerPixel = (metersPerPixelX + metersPerPixelY) / 2;

	function latLngToPixel(lat: number, lng: number) {
		const x = ((lng - swLng) / dLng) * floorWidth;
		const y = ((neLat - lat) / dLat) * floorHeight; // Y flip
		return { x, y };
	}

	function pixelToLatLng(px: number, py: number) {
		const lng = swLng + (px / floorWidth) * dLng;
		const lat = neLat - (py / floorHeight) * dLat; // Y flip
		return { lat, lng };
	}

	function metersToPixelRadius(meters: number): number {
		return meters / metersPerPixel;
	}

	function pixelRadiusToMeters(pixels: number): number {
		return pixels * metersPerPixel;
	}

	function shapeToPixel(shape: ShapeDef): ShapeDef {
		if (shape.type === 'rect') {
			const topLeft = latLngToPixel(shape.y, shape.x);
			const bottomRight = latLngToPixel(shape.y + shape.height, shape.x + shape.width);
			return {
				type: 'rect',
				x: topLeft.x,
				y: topLeft.y,
				width: bottomRight.x - topLeft.x,
				height: bottomRight.y - topLeft.y
			};
		}
		if (shape.type === 'circle') {
			const center = latLngToPixel(shape.y, shape.x);
			return {
				type: 'circle',
				x: center.x,
				y: center.y,
				radius: metersToPixelRadius(shape.radius)
			};
		}
		// polygon — points are [lng, lat, lng, lat, ...]
		const points: number[] = [];
		for (let i = 0; i < shape.points.length; i += 2) {
			const px = latLngToPixel(shape.points[i + 1], shape.points[i]);
			points.push(px.x, px.y);
		}
		return { type: 'polygon', points };
	}

	function shapeToLatLng(shape: ShapeDef): ShapeDef {
		if (shape.type === 'rect') {
			const sw = pixelToLatLng(shape.x, shape.y);
			const ne = pixelToLatLng(shape.x + shape.width, shape.y + shape.height);
			return {
				type: 'rect',
				x: sw.lng,
				y: sw.lat,
				width: ne.lng - sw.lng,
				height: ne.lat - sw.lat
			};
		}
		if (shape.type === 'circle') {
			const center = pixelToLatLng(shape.x, shape.y);
			return {
				type: 'circle',
				x: center.lng,
				y: center.lat,
				radius: pixelRadiusToMeters(shape.radius)
			};
		}
		// polygon — points are [x, y, x, y, ...]
		const points: number[] = [];
		for (let i = 0; i < shape.points.length; i += 2) {
			const ll = pixelToLatLng(shape.points[i], shape.points[i + 1]);
			points.push(ll.lng, ll.lat);
		}
		return { type: 'polygon', points };
	}

	return { latLngToPixel, pixelToLatLng, shapeToPixel, shapeToLatLng, metersToPixelRadius, pixelRadiusToMeters };
}
