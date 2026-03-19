import type { Venue } from '$lib/types.ts';

export const parkVenue: Venue = {
	id: 'park',
	name: 'Wonder World Theme Park',
	type: 'park',
	description: 'A magical theme park with thrilling rides and attractions',
	width: 800,
	height: 600,
	color: '#d1fae5',
	geoBounds: { sw: [33.8079, -117.9240], ne: [33.8146, -117.9140] },
	zones: [
		{
			id: 'entrance-plaza',
			name: 'Entrance Plaza',
			category: 'info',
			shape: { type: 'rect', x: 300, y: 480, width: 200, height: 100 },
			style: { fill: '#fef3c7', opacity: 0.85 },
			areas: [
				{
					id: 'entrance-services',
					name: 'Guest Services',
					category: 'info',
					shape: { type: 'rect', x: 310, y: 490, width: 180, height: 80 },
					style: { fill: '#fde68a', opacity: 0.6 },
					spots: [
						{ id: 'p1', name: 'Main Gate', description: 'Park entrance and ticket booth', category: 'info', shape: { type: 'circle', x: 400, y: 540, radius: 10 }, style: { fill: '#10b981' } },
						{ id: 'p2', name: 'Guest Services', description: 'Maps, lost & found, accessibility services', category: 'info', shape: { type: 'circle', x: 350, y: 500, radius: 10 }, style: { fill: '#10b981' } },
						{ id: 'p16', name: 'Restrooms A', description: 'Near entrance', category: 'restroom', shape: { type: 'circle', x: 460, y: 520, radius: 10 }, style: { fill: '#6b7280' } }
					]
				}
			]
		},
		{
			id: 'adventure-land',
			name: 'Adventure Land',
			category: 'attraction',
			shape: { type: 'rect', x: 20, y: 20, width: 250, height: 220 },
			style: { fill: '#dbeafe', opacity: 0.85 },
			areas: [
				{
					id: 'coaster-area',
					name: 'Coaster Area',
					category: 'attraction',
					shape: { type: 'rect', x: 30, y: 30, width: 110, height: 100 },
					style: { fill: '#bfdbfe', opacity: 0.7 },
					spots: [
						{ id: 'p3', name: 'Thunder Coaster', description: 'High-speed roller coaster, 120cm min height', category: 'attraction', shape: { type: 'circle', x: 80, y: 60, radius: 10 }, style: { fill: '#8b5cf6' } }
					]
				},
				{
					id: 'safari-area',
					name: 'Safari Area',
					category: 'attraction',
					shape: { type: 'rect', x: 150, y: 30, width: 110, height: 200 },
					style: { fill: '#bfdbfe', opacity: 0.7 },
					spots: [
						{ id: 'p4', name: 'Jungle Safari', description: 'Boat ride through animatronic jungle', category: 'attraction', shape: { type: 'circle', x: 200, y: 120, radius: 10 }, style: { fill: '#8b5cf6' } },
						{ id: 'p5', name: 'Sky Tower', description: 'Observation tower with 360° views', category: 'attraction', shape: { type: 'circle', x: 145, y: 190, radius: 10 }, style: { fill: '#8b5cf6' } }
					]
				}
			]
		},
		{
			id: 'fantasy-world',
			name: 'Fantasy World',
			category: 'attraction',
			shape: { type: 'rect', x: 530, y: 20, width: 250, height: 220 },
			style: { fill: '#ede9fe', opacity: 0.85 },
			areas: [
				{
					id: 'castle-area',
					name: 'Castle Area',
					category: 'attraction',
					shape: { type: 'rect', x: 540, y: 30, width: 230, height: 200 },
					style: { fill: '#ddd6fe', opacity: 0.7 },
					spots: [
						{ id: 'p6', name: 'Dragon Castle', description: 'Dark ride through enchanted castle', category: 'attraction', shape: { type: 'circle', x: 600, y: 60, radius: 10 }, style: { fill: '#8b5cf6' } },
						{ id: 'p7', name: 'Magic Carousel', description: 'Classic carousel with fantasy creatures', category: 'attraction', shape: { type: 'circle', x: 700, y: 130, radius: 10 }, style: { fill: '#8b5cf6' } },
						{ id: 'p8', name: 'Fairy Tale Theatre', description: 'Live shows every hour', category: 'attraction', shape: { type: 'circle', x: 650, y: 200, radius: 10 }, style: { fill: '#8b5cf6' } }
					]
				}
			]
		},
		{
			id: 'water-park',
			name: 'Water Park',
			category: 'attraction',
			shape: { type: 'rect', x: 20, y: 280, width: 250, height: 180 },
			style: { fill: '#cffafe', opacity: 0.85 },
			areas: [
				{
					id: 'pools-area',
					name: 'Pools & Slides',
					category: 'attraction',
					shape: { type: 'rect', x: 30, y: 290, width: 230, height: 160 },
					style: { fill: '#a5f3fc', opacity: 0.7 },
					spots: [
						{ id: 'p9', name: 'Wave Pool', description: 'Giant wave pool with slides', category: 'attraction', shape: { type: 'circle', x: 80, y: 340, radius: 10 }, style: { fill: '#8b5cf6' } },
						{ id: 'p10', name: 'Lazy River', description: 'Relaxing tube float', category: 'attraction', shape: { type: 'circle', x: 200, y: 400, radius: 10 }, style: { fill: '#8b5cf6' } }
					]
				}
			]
		},
		{
			id: 'food-court',
			name: 'Food Court',
			category: 'food',
			shape: { type: 'rect', x: 300, y: 280, width: 200, height: 180 },
			style: { fill: '#ffedd5', opacity: 0.85 },
			areas: [
				{
					id: 'dining-area',
					name: 'Dining Area',
					category: 'food',
					shape: { type: 'rect', x: 310, y: 290, width: 180, height: 160 },
					style: { fill: '#fed7aa', opacity: 0.7 },
					spots: [
						{ id: 'p11', name: 'Burger Barn', description: 'Burgers, fries, and shakes', category: 'food', shape: { type: 'circle', x: 340, y: 320, radius: 10 }, style: { fill: '#f97316' } },
						{ id: 'p12', name: 'Pizza Palace', description: 'Wood-fired pizza and pasta', category: 'food', shape: { type: 'circle', x: 440, y: 380, radius: 10 }, style: { fill: '#f97316' } },
						{ id: 'p13', name: 'Ice Cream Stand', description: 'Artisan ice cream and frozen treats', category: 'food', shape: { type: 'circle', x: 390, y: 430, radius: 10 }, style: { fill: '#f97316' } },
						{ id: 'p17', name: 'Restrooms B', description: 'Near food court', category: 'restroom', shape: { type: 'circle', x: 280, y: 380, radius: 10 }, style: { fill: '#6b7280' } }
					]
				}
			]
		},
		{
			id: 'gift-village',
			name: 'Gift Village',
			category: 'shop',
			shape: { type: 'rect', x: 530, y: 280, width: 250, height: 180 },
			style: { fill: '#fce7f3', opacity: 0.85 },
			areas: [
				{
					id: 'shops-area',
					name: 'Shops',
					category: 'shop',
					shape: { type: 'rect', x: 540, y: 290, width: 230, height: 160 },
					style: { fill: '#fbcfe8', opacity: 0.7 },
					spots: [
						{ id: 'p14', name: 'Souvenir Emporium', description: 'Park merchandise and gifts', category: 'shop', shape: { type: 'circle', x: 600, y: 330, radius: 10 }, style: { fill: '#3b82f6' } },
						{ id: 'p15', name: 'Photo Studio', description: 'Professional ride photos', category: 'shop', shape: { type: 'circle', x: 700, y: 400, radius: 10 }, style: { fill: '#3b82f6' } }
					]
				}
			]
		}
	]
};
