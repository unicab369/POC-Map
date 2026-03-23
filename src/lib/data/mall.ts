import type { Venue } from '$lib/types.ts';

export const mallVenue: Venue = {
	id: 'mall',
	name: 'The Dubai Mall',
	type: 'mall',
	description: 'One of the world\'s largest shopping and entertainment destinations',
	width: 700,
	height: 400,
	color: '#f5f5f4',
	geoBounds: { sw: [25.1957, 55.2773], ne: [25.1992, 55.2823] },
	zones: [
		{
			id: 'ground-floor',
			name: 'Ground Floor',
			zoneType: 'floor',
			level: 0,
			shape: { type: 'rect', x: 0, y: 0, width: 700, height: 400 },
			style: { fill: '#f5f5f4', opacity: 0.9 },
			areas: [
				{
					id: 'main-entrance',
					name: 'Main Entrance',
					category: 'info',
					shape: { type: 'rect', x: 250, y: 320, width: 200, height: 60 },
					style: { fill: '#fef3c7', opacity: 0.85 },
					spots: [
						{ id: 'm1', name: 'Main Entrance', description: 'Central mall entrance with info desk', category: 'info', shape: { type: 'rect', x: 335, y: 350, width: 30, height: 20 }, style: { fill: '#10b981' } },
						{ id: 'm10', name: 'Restrooms F1', description: 'Ground floor restrooms', category: 'restroom', shape: { type: 'rect', x: 445, y: 350, width: 30, height: 20 }, style: { fill: '#6b7280' } }
					]
				},
				{
					id: 'anchor-store-a',
					name: 'Anchor Store A',
					category: 'shop',
					shape: { type: 'rect', x: 20, y: 20, width: 200, height: 180 },
					style: { fill: '#dbeafe', opacity: 0.85 },
					spots: [
						{ id: 'm3', name: 'Mega Mart', description: 'Department store with everything', category: 'shop', shape: { type: 'rect', x: 105, y: 90, width: 30, height: 20 }, style: { fill: '#3b82f6' } }
					]
				},
				{
					id: 'anchor-store-b',
					name: 'Anchor Store B',
					category: 'shop',
					shape: { type: 'rect', x: 480, y: 20, width: 200, height: 180 },
					style: { fill: '#dbeafe', opacity: 0.85 },
					spots: [
						{ id: 'm4', name: 'Fashion Hub', description: 'Trendy clothing and accessories', category: 'shop', shape: { type: 'rect', x: 565, y: 90, width: 30, height: 20 }, style: { fill: '#3b82f6' } }
					]
				},
				{
					id: 'food-court-f1',
					name: 'Food Court',
					category: 'food',
					shape: { type: 'rect', x: 240, y: 20, width: 220, height: 140 },
					style: { fill: '#ffedd5', opacity: 0.85 },
					spots: [
						{ id: 'm5', name: 'Sushi Express', description: 'Fresh sushi and Japanese cuisine', category: 'food', shape: { type: 'rect', x: 285, y: 50, width: 30, height: 20 }, style: { fill: '#f97316' } },
						{ id: 'm6', name: 'Taco Fiesta', description: 'Mexican street food', category: 'food', shape: { type: 'rect', x: 385, y: 50, width: 30, height: 20 }, style: { fill: '#f97316' } },
						{ id: 'm7', name: 'Burger Joint', description: 'Gourmet burgers and craft beer', category: 'food', shape: { type: 'rect', x: 335, y: 100, width: 30, height: 20 }, style: { fill: '#f97316' } }
					]
				},
				{
					id: 'central-atrium',
					name: 'Central Atrium',
					category: 'info',
					shape: { type: 'rect', x: 270, y: 180, width: 160, height: 120 },
					style: { fill: '#ecfdf5', opacity: 0.85 },
					spots: [
						{ id: 'm2', name: 'Mall Directory', description: 'Interactive directory and maps', category: 'info', shape: { type: 'rect', x: 335, y: 230, width: 30, height: 20 }, style: { fill: '#10b981' } }
					]
				}
			]
		},
		{
			id: 'first-floor',
			name: 'First Floor',
			zoneType: 'floor',
			level: 1,
			shape: { type: 'rect', x: 0, y: 0, width: 700, height: 400 },
			style: { fill: '#faf5ff', opacity: 0.9 },
			areas: [
				{
					id: 'west-wing',
					name: 'West Wing',
					category: 'shop',
					shape: { type: 'rect', x: 20, y: 220, width: 230, height: 100 },
					style: { fill: '#fce7f3', opacity: 0.85 },
					spots: [
						{ id: 'm8', name: 'Shoe Palace', description: 'Athletic and designer shoes', category: 'shop', shape: { type: 'rect', x: 85, y: 260, width: 30, height: 20 }, style: { fill: '#3b82f6' } }
					]
				},
				{
					id: 'east-wing',
					name: 'East Wing',
					category: 'shop',
					shape: { type: 'rect', x: 450, y: 220, width: 230, height: 100 },
					style: { fill: '#ede9fe', opacity: 0.85 },
					spots: [
						{ id: 'm9', name: 'Jewelry Box', description: 'Fine jewelry and watches', category: 'shop', shape: { type: 'rect', x: 535, y: 260, width: 30, height: 20 }, style: { fill: '#3b82f6' } }
					]
				},
				{
					id: 'cinema-complex',
					name: 'Cinema Complex',
					category: 'attraction',
					shape: { type: 'rect', x: 20, y: 20, width: 250, height: 180 },
					style: { fill: '#1e1b4b', opacity: 0.85 },
					spots: [
						{ id: 'm11', name: 'Cineplex 8', description: '8-screen cinema with IMAX', category: 'attraction', shape: { type: 'rect', x: 130, y: 90, width: 30, height: 20 }, style: { fill: '#8b5cf6' } }
					]
				},
				{
					id: 'specialty-shops',
					name: 'Specialty Shops',
					category: 'shop',
					shape: { type: 'rect', x: 290, y: 20, width: 180, height: 140 },
					style: { fill: '#fce7f3', opacity: 0.85 },
					spots: [
						{ id: 'm13', name: 'Artisan Crafts', description: 'Handmade goods and local art', category: 'shop', shape: { type: 'rect', x: 365, y: 70, width: 30, height: 20 }, style: { fill: '#3b82f6' } },
						{ id: 'm17', name: 'Vintage Vinyl', description: 'Records, CDs, and music gear', category: 'shop', shape: { type: 'rect', x: 325, y: 40, width: 30, height: 20 }, style: { fill: '#3b82f6' } }
					]
				},
				{
					id: 'kids-play-area',
					name: 'Kids Play Area',
					category: 'attraction',
					shape: { type: 'rect', x: 490, y: 20, width: 190, height: 180 },
					style: { fill: '#dcfce7', opacity: 0.85 },
					spots: [
						{ id: 'm14', name: 'Kids Kingdom', description: 'Indoor playground and arcade', category: 'attraction', shape: { type: 'rect', x: 570, y: 90, width: 30, height: 20 }, style: { fill: '#8b5cf6' } }
					]
				}
			]
		},
		{
			id: 'second-floor',
			name: 'Second Floor',
			zoneType: 'floor',
			level: 2,
			shape: { type: 'rect', x: 0, y: 0, width: 700, height: 400 },
			style: { fill: '#f0f9ff', opacity: 0.9 },
			areas: [
				{
					id: 'tech-zone',
					name: 'Tech Zone',
					category: 'shop',
					shape: { type: 'rect', x: 20, y: 20, width: 300, height: 250 },
					style: { fill: '#dbeafe', opacity: 0.85 },
					spots: [
						{ id: 'm12', name: 'Gadget World', description: 'Latest electronics and gadgets', category: 'shop', shape: { type: 'rect', x: 155, y: 90, width: 30, height: 20 }, style: { fill: '#3b82f6' } },
						{ id: 'm20', name: 'Pet Store', description: 'Pet supplies and grooming', category: 'shop', shape: { type: 'rect', x: 105, y: 190, width: 30, height: 20 }, style: { fill: '#3b82f6' } }
					]
				},
				{
					id: 'bookstore',
					name: 'Bookstore',
					category: 'shop',
					shape: { type: 'rect', x: 340, y: 20, width: 340, height: 160 },
					style: { fill: '#fef9c3', opacity: 0.85 },
					spots: [
						{ id: 'm15', name: 'Book Haven', description: 'Books, magazines, and cafe', category: 'shop', shape: { type: 'rect', x: 495, y: 90, width: 30, height: 20 }, style: { fill: '#3b82f6' } },
						{ id: 'm19', name: 'Info Point', description: 'Upper floor information kiosk', category: 'info', shape: { type: 'rect', x: 385, y: 50, width: 30, height: 20 }, style: { fill: '#10b981' } },
						{ id: 'm18', name: 'Restrooms F2', description: 'Upper floor restrooms', category: 'restroom', shape: { type: 'rect', x: 605, y: 50, width: 30, height: 20 }, style: { fill: '#6b7280' } }
					]
				},
				{
					id: 'spa-wellness',
					name: 'Spa & Wellness',
					category: 'shop',
					shape: { type: 'rect', x: 340, y: 200, width: 340, height: 180 },
					style: { fill: '#fae8ff', opacity: 0.85 },
					spots: [
						{ id: 'm16', name: 'Zen Spa', description: 'Massage, facials, and relaxation', category: 'shop', shape: { type: 'rect', x: 495, y: 290, width: 30, height: 20 }, style: { fill: '#3b82f6' } }
					]
				}
			]
		}
	]
};
