// Drinks and sweets. Volumes are in ml and "serving_g" is the same number for water-like drinks, so a custom amount in grams works as ml.
import { B, D, L, S, food, v, w, x } from './helpers.js'

const BV = 'Beverages'
const DS = 'Desserts'
const VEG = ['Vegetarian']

export const BEVERAGES = [
  food('tea', 'Tea (chai)', BV, '1 cup (150 ml, milk and sugar)', 150, [70, 1.5, 10, 2.5, 0], {
    tags: VEG, meals: [B, S], basis: 'recipe', aka: ['chai', 'milk tea', 'tea with milk', 'masala chai', 'ginger tea', 'cutting chai', 'teh', 'tee', 'டீ', 'தேநீர்', 'சாயா'],
    sv: [x('1 small cup (100 ml)', 0.67), x('2 cups', 2), x('1 glass (200 ml)', 1.33)],
    vr: [v('Without sugar', [40, 1.5, 3, 2.5, 0]), v('Black tea (no milk, no sugar)', [2, 0, 0.5, 0, 0]), v('Strong with extra sugar', [95, 1.8, 15, 2.8, 0])],
  }),
  food('coffee', 'Coffee', BV, '1 cup (150 ml, milk and sugar)', 150, [80, 2, 10, 3, 0], {
    tags: VEG, meals: [B, S], basis: 'recipe', aka: ['kaapi', 'kapi', 'milk coffee', 'instant coffee', 'nescafe', 'காபி', 'காப்பி'],
    sv: [x('1 small cup (100 ml)', 0.67), x('2 cups', 2)],
    vr: [v('Without sugar', [45, 2, 3.5, 3, 0]), v('Black coffee', [3, 0.2, 0.4, 0, 0])],
  }),
  food('filter-coffee', 'Filter coffee', BV, '1 tumbler (150 ml, milk and sugar)', 150, [95, 3, 11, 4, 0], {
    tags: ['South Indian', 'Vegetarian'], meals: [B, S], basis: 'recipe', aka: ['filter kaapi', 'filter kapi', 'kumbakonam degree coffee', 'degree coffee', 'south indian coffee', 'decoction coffee', 'ஃபில்டர் காபி', 'பில்டர் காபி', 'டிகிரி காபி'],
    sv: [x('1 davara tumbler (200 ml)', 1.33), x('2 cups', 2)], vr: [v('Without sugar', [60, 3, 4, 4, 0]), v('Strong, full cream', [120, 3.5, 12, 6, 0])],
  }),
  food('milk', 'Milk', 'Dairy', '1 glass (200 ml)', 200, [130, 6.5, 9.5, 7, 0], {
    tags: [BV, 'Vegetarian'], meals: [B, S, D], basis: 'reference', aka: ['paal', 'pal', 'cow milk', 'full cream milk', 'hot milk', 'dhoodh', 'doodh', 'பால்'],
    sv: [x('1 cup (150 ml)', 0.75), x('1 large glass (300 ml)', 1.5)],
    vr: [v('Toned (3% fat)', [120, 6.2, 9.4, 6, 0]), v('Skimmed', [70, 6.5, 10, 0.3, 0]), v('Buffalo (full fat)', [220, 9, 10, 14, 0])],
  }),
  food('badam-milk', 'Badam milk', BV, '1 glass (200 ml)', 200, [190, 7, 22, 8, 0.8], {
    tags: ['Dairy', 'Vegetarian', 'South Indian'], meals: [S, D], basis: 'recipe', aka: ['almond milk', 'badaam milk', 'badam paal', 'badam kheer drink', 'பாதாம் பால்'], sv: [x('1 large glass (300 ml)', 1.5)],
    vr: [v('Ready-mix powder with milk', [210, 6.5, 30, 6.5, 0.5])],
  }),
  food('rose-milk', 'Rose milk', BV, '1 glass (200 ml)', 200, [190, 6, 29, 5.5, 0], {
    tags: ['Dairy', 'Vegetarian'], meals: [S], basis: 'recipe', aka: ['rose paal', 'pink milk', 'ரோஸ் மில்க்', 'ரோஸ் பால்'],
  }),
  food('jigarthanda', 'Jigarthanda', BV, '1 glass (250 ml)', 250, [320, 7, 46, 12, 0.5], {
    tags: [DS, 'Dairy', 'South Indian', 'Vegetarian'], meals: [S], basis: 'restaurant', aka: ['jigarthanda madurai', 'jigarthanda', 'jigar thanda', 'ஜிகர்தண்டா'],
  }),
  food('buttermilk', 'Buttermilk (neer mor)', BV, '1 glass (200 ml)', 200, [40, 2, 4, 1.5, 0], {
    tags: ['Dairy', 'South Indian', 'Vegetarian'], meals: [L, S], basis: 'recipe', aka: ['moru', 'mor', 'neer mor', 'neermor', 'chaas', 'chaach', 'majjiga', 'spiced buttermilk', 'மோர்', 'நீர் மோர்'],
    sv: [x('1 small glass (150 ml)', 0.75), x('1 large glass (300 ml)', 1.5)], vr: [v('Thick, from full cream curd', [75, 3.5, 5, 4.5, 0])],
  }),
  food('lassi', 'Lassi (sweet)', BV, '1 glass (250 ml)', 250, [230, 7, 36, 6, 0], {
    tags: ['Dairy', 'North Indian', 'Vegetarian'], meals: [S, L], basis: 'restaurant', aka: ['sweet lassi', 'punjabi lassi', 'curd lassi', 'dahi lassi', 'லஸ்ஸி'], sv: [x('1 large glass (350 ml)', 1.4)],
    vr: [v('Salted lassi', [120, 6, 9, 6, 0]), v('Mango lassi', [260, 6, 44, 6, 0.8]), v('Rose lassi', [245, 6.5, 40, 6, 0])],
  }),
  food('coconut-water', 'Coconut water (tender coconut)', BV, '1 glass (250 ml)', 250, [48, 0.5, 11, 0.3, 0], {
    tags: ['Fruits'], meals: [S], basis: 'reference', aka: ['elaneer', 'ilaneer', 'tender coconut', 'young coconut', 'nariyal pani', 'kobbari neellu', 'இளநீர்', 'இளநீர் தண்ணீர்'],
    sv: [x('1 full tender coconut (300 ml)', 1.2), x('1 small glass (150 ml)', 0.6)],
  }),
  food('orange-juice', 'Orange juice (fresh)', BV, '1 glass (250 ml)', 250, [112, 1.7, 26, 0.5, 0.5], {
    tags: ['Fruits'], meals: [B, S], basis: 'reference', aka: ['orange', 'juice', 'fresh juice', 'fruit juice', 'mosambi juice', 'sweet lime juice', 'ஆரஞ்சு ஜூஸ்', 'ஜூஸ்'],
    vr: [v('Mosambi (sweet lime) juice', [100, 1.2, 24, 0.3, 0.3]), v('Packaged juice (sweetened)', [130, 0.5, 31, 0, 0.2])],
  }),
  food('apple-juice', 'Apple juice (fresh)', BV, '1 glass (250 ml)', 250, [115, 0.5, 28, 0.3, 0.5], { tags: ['Fruits'], meals: [B, S], basis: 'reference', aka: ['apple juice', 'fresh apple juice', 'ஆப்பிள் ஜூஸ்'] }),
  food('mango-juice', 'Mango juice', BV, '1 glass (250 ml)', 250, [150, 1, 36, 0.5, 1], {
    tags: ['Fruits'], meals: [S], basis: 'recipe', aka: ['mango drink', 'mango squash', 'mango frooti', 'maaza', 'மாம்பழ ஜூஸ்'], vr: [v('Packaged (sweetened)', [160, 0.5, 39, 0.2, 0.3])],
  }),
  food('pomegranate-juice', 'Pomegranate juice', BV, '1 glass (250 ml)', 250, [135, 0.8, 33, 0.5, 0.3], { tags: ['Fruits'], meals: [S], basis: 'reference', aka: ['anar juice', 'மாதுளை ஜூஸ்'] }),
  food('watermelon-juice', 'Watermelon juice', BV, '1 glass (250 ml)', 250, [75, 1.2, 18, 0.3, 0.4], { tags: ['Fruits'], meals: [S], basis: 'reference', aka: ['watermelon drink', 'tharbooz juice', 'தர்பூசணி ஜூஸ்'] }),
  food('pineapple-juice', 'Pineapple juice', BV, '1 glass (250 ml)', 250, [130, 1, 32, 0.3, 0.5], { tags: ['Fruits'], meals: [S], basis: 'reference', aka: ['pine apple juice', 'அன்னாசி ஜூஸ்'] }),
  food('grape-juice', 'Grape juice', BV, '1 glass (250 ml)', 250, [150, 1, 37, 0.3, 0.3], { tags: ['Fruits'], meals: [S], basis: 'reference', aka: ['black grape juice', 'திராட்சை ஜூஸ்'] }),
  food('sugarcane-juice', 'Sugarcane juice', BV, '1 glass (250 ml)', 250, [180, 0.5, 45, 0.5, 0], { tags: ['Street Food'], meals: [S], basis: 'recipe', aka: ['karumbu juice', 'ganne ka ras', 'கரும்பு சாறு', 'கரும்பு ஜூஸ்'] }),
  food('lime-juice', 'Lime juice / nannari sarbath', BV, '1 glass (250 ml, sweetened)', 250, [100, 0.2, 26, 0.1, 0.2], {
    tags: ['South Indian'], meals: [S], basis: 'recipe', aka: ['lemon juice', 'lemonade', 'fresh lime soda', 'nimbu pani', 'nannari sarbath', 'nannari', 'sarbath', 'sherbet', 'எலுமிச்சை சாறு', 'நன்னாரி சர்பத்', 'சர்பத்'],
    vr: [v('Unsweetened with salt', [10, 0.2, 3, 0.1, 0.2]), v('Nannari sarbath with sugar and soda', [120, 0.2, 31, 0.1, 0.2])],
  }),
  food('milkshake', 'Milkshake', BV, '1 glass (300 ml)', 300, [310, 9, 44, 11, 0.5], {
    tags: ['Dairy', 'Vegetarian'], meals: [S], basis: 'restaurant', aka: ['shake', 'milk shake', 'chocolate shake', 'milkshakes', 'மில்க் ஷேக்'],
    vr: [v('Chocolate', [350, 9, 50, 12, 1.2]), v('Banana', [290, 8.5, 45, 8.5, 1.5]), v('Mango', [300, 8, 48, 8.5, 1.2]), v('Strawberry', [300, 8.5, 46, 9, 0.8]), v('Vanilla', [320, 9, 42, 13, 0]), v('Sugar-free / low fat', [190, 10, 24, 5, 0.5])],
  }),
  food('cold-coffee', 'Cold coffee', BV, '1 glass (300 ml)', 300, [260, 7, 38, 9, 0.3], {
    tags: ['Dairy', 'Vegetarian'], meals: [S], basis: 'restaurant', aka: ['iced coffee', 'cold coffee with ice cream', 'frappe', 'கோல்ட் காபி'],
  }),
  food('green-tea', 'Green tea', BV, '1 cup (150 ml)', 150, [2, 0, 0.4, 0, 0], {
    tags: ['Vegetarian'], meals: [B, S], basis: 'reference', aka: ['greentea', 'lemon tea', 'black tea', 'herbal tea', 'ginger lemon tea', 'கிரீன் டீ'], vr: [v('With honey (1 tsp)', [22, 0, 5.7, 0, 0])],
  }),
  food('health-drink', 'Health drink in milk (Horlicks / Boost / Bournvita)', BV, '1 glass (200 ml milk + 2 tsp powder)', 215, [185, 7.5, 27, 5, 0.4], {
    tags: ['Dairy', 'Vegetarian'], meals: [B, S], basis: 'recipe', aka: ['horlicks', 'boost', 'bournvita', 'complan', 'milo', 'ovaltine', 'malted drink', 'ஹார்லிக்ஸ்', 'பூஸ்ட்'],
  }),
  food('soft-drink', 'Soft drink (cola)', BV, '1 can (330 ml)', 330, [139, 0, 35, 0, 0], {
    tags: ['Fast Food'], meals: [S, L, D], basis: 'reference', aka: ['cola', 'coke', 'pepsi', 'soda', 'fizzy drink', 'sprite', 'fanta', 'thums up', 'cool drink', 'cold drink', 'கூல் டிரிங்க்ஸ்'],
    sv: [x('1 bottle (600 ml)', 1.82), x('1 small glass (200 ml)', 0.6)], vr: [v('Diet / zero sugar', [1, 0, 0.1, 0, 0])],
  }),
  food('protein-shake', 'Whey protein shake', BV, '1 scoop (30 g) in water', 30, [120, 24, 3, 1.5, 0], {
    tags: ['Protein Foods'], meals: [B, S], basis: 'recipe', aka: ['whey', 'whey protein', 'protein powder', 'protein drink', 'protein shake', 'gym shake', 'mass gainer'],
    sv: [x('2 scoops', 2)], vr: [v('Mixed with 250 ml milk', [250, 31, 15, 8.5, 0])],
  }),
]

export const DESSERTS = [
  food('gulab-jamun', 'Gulab jamun', DS, '2 pieces (80 g)', 80, [300, 4.5, 44, 12, 0.5], {
    tags: ['North Indian', 'Vegetarian'], meals: [S, D], basis: 'restaurant', aka: ['gulabjamun', 'gulab jamoon', 'jamun', 'குலாப் ஜாமூன்', 'குலாப் ஜாமுன்'], sv: [x('1 piece', 0.5), x('3 pieces', 1.5)],
  }),
  food('jalebi', 'Jalebi', DS, '2 pieces (60 g)', 60, [230, 1.8, 40, 7.5, 0.3], {
    tags: ['North Indian', 'Street Food', 'Vegetarian'], meals: [S, B], basis: 'restaurant', aka: ['jilebi', 'jilapi', 'imarti', 'ஜிலேபி'], sv: [x('1 piece', 0.5), x('4 pieces', 2)],
  }),
  food('laddu', 'Laddu', DS, '1 laddu (40 g)', 40, [185, 3, 25, 8.5, 1], {
    tags: ['Vegetarian'], meals: [S], basis: 'recipe', aka: ['laddoo', 'ladoo', 'besan laddu', 'motichoor laddu', 'boondi laddu', 'tirupati laddu', 'rava laddu', 'லட்டு'], sv: [x('2 laddus', 2)],
    vr: [v('Besan laddu', [200, 4, 22, 11, 1.2]), v('Motichoor / boondi laddu', [180, 2.5, 26, 8, 0.6]), v('Rava laddu', [170, 2.5, 25, 7, 0.8]), v('Tirupati laddu (large, 175 g)', [700, 10, 90, 33, 2])],
  }),
  food('payasam', 'Payasam', DS, '1 katori (150 ml)', 150, [250, 5, 38, 9, 0.6], {
    tags: ['South Indian', 'Vegetarian'], meals: [L, S], basis: 'recipe',
    aka: ['payasa', 'paysam', 'kheer', 'semiya payasam', 'paal payasam', 'rice kheer', 'sago payasam', 'javvarisi payasam', 'vermicelli payasam', 'பாயசம்', 'பால் பாயசம்', 'சேமியா பாயசம்'],
    vr: [v('Semiya payasam', [240, 5, 36, 8.5, 0.6]), v('Paal payasam (rice and milk)', [260, 6, 38, 9, 0.4]), v('Pal ada pradhaman (Kerala)', [310, 5, 42, 14, 0.5]), v('Paruppu payasam (moong dal)', [285, 6.5, 40, 11, 1.5])],
  }),
  food('rasgulla', 'Rasgulla', DS, '2 pieces (100 g)', 100, [186, 4, 38, 2, 0], {
    tags: ['North Indian', 'Vegetarian'], meals: [S, D], basis: 'restaurant', aka: ['rosogolla', 'rasagulla', 'rasagolla', 'ரசகுல்லா'], sv: [x('1 piece', 0.5)],
  }),
  food('rasmalai', 'Rasmalai', DS, '2 pieces (120 g)', 120, [270, 8, 30, 13, 0], {
    tags: ['North Indian', 'Vegetarian'], meals: [S, D], basis: 'restaurant', aka: ['ras malai', 'rasmalai sweet', 'ரசமலாய்'],
  }),
  food('halwa', 'Halwa', DS, '1 katori (100 g)', 100, [330, 3.5, 48, 14, 1.2], {
    tags: ['Vegetarian'], meals: [S], basis: 'restaurant', aka: ['halva', 'carrot halwa', 'gajar halwa', 'gajar ka halwa', 'tirunelveli halwa', 'wheat halwa', 'atta halwa', 'kasi halwa', 'அல்வா', 'திருநெல்வேலி அல்வா', 'கேரட் அல்வா'],
    vr: [v('Carrot halwa (gajar)', [300, 5, 38, 14, 2]), v('Tirunelveli (wheat) halwa', [370, 3, 55, 16, 1]), v('Pumpkin / kasi halwa', [290, 3.2, 44, 12, 1.5])],
  }),
  food('mysore-pak', 'Mysore pak', DS, '1 piece (40 g)', 40, [210, 2.5, 20, 13.5, 0.8], {
    tags: ['South Indian', 'Vegetarian'], meals: [S], basis: 'restaurant', aka: ['mysorepak', 'mysurpa', 'mysore paak', 'மைசூர் பாக்'], sv: [x('2 pieces', 2)],
  }),
  food('barfi', 'Barfi / burfi', DS, '1 piece (35 g)', 35, [150, 3.5, 21, 6, 0.3], {
    tags: ['North Indian', 'Vegetarian'], meals: [S], basis: 'restaurant', aka: ['burfi', 'kaju katli', 'kaju barfi', 'milk barfi', 'coconut barfi', 'peda', 'milk sweet', 'பர்பி', 'பேடா'], sv: [x('2 pieces', 2)],
    vr: [v('Kaju katli (cashew)', [145, 3.2, 17, 7.5, 0.6])],
  }),
  food('ice-cream', 'Ice cream', DS, '1 scoop (70 g)', 70, [145, 2.5, 17, 7.5, 0.4], {
    tags: ['Dairy', 'Vegetarian'], meals: [S, D], basis: 'reference', aka: ['icecream', 'ice-cream', 'vanilla ice cream', 'chocolate ice cream', 'kulfi', 'gelato', 'sundae', 'ஐஸ்கிரீம்', 'ஐஸ் கிரீம்'], sv: [x('2 scoops', 2), x('1 cup (130 g)', 1.86), x('1 cone / cup (small, 100 g)', 1.43)],
    vr: [v('Chocolate', [155, 2.7, 19, 8, 0.8]), v('Kulfi (1 stick, 80 g)', [190, 5, 22, 9, 0]), v('Butterscotch / fruit & nut', [165, 3, 20, 8.5, 0.4])],
  }),
  food('cake', 'Cake (slice)', DS, '1 slice (80 g)', 80, [290, 4, 42, 12, 1], {
    tags: ['Vegetarian'], meals: [S, D], basis: 'restaurant', aka: ['cakes', 'sponge cake', 'chocolate cake', 'vanilla cake', 'plum cake', 'fruit cake', 'black forest', 'cream cake', 'pastry', 'பிளம் கேக்', 'கேக்'], sv: [x('2 slices', 2), x('1 pastry (100 g)', 1.25)],
    vr: [v('Chocolate cake with icing', [350, 4.5, 48, 16, 1.8]), v('Plum / fruit cake', [310, 3.5, 50, 11, 1.5]), v('Cupcake (1, 60 g)', [235, 2.8, 33, 10.5, 0.6]), v('Egg-less sponge', [255, 4, 40, 8.5, 0.8])],
  }),
  food('brownie', 'Brownie', DS, '1 piece (60 g)', 60, [270, 3.5, 34, 14, 1.8], {
    tags: ['Vegetarian'], meals: [S, D], basis: 'restaurant', aka: ['chocolate brownie', 'brownies', 'sizzling brownie', 'brownie with ice cream', 'பிரவுனி'], sv: [x('2 pieces', 2)],
    vr: [v('With a scoop of ice cream', [415, 6, 50, 21.5, 2.2])],
  }),
  food('donut', 'Doughnut', DS, '1 doughnut (60 g)', 60, [250, 3.5, 30, 13, 1], {
    tags: ['Snacks', 'Fast Food', 'Vegetarian'], meals: [S, B], basis: 'restaurant', aka: ['donut', 'doughnuts', 'donuts', 'டோனட்'],
  }),
  food('chocolate', 'Chocolate (milk)', DS, '2 squares (20 g)', 20, [107, 1.5, 12, 6, 0.6], {
    tags: ['Snacks', 'Vegetarian'], meals: [S], basis: 'reference', aka: ['chocolates', 'dairy milk', 'milk chocolate', 'chocolate bar', 'candy', 'toffee', 'kitkat', 'சாக்லேட்'],
    sv: [x('1 small bar (40 g)', 2), x('1 large bar (100 g)', 5)], vr: [v('Dark chocolate (70%, 20 g)', [118, 1.6, 8.5, 8.5, 2.2])],
  }),
  food('sugar', 'Sugar', 'Other', '1 teaspoon (5 g)', 5, [20, 0, 5, 0, 0], {
    meals: [], basis: 'reference', aka: ['chini', 'cheeni', 'sakkarai', 'white sugar', 'sweetener', 'சர்க்கரை', 'சீனி'], sv: [x('2 teaspoons', 2), x('1 tablespoon (12 g)', 2.4)],
    vr: [v('Jaggery (1 tsp, 5 g)', [19, 0, 4.8, 0, 0])],
  }),
]
