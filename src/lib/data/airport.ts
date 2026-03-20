import type { Venue } from '$lib/types.ts';

export const airportVenue: Venue = {
	id: 'airport',
	name: 'Chicago O\'Hare International Airport',
	type: 'airport',
	description: 'Major international hub serving the Chicago metropolitan area',
	width: 800,
	height: 350,
	color: '#eff6ff',
	geoBounds: { sw: [41.9766, -87.9108], ne: [41.9806, -87.8988] },
	zones: [
		{
			id: 'arrivals',
			name: 'Arrivals',
			category: 'info',
			zoneType: 'floor',
			level: 0,
			shape: { type: 'rect', x: 0, y: 0, width: 800, height: 350 },
			style: { fill: '#eff6ff', opacity: 0.9 },
			areas: [
				{
					id: 'baggage-claim',
					name: 'Baggage Claim',
					category: 'info',
					shape: { type: 'rect', x: 20, y: 20, width: 300, height: 150 },
					style: { fill: '#bfdbfe', opacity: 0.85 },
					spots: [
						{ id: 'a1', name: 'Carousel 1-3', description: 'Domestic flight baggage carousels', category: 'info', shape: { type: 'rect', x: 85, y: 70, width: 30, height: 20 }, style: { fill: '#10b981' } },
						{ id: 'a2', name: 'Carousel 4-6', description: 'International flight baggage carousels', category: 'info', shape: { type: 'rect', x: 235, y: 70, width: 30, height: 20 }, style: { fill: '#10b981' } }
					]
				},
				{
					id: 'customs',
					name: 'Customs',
					category: 'security',
					shape: { type: 'rect', x: 340, y: 20, width: 200, height: 150 },
					style: { fill: '#fef9c3', opacity: 0.85 },
					spots: [
						{ id: 'a3', name: 'Customs Control', description: 'Immigration and customs checkpoint', category: 'security', shape: { type: 'rect', x: 425, y: 70, width: 30, height: 20 }, style: { fill: '#eab308' } }
					]
				},
				{
					id: 'arrivals-hall',
					name: 'Arrivals Hall',
					category: 'info',
					shape: { type: 'rect', x: 560, y: 20, width: 220, height: 150 },
					style: { fill: '#d1fae5', opacity: 0.85 },
					spots: [
						{ id: 'a4', name: 'Meeting Point', description: 'Arrivals meeting area', category: 'info', shape: { type: 'rect', x: 655, y: 70, width: 30, height: 20 }, style: { fill: '#10b981' } }
					]
				},
				{
					id: 'ground-transport',
					name: 'Ground Transport',
					category: 'info',
					shape: { type: 'rect', x: 20, y: 190, width: 250, height: 140 },
					style: { fill: '#e0e7ff', opacity: 0.85 },
					spots: [
						{ id: 'a5', name: 'Taxi Stand', description: 'Licensed taxi pickup', category: 'info', shape: { type: 'rect', x: 65, y: 250, width: 30, height: 20 }, style: { fill: '#10b981' } },
						{ id: 'a6', name: 'Bus Station', description: 'Airport shuttle and city buses', category: 'info', shape: { type: 'rect', x: 185, y: 250, width: 30, height: 20 }, style: { fill: '#10b981' } }
					]
				},
				{
					id: 'arrivals-lounge',
					name: 'Arrivals Lounge',
					category: 'food',
					shape: { type: 'rect', x: 290, y: 190, width: 240, height: 140 },
					style: { fill: '#fce7f3', opacity: 0.85 },
					spots: [
						{ id: 'a7', name: 'Cafe Aroma', description: 'Coffee, pastries, and light meals', category: 'food', shape: { type: 'rect', x: 335, y: 250, width: 30, height: 20 }, style: { fill: '#f97316' } },
						{ id: 'a8', name: 'Quick Bites', description: 'Fast food and grab-and-go', category: 'food', shape: { type: 'rect', x: 455, y: 250, width: 30, height: 20 }, style: { fill: '#f97316' } },
						{ id: 'a10', name: 'Restrooms L1', description: 'Arrivals level restrooms', category: 'restroom', shape: { type: 'rect', x: 395, y: 200, width: 30, height: 20 }, style: { fill: '#6b7280' } }
					]
				},
				{
					id: 'car-rental',
					name: 'Car Rental',
					category: 'info',
					shape: { type: 'rect', x: 550, y: 190, width: 230, height: 140 },
					style: { fill: '#ecfdf5', opacity: 0.85 },
					spots: [
						{ id: 'a9', name: 'Hertz Rental', description: 'Car rental counter', category: 'info', shape: { type: 'rect', x: 635, y: 250, width: 30, height: 20 }, style: { fill: '#10b981' } }
					]
				}
			]
		},
		{
			id: 'departures',
			name: 'Departures',
			category: 'gate',
			zoneType: 'floor',
			level: 1,
			shape: { type: 'rect', x: 0, y: 0, width: 800, height: 350 },
			style: { fill: '#fefce8', opacity: 0.9 },
			areas: [
				{
					id: 'checkin-hall',
					name: 'Check-in Hall',
					category: 'info',
					shape: { type: 'rect', x: 20, y: 20, width: 250, height: 140 },
					style: { fill: '#dbeafe', opacity: 0.85 },
					spots: [
						{ id: 'a11', name: 'Check-in Desks', description: 'Airline check-in counters', category: 'info', shape: { type: 'rect', x: 130, y: 70, width: 30, height: 20 }, style: { fill: '#10b981' } },
						{ id: 'a12', name: 'Self Check-in', description: 'Automated kiosk check-in', category: 'info', shape: { type: 'rect', x: 65, y: 120, width: 30, height: 20 }, style: { fill: '#10b981' } }
					]
				},
				{
					id: 'security-zone',
					name: 'Security',
					category: 'security',
					shape: { type: 'rect', x: 290, y: 20, width: 220, height: 140 },
					style: { fill: '#fef3c7', opacity: 0.85 },
					spots: [
						{ id: 'a13', name: 'Security Check', description: 'Security screening area', category: 'security', shape: { type: 'rect', x: 385, y: 70, width: 30, height: 20 }, style: { fill: '#eab308' } },
						{ id: 'a20', name: 'Restrooms L2', description: 'Departures level restrooms', category: 'restroom', shape: { type: 'rect', x: 335, y: 120, width: 30, height: 20 }, style: { fill: '#6b7280' } }
					]
				},
				{
					id: 'duty-free',
					name: 'Duty Free',
					category: 'shop',
					shape: { type: 'rect', x: 530, y: 20, width: 250, height: 140 },
					style: { fill: '#fce7f3', opacity: 0.85 },
					spots: [
						{ id: 'a14', name: 'World of Duty Free', description: 'Tax-free shopping', category: 'shop', shape: { type: 'rect', x: 640, y: 50, width: 30, height: 20 }, style: { fill: '#3b82f6' } },
						{ id: 'a15', name: 'Travel Essentials', description: 'Books, snacks, and travel gear', category: 'shop', shape: { type: 'rect', x: 585, y: 110, width: 30, height: 20 }, style: { fill: '#3b82f6' } }
					]
				},
				{
					id: 'gate-area-a',
					name: 'Gate Area A',
					category: 'gate',
					shape: { type: 'rect', x: 20, y: 180, width: 240, height: 150 },
					style: { fill: '#e0e7ff', opacity: 0.85 },
					spots: [
						{ id: 'a16', name: 'Gate A1-A4', description: 'Domestic departures', category: 'gate', shape: { type: 'rect', x: 125, y: 240, width: 30, height: 20 }, style: { fill: '#ef4444' } }
					]
				},
				{
					id: 'gate-area-b',
					name: 'Gate Area B',
					category: 'gate',
					shape: { type: 'rect', x: 280, y: 180, width: 240, height: 150 },
					style: { fill: '#ede9fe', opacity: 0.85 },
					spots: [
						{ id: 'a17', name: 'Gate B1-B4', description: 'International departures', category: 'gate', shape: { type: 'rect', x: 385, y: 240, width: 30, height: 20 }, style: { fill: '#ef4444' } },
						{ id: 'a19', name: 'Sky Lounge', description: 'Premium passenger lounge', category: 'food', shape: { type: 'rect', x: 385, y: 300, width: 30, height: 20 }, style: { fill: '#f97316' } }
					]
				},
				{
					id: 'gate-area-c',
					name: 'Gate Area C',
					category: 'gate',
					shape: { type: 'rect', x: 540, y: 180, width: 240, height: 150 },
					style: { fill: '#fef9c3', opacity: 0.85 },
					spots: [
						{ id: 'a18', name: 'Gate C1-C4', description: 'Long-haul departures', category: 'gate', shape: { type: 'rect', x: 645, y: 240, width: 30, height: 20 }, style: { fill: '#ef4444' } }
					]
				}
			]
		}
	]
};
