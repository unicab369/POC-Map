import type { Venue } from '$lib/types.ts';

export const airportVenue: Venue = {
	id: 'airport',
	name: 'Metro International Airport',
	type: 'airport',
	description: 'International airport with two terminals',
	floors: [
		{
			id: 'airport-arrivals',
			name: 'Arrivals (Level 1)',
			level: 0,
			width: 800,
			height: 350,
			color: '#eff6ff',
			geoBounds: { sw: [51.4680, -0.4590], ne: [51.4720, -0.4470] },
			zones: [
				{
					id: 'baggage-claim',
					name: 'Baggage Claim',
					category: 'info',
					shape: { type: 'rect', x: 20, y: 20, width: 300, height: 150 },
					style: { fill: '#bfdbfe', opacity: 0.85 },
					areas: [
						{
							id: 'carousels',
							name: 'Carousels',
							category: 'info',
							shape: { type: 'rect', x: 30, y: 30, width: 280, height: 130 },
							style: { fill: '#93c5fd', opacity: 0.6 },
							spots: [
								{ id: 'a1', name: 'Carousel 1-3', description: 'Domestic flight baggage carousels', category: 'info', shape: { type: 'circle', x: 100, y: 80, radius: 10 }, style: { fill: '#10b981' } },
								{ id: 'a2', name: 'Carousel 4-6', description: 'International flight baggage carousels', category: 'info', shape: { type: 'circle', x: 250, y: 80, radius: 10 }, style: { fill: '#10b981' } }
							]
						}
					]
				},
				{
					id: 'customs',
					name: 'Customs',
					category: 'security',
					shape: { type: 'rect', x: 340, y: 20, width: 200, height: 150 },
					style: { fill: '#fef9c3', opacity: 0.85 },
					areas: [
						{
							id: 'customs-control',
							name: 'Customs Control',
							category: 'security',
							shape: { type: 'rect', x: 350, y: 30, width: 180, height: 130 },
							style: { fill: '#fde68a', opacity: 0.6 },
							spots: [
								{ id: 'a3', name: 'Customs Control', description: 'Immigration and customs checkpoint', category: 'security', shape: { type: 'circle', x: 440, y: 80, radius: 10 }, style: { fill: '#eab308' } }
							]
						}
					]
				},
				{
					id: 'arrivals-hall',
					name: 'Arrivals Hall',
					category: 'info',
					shape: { type: 'rect', x: 560, y: 20, width: 220, height: 150 },
					style: { fill: '#d1fae5', opacity: 0.85 },
					areas: [
						{
							id: 'meeting-area',
							name: 'Meeting Area',
							category: 'info',
							shape: { type: 'rect', x: 570, y: 30, width: 200, height: 130 },
							style: { fill: '#a7f3d0', opacity: 0.6 },
							spots: [
								{ id: 'a4', name: 'Meeting Point', description: 'Arrivals meeting area', category: 'info', shape: { type: 'circle', x: 670, y: 80, radius: 10 }, style: { fill: '#10b981' } }
							]
						}
					]
				},
				{
					id: 'ground-transport',
					name: 'Ground Transport',
					category: 'info',
					shape: { type: 'rect', x: 20, y: 190, width: 250, height: 140 },
					style: { fill: '#e0e7ff', opacity: 0.85 },
					areas: [
						{
							id: 'transport-stops',
							name: 'Transport Stops',
							category: 'info',
							shape: { type: 'rect', x: 30, y: 200, width: 230, height: 120 },
							style: { fill: '#c7d2fe', opacity: 0.6 },
							spots: [
								{ id: 'a5', name: 'Taxi Stand', description: 'Licensed taxi pickup', category: 'info', shape: { type: 'circle', x: 80, y: 260, radius: 10 }, style: { fill: '#10b981' } },
								{ id: 'a6', name: 'Bus Station', description: 'Airport shuttle and city buses', category: 'info', shape: { type: 'circle', x: 200, y: 260, radius: 10 }, style: { fill: '#10b981' } }
							]
						}
					]
				},
				{
					id: 'arrivals-lounge',
					name: 'Arrivals Lounge',
					category: 'food',
					shape: { type: 'rect', x: 290, y: 190, width: 240, height: 140 },
					style: { fill: '#fce7f3', opacity: 0.85 },
					areas: [
						{
							id: 'arrivals-dining',
							name: 'Dining',
							category: 'food',
							shape: { type: 'rect', x: 300, y: 200, width: 220, height: 120 },
							style: { fill: '#fbcfe8', opacity: 0.6 },
							spots: [
								{ id: 'a7', name: 'Cafe Aroma', description: 'Coffee, pastries, and light meals', category: 'food', shape: { type: 'circle', x: 350, y: 260, radius: 10 }, style: { fill: '#f97316' } },
								{ id: 'a8', name: 'Quick Bites', description: 'Fast food and grab-and-go', category: 'food', shape: { type: 'circle', x: 470, y: 260, radius: 10 }, style: { fill: '#f97316' } },
								{ id: 'a10', name: 'Restrooms L1', description: 'Arrivals level restrooms', category: 'restroom', shape: { type: 'circle', x: 540, y: 160, radius: 10 }, style: { fill: '#6b7280' } }
							]
						}
					]
				},
				{
					id: 'car-rental',
					name: 'Car Rental',
					category: 'info',
					shape: { type: 'rect', x: 550, y: 190, width: 230, height: 140 },
					style: { fill: '#ecfdf5', opacity: 0.85 },
					areas: [
						{
							id: 'rental-counters',
							name: 'Rental Counters',
							category: 'info',
							shape: { type: 'rect', x: 560, y: 200, width: 210, height: 120 },
							style: { fill: '#a7f3d0', opacity: 0.6 },
							spots: [
								{ id: 'a9', name: 'Hertz Rental', description: 'Car rental counter', category: 'info', shape: { type: 'circle', x: 650, y: 260, radius: 10 }, style: { fill: '#10b981' } }
							]
						}
					]
				}
			]
		},
		{
			id: 'airport-departures',
			name: 'Departures (Level 2)',
			level: 1,
			width: 800,
			height: 350,
			color: '#f0fdf4',
			geoBounds: { sw: [51.4680, -0.4590], ne: [51.4720, -0.4470] },
			zones: [
				{
					id: 'checkin-hall',
					name: 'Check-in Hall',
					category: 'info',
					shape: { type: 'rect', x: 20, y: 20, width: 250, height: 140 },
					style: { fill: '#dbeafe', opacity: 0.85 },
					areas: [
						{
							id: 'checkin-desks',
							name: 'Check-in Desks',
							category: 'info',
							shape: { type: 'rect', x: 30, y: 30, width: 230, height: 120 },
							style: { fill: '#bfdbfe', opacity: 0.6 },
							spots: [
								{ id: 'a11', name: 'Check-in Desks', description: 'Airline check-in counters', category: 'info', shape: { type: 'circle', x: 145, y: 80, radius: 10 }, style: { fill: '#10b981' } },
								{ id: 'a12', name: 'Self Check-in', description: 'Automated kiosk check-in', category: 'info', shape: { type: 'circle', x: 80, y: 130, radius: 10 }, style: { fill: '#10b981' } }
							]
						}
					]
				},
				{
					id: 'security-zone',
					name: 'Security',
					category: 'security',
					shape: { type: 'rect', x: 290, y: 20, width: 220, height: 140 },
					style: { fill: '#fef3c7', opacity: 0.85 },
					areas: [
						{
							id: 'security-screening',
							name: 'Security Screening',
							category: 'security',
							shape: { type: 'rect', x: 300, y: 30, width: 200, height: 120 },
							style: { fill: '#fde68a', opacity: 0.6 },
							spots: [
								{ id: 'a13', name: 'Security Check', description: 'Security screening area', category: 'security', shape: { type: 'circle', x: 400, y: 80, radius: 10 }, style: { fill: '#eab308' } },
								{ id: 'a20', name: 'Restrooms L2', description: 'Departures level restrooms', category: 'restroom', shape: { type: 'circle', x: 270, y: 160, radius: 10 }, style: { fill: '#6b7280' } }
							]
						}
					]
				},
				{
					id: 'duty-free',
					name: 'Duty Free',
					category: 'shop',
					shape: { type: 'rect', x: 530, y: 20, width: 250, height: 140 },
					style: { fill: '#fce7f3', opacity: 0.85 },
					areas: [
						{
							id: 'duty-free-shops',
							name: 'Duty Free Shopping',
							category: 'shop',
							shape: { type: 'rect', x: 540, y: 30, width: 230, height: 120 },
							style: { fill: '#fbcfe8', opacity: 0.6 },
							spots: [
								{ id: 'a14', name: 'World of Duty Free', description: 'Tax-free shopping', category: 'shop', shape: { type: 'circle', x: 655, y: 60, radius: 10 }, style: { fill: '#3b82f6' } },
								{ id: 'a15', name: 'Travel Essentials', description: 'Books, snacks, and travel gear', category: 'shop', shape: { type: 'circle', x: 600, y: 120, radius: 10 }, style: { fill: '#3b82f6' } }
							]
						}
					]
				},
				{
					id: 'gate-area-a',
					name: 'Gate Area A',
					category: 'gate',
					shape: { type: 'rect', x: 20, y: 180, width: 240, height: 150 },
					style: { fill: '#e0e7ff', opacity: 0.85 },
					areas: [
						{
							id: 'gates-a',
							name: 'Gates A1-A4',
							category: 'gate',
							shape: { type: 'rect', x: 30, y: 190, width: 220, height: 130 },
							style: { fill: '#c7d2fe', opacity: 0.6 },
							spots: [
								{ id: 'a16', name: 'Gate A1-A4', description: 'Domestic departures', category: 'gate', shape: { type: 'circle', x: 140, y: 250, radius: 10 }, style: { fill: '#ef4444' } }
							]
						}
					]
				},
				{
					id: 'gate-area-b',
					name: 'Gate Area B',
					category: 'gate',
					shape: { type: 'rect', x: 280, y: 180, width: 240, height: 150 },
					style: { fill: '#ede9fe', opacity: 0.85 },
					areas: [
						{
							id: 'gates-b',
							name: 'Gates B1-B4',
							category: 'gate',
							shape: { type: 'rect', x: 290, y: 190, width: 220, height: 130 },
							style: { fill: '#ddd6fe', opacity: 0.6 },
							spots: [
								{ id: 'a17', name: 'Gate B1-B4', description: 'International departures', category: 'gate', shape: { type: 'circle', x: 400, y: 250, radius: 10 }, style: { fill: '#ef4444' } },
								{ id: 'a19', name: 'Sky Lounge', description: 'Premium passenger lounge', category: 'food', shape: { type: 'circle', x: 400, y: 330, radius: 10 }, style: { fill: '#f97316' } }
							]
						}
					]
				},
				{
					id: 'gate-area-c',
					name: 'Gate Area C',
					category: 'gate',
					shape: { type: 'rect', x: 540, y: 180, width: 240, height: 150 },
					style: { fill: '#fef9c3', opacity: 0.85 },
					areas: [
						{
							id: 'gates-c',
							name: 'Gates C1-C4',
							category: 'gate',
							shape: { type: 'rect', x: 550, y: 190, width: 220, height: 130 },
							style: { fill: '#fde68a', opacity: 0.6 },
							spots: [
								{ id: 'a18', name: 'Gate C1-C4', description: 'Long-haul departures', category: 'gate', shape: { type: 'circle', x: 660, y: 250, radius: 10 }, style: { fill: '#ef4444' } }
							]
						}
					]
				}
			]
		}
	]
};
