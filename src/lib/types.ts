export type VenueType = 'park' | 'mall' | 'airport';
export type POICategory = 'food' | 'attraction' | 'shop' | 'restroom' | 'info' | 'gate' | 'security';
export type ViewMode = 'flat' | 'isometric';

// Shape definition — shared between Leaflet export and Konva render
export type ShapeDef =
	| { type: 'rect'; x: number; y: number; width: number; height: number; cornerRadius?: number }
	| { type: 'circle'; x: number; y: number; radius: number }
	| { type: 'polygon'; points: number[] }; // flat [x1,y1, x2,y2, ...]

// Style options (per-entity)
export interface ShapeStyle {
	fill: string;
	stroke?: string;
	strokeWidth?: number;
	opacity?: number;
}

// 3-level hierarchy: Zone > Area > Spot
export interface Zone {
	id: string;
	name: string;
	category: POICategory;
	shape: ShapeDef;
	style: ShapeStyle;
	areas: Area[];
	zoneType?: 'regular' | 'floor';
	level?: number;
}

export interface Area {
	id: string;
	name: string;
	category: POICategory;
	shape: ShapeDef;
	style: ShapeStyle;
	spots: Spot[];
}

export interface Spot {
	id: string;
	name: string;
	description: string;
	category: POICategory;
	shape: ShapeDef;
	style: ShapeStyle;
}

export interface GeoBounds {
	sw: [number, number]; // [lat, lng] southwest corner
	ne: [number, number]; // [lat, lng] northeast corner
}

export interface Venue {
	id: string;
	name: string;
	type: VenueType;
	description: string;
	width: number;
	height: number;
	color: string;
	geoBounds?: GeoBounds;
	zones: Zone[];
}

export const CATEGORY_COLORS: Record<POICategory, string> = {
	food: '#f97316',
	attraction: '#8b5cf6',
	shop: '#3b82f6',
	restroom: '#6b7280',
	info: '#10b981',
	gate: '#ef4444',
	security: '#eab308'
};

export const CATEGORY_ICONS: Record<POICategory, string> = {
	food: '🍔',
	attraction: '🎢',
	shop: '🛍',
	restroom: '🚻',
	info: 'ℹ️',
	gate: '🚪',
	security: '🛡'
};
