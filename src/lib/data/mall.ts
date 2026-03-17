import type { Venue } from '$lib/types.ts';

export const mallVenue: Venue = {
	id: 'mall',
	name: 'Grand Central Mall',
	type: 'mall',
	description: 'Premium shopping destination with dining and entertainment',
	floors: [
		{
			id: 'mall-f1',
			name: 'Ground Floor',
			level: 0,
			width: 700,
			height: 400,
			color: '#f5f5f4',
			geoBounds: { sw: [44.8530, -93.2450], ne: [44.8565, -93.2380] },
			zones: [
				{
					id: 'main-entrance',
					name: 'Main Entrance',
					category: 'info',
					shape: { type: 'rect', x: 250, y: 320, width: 200, height: 60 },
					style: { fill: '#fef3c7', opacity: 0.85 },
					areas: [
						{
							id: 'entrance-info',
							name: 'Info Desk',
							category: 'info',
							shape: { type: 'rect', x: 260, y: 325, width: 180, height: 50 },
							style: { fill: '#fde68a', opacity: 0.6 },
							spots: [
								{ id: 'm1', name: 'Main Entrance', description: 'Central mall entrance with info desk', category: 'info', shape: { type: 'circle', x: 350, y: 360, radius: 10 }, style: { fill: '#10b981' } },
								{ id: 'm10', name: 'Restrooms F1', description: 'Ground floor restrooms', category: 'restroom', shape: { type: 'circle', x: 460, y: 360, radius: 10 }, style: { fill: '#6b7280' } }
							]
						}
					]
				},
				{
					id: 'anchor-store-a',
					name: 'Anchor Store A',
					category: 'shop',
					shape: { type: 'rect', x: 20, y: 20, width: 200, height: 180 },
					style: { fill: '#dbeafe', opacity: 0.85 },
					areas: [
						{
							id: 'mega-mart-area',
							name: 'Mega Mart',
							category: 'shop',
							shape: { type: 'rect', x: 30, y: 30, width: 180, height: 160 },
							style: { fill: '#bfdbfe', opacity: 0.7 },
							spots: [
								{ id: 'm3', name: 'Mega Mart', description: 'Department store with everything', category: 'shop', shape: { type: 'circle', x: 120, y: 100, radius: 10 }, style: { fill: '#3b82f6' } }
							]
						}
					]
				},
				{
					id: 'anchor-store-b',
					name: 'Anchor Store B',
					category: 'shop',
					shape: { type: 'rect', x: 480, y: 20, width: 200, height: 180 },
					style: { fill: '#dbeafe', opacity: 0.85 },
					areas: [
						{
							id: 'fashion-hub-area',
							name: 'Fashion Hub',
							category: 'shop',
							shape: { type: 'rect', x: 490, y: 30, width: 180, height: 160 },
							style: { fill: '#bfdbfe', opacity: 0.7 },
							spots: [
								{ id: 'm4', name: 'Fashion Hub', description: 'Trendy clothing and accessories', category: 'shop', shape: { type: 'circle', x: 580, y: 100, radius: 10 }, style: { fill: '#3b82f6' } }
							]
						}
					]
				},
				{
					id: 'food-court-f1',
					name: 'Food Court',
					category: 'food',
					shape: { type: 'rect', x: 240, y: 20, width: 220, height: 140 },
					style: { fill: '#ffedd5', opacity: 0.85 },
					areas: [
						{
							id: 'dining-f1',
							name: 'Dining',
							category: 'food',
							shape: { type: 'rect', x: 250, y: 30, width: 200, height: 120 },
							style: { fill: '#fed7aa', opacity: 0.7 },
							spots: [
								{ id: 'm5', name: 'Sushi Express', description: 'Fresh sushi and Japanese cuisine', category: 'food', shape: { type: 'circle', x: 300, y: 60, radius: 10 }, style: { fill: '#f97316' } },
								{ id: 'm6', name: 'Taco Fiesta', description: 'Mexican street food', category: 'food', shape: { type: 'circle', x: 400, y: 60, radius: 10 }, style: { fill: '#f97316' } },
								{ id: 'm7', name: 'Burger Joint', description: 'Gourmet burgers and craft beer', category: 'food', shape: { type: 'circle', x: 350, y: 110, radius: 10 }, style: { fill: '#f97316' } }
							]
						}
					]
				},
				{
					id: 'central-atrium',
					name: 'Central Atrium',
					category: 'info',
					shape: { type: 'rect', x: 270, y: 180, width: 160, height: 120 },
					style: { fill: '#ecfdf5', opacity: 0.85 },
					areas: [
						{
							id: 'atrium-info',
							name: 'Directory',
							category: 'info',
							shape: { type: 'rect', x: 280, y: 190, width: 140, height: 100 },
							style: { fill: '#a7f3d0', opacity: 0.6 },
							spots: [
								{ id: 'm2', name: 'Mall Directory', description: 'Interactive directory and maps', category: 'info', shape: { type: 'circle', x: 350, y: 240, radius: 10 }, style: { fill: '#10b981' } }
							]
						}
					]
				},
				{
					id: 'west-wing',
					name: 'West Wing',
					category: 'shop',
					shape: { type: 'rect', x: 20, y: 220, width: 230, height: 100 },
					style: { fill: '#fce7f3', opacity: 0.85 },
					areas: [
						{
							id: 'west-shops',
							name: 'West Shops',
							category: 'shop',
							shape: { type: 'rect', x: 30, y: 230, width: 210, height: 80 },
							style: { fill: '#fbcfe8', opacity: 0.7 },
							spots: [
								{ id: 'm8', name: 'Shoe Palace', description: 'Athletic and designer shoes', category: 'shop', shape: { type: 'circle', x: 100, y: 270, radius: 10 }, style: { fill: '#3b82f6' } }
							]
						}
					]
				},
				{
					id: 'east-wing',
					name: 'East Wing',
					category: 'shop',
					shape: { type: 'rect', x: 450, y: 220, width: 230, height: 100 },
					style: { fill: '#ede9fe', opacity: 0.85 },
					areas: [
						{
							id: 'east-shops',
							name: 'East Shops',
							category: 'shop',
							shape: { type: 'rect', x: 460, y: 230, width: 210, height: 80 },
							style: { fill: '#ddd6fe', opacity: 0.7 },
							spots: [
								{ id: 'm9', name: 'Jewelry Box', description: 'Fine jewelry and watches', category: 'shop', shape: { type: 'circle', x: 550, y: 270, radius: 10 }, style: { fill: '#3b82f6' } }
							]
						}
					]
				}
			]
		},
		{
			id: 'mall-f2',
			name: 'Upper Floor',
			level: 1,
			width: 700,
			height: 400,
			color: '#fafaf9',
			geoBounds: { sw: [44.8530, -93.2450], ne: [44.8565, -93.2380] },
			zones: [
				{
					id: 'cinema-complex',
					name: 'Cinema Complex',
					category: 'attraction',
					shape: { type: 'rect', x: 20, y: 20, width: 250, height: 180 },
					style: { fill: '#1e1b4b', opacity: 0.85 },
					areas: [
						{
							id: 'cineplex',
							name: 'Cineplex',
							category: 'attraction',
							shape: { type: 'rect', x: 30, y: 30, width: 230, height: 160 },
							style: { fill: '#312e81', opacity: 0.7 },
							spots: [
								{ id: 'm11', name: 'Cineplex 8', description: '8-screen cinema with IMAX', category: 'attraction', shape: { type: 'circle', x: 145, y: 100, radius: 10 }, style: { fill: '#8b5cf6' } }
							]
						}
					]
				},
				{
					id: 'specialty-shops',
					name: 'Specialty Shops',
					category: 'shop',
					shape: { type: 'rect', x: 290, y: 20, width: 180, height: 140 },
					style: { fill: '#fce7f3', opacity: 0.85 },
					areas: [
						{
							id: 'artisan-area',
							name: 'Artisan & Vinyl',
							category: 'shop',
							shape: { type: 'rect', x: 300, y: 30, width: 160, height: 120 },
							style: { fill: '#fbcfe8', opacity: 0.7 },
							spots: [
								{ id: 'm13', name: 'Artisan Crafts', description: 'Handmade goods and local art', category: 'shop', shape: { type: 'circle', x: 380, y: 80, radius: 10 }, style: { fill: '#3b82f6' } },
								{ id: 'm17', name: 'Vintage Vinyl', description: 'Records, CDs, and music gear', category: 'shop', shape: { type: 'circle', x: 340, y: 50, radius: 10 }, style: { fill: '#3b82f6' } }
							]
						}
					]
				},
				{
					id: 'tech-zone',
					name: 'Tech Zone',
					category: 'shop',
					shape: { type: 'rect', x: 490, y: 20, width: 190, height: 180 },
					style: { fill: '#dbeafe', opacity: 0.85 },
					areas: [
						{
							id: 'gadgets-area',
							name: 'Gadgets',
							category: 'shop',
							shape: { type: 'rect', x: 500, y: 30, width: 170, height: 160 },
							style: { fill: '#bfdbfe', opacity: 0.7 },
							spots: [
								{ id: 'm12', name: 'Gadget World', description: 'Latest electronics and gadgets', category: 'shop', shape: { type: 'circle', x: 585, y: 100, radius: 10 }, style: { fill: '#3b82f6' } },
								{ id: 'm20', name: 'Pet Store', description: 'Pet supplies and grooming', category: 'shop', shape: { type: 'circle', x: 550, y: 50, radius: 10 }, style: { fill: '#3b82f6' } }
							]
						}
					]
				},
				{
					id: 'kids-play-area',
					name: 'Kids Play Area',
					category: 'attraction',
					shape: { type: 'rect', x: 20, y: 220, width: 200, height: 160 },
					style: { fill: '#dcfce7', opacity: 0.85 },
					areas: [
						{
							id: 'kids-kingdom',
							name: 'Kids Kingdom',
							category: 'attraction',
							shape: { type: 'rect', x: 30, y: 230, width: 180, height: 140 },
							style: { fill: '#bbf7d0', opacity: 0.7 },
							spots: [
								{ id: 'm14', name: 'Kids Kingdom', description: 'Indoor playground and arcade', category: 'attraction', shape: { type: 'circle', x: 120, y: 300, radius: 10 }, style: { fill: '#8b5cf6' } }
							]
						}
					]
				},
				{
					id: 'bookstore',
					name: 'Bookstore',
					category: 'shop',
					shape: { type: 'rect', x: 240, y: 180, width: 180, height: 120 },
					style: { fill: '#fef9c3', opacity: 0.85 },
					areas: [
						{
							id: 'book-haven-area',
							name: 'Book Haven',
							category: 'shop',
							shape: { type: 'rect', x: 250, y: 190, width: 160, height: 100 },
							style: { fill: '#fef08a', opacity: 0.7 },
							spots: [
								{ id: 'm15', name: 'Book Haven', description: 'Books, magazines, and cafe', category: 'shop', shape: { type: 'circle', x: 330, y: 240, radius: 10 }, style: { fill: '#3b82f6' } },
								{ id: 'm19', name: 'Info Point', description: 'Upper floor information kiosk', category: 'info', shape: { type: 'circle', x: 250, y: 200, radius: 10 }, style: { fill: '#10b981' } },
								{ id: 'm18', name: 'Restrooms F2', description: 'Upper floor restrooms', category: 'restroom', shape: { type: 'circle', x: 460, y: 360, radius: 10 }, style: { fill: '#6b7280' } }
							]
						}
					]
				},
				{
					id: 'spa-wellness',
					name: 'Spa & Wellness',
					category: 'shop',
					shape: { type: 'rect', x: 490, y: 220, width: 190, height: 160 },
					style: { fill: '#fae8ff', opacity: 0.85 },
					areas: [
						{
							id: 'zen-spa-area',
							name: 'Zen Spa',
							category: 'shop',
							shape: { type: 'rect', x: 500, y: 230, width: 170, height: 140 },
							style: { fill: '#f5d0fe', opacity: 0.7 },
							spots: [
								{ id: 'm16', name: 'Zen Spa', description: 'Massage, facials, and relaxation', category: 'shop', shape: { type: 'circle', x: 585, y: 300, radius: 10 }, style: { fill: '#3b82f6' } }
							]
						}
					]
				}
			]
		}
	]
};
