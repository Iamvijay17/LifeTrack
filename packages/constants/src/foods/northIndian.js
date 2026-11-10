// North Indian breads, curries, dal, tandoori and common restaurant dishes.
import { B, D, L, S, food, v, w, x } from './helpers.js'

const NI = 'North Indian'
const VEG = ['Vegetarian']
const NV = 'Non-Vegetarian'

export const NORTH_INDIAN = [
  // ------------------------------------------------------------------ breads
  food('roti', 'Roti', NI, '1 roti (45 g)', 45, [120, 3.6, 22, 2, 3], {
    tags: VEG, meals: [L, D], aka: ['rotti', 'tawa roti', 'wheat roti', 'rotti', 'ரொட்டி'], sv: [x('2 rotis', 2), x('3 rotis', 3)],
    vr: [v('With ghee', [155, 3.6, 22, 5.5, 3])], basis: 'recipe',
  }),
  food('tandoori-roti', 'Tandoori roti', NI, '1 roti (60 g)', 60, [160, 5, 31, 1.6, 3.4], {
    tags: VEG, meals: [L, D], aka: ['tandoor roti', 'tandoori rotti', 'தந்தூரி ரொட்டி'], sv: [x('2 rotis', 2)], basis: 'restaurant',
    vr: [v('Butter tandoori roti', [215, 5, 31, 7, 3.4])],
  }),
  food('naan', 'Naan', NI, '1 naan (90 g)', 90, [262, 8.7, 45, 5.1, 2], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['plain naan', 'nan', 'naan bread', 'நான்'], sv: [x('2 naan', 2)], basis: 'restaurant',
  }),
  food('butter-naan', 'Butter naan', NI, '1 butter naan (100 g)', 100, [320, 8.5, 46, 11.5, 2], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['naan butter', 'nan butter', 'buttar naan', 'பட்டர் நான்'], sv: [x('2 butter naan', 2)], basis: 'restaurant',
    vr: [v('Garlic butter naan', [335, 9, 47, 12.5, 2.2]), v('Cheese naan', [390, 13, 46, 17, 2])],
  }),
  food('kulcha', 'Kulcha', NI, '1 kulcha (90 g)', 90, [255, 7.5, 42, 6.5, 2], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['plain kulcha', 'amritsari kulcha', 'butter kulcha', 'kulcha bread', 'குல்சா'], sv: [x('2 kulchas', 2)], basis: 'restaurant',
    vr: [v('Stuffed (aloo or paneer)', [330, 9, 46, 13, 3])],
  }),
  food('paratha', 'Plain paratha', NI, '1 paratha (60 g)', 60, [200, 4.2, 28, 8, 2.5], {
    tags: ['Vegetarian'], meals: [B, L, D], aka: ['paratha', 'parantha', 'plain parantha', 'lachha paratha', 'ப்ளெய்ன் பரோட்டா'], sv: [x('2 parathas', 2)],
  }),
  food('aloo-paratha', 'Aloo paratha', NI, '1 paratha (110 g)', 110, [270, 6, 40, 10, 3.5], {
    tags: ['Vegetarian'], meals: [B, L, D], aka: ['aloo parantha', 'potato paratha', 'alu paratha', 'ஆலு பரோட்டா'], sv: [x('2 parathas', 2)],
    vr: [v('With butter on top', [330, 6, 40, 16, 3.5])],
  }),
  food('gobi-paratha', 'Gobi paratha', NI, '1 paratha (110 g)', 110, [245, 6, 36, 9, 4], {
    tags: ['Vegetarian'], meals: [B, L, D], aka: ['gobhi paratha', 'cauliflower paratha', 'gobi parantha'],
  }),
  food('paneer-paratha', 'Paneer paratha', NI, '1 paratha (120 g)', 120, [320, 11, 36, 15, 3], {
    tags: ['Vegetarian'], meals: [B, L, D], aka: ['paneer parantha', 'cottage cheese paratha'],
  }),
  food('methi-thepla', 'Methi thepla', NI, '1 thepla (40 g)', 40, [120, 3.2, 17, 4.5, 2.5], {
    tags: ['Vegetarian'], meals: [B, S], aka: ['thepla', 'methi paratha', 'fenugreek flatbread'], sv: [x('2 theplas', 2)],
  }),

  // ------------------------------------------------------------------ paneer and vegetarian curries
  food('paneer-butter-masala', 'Paneer butter masala', NI, '1 katori (200 g)', 200, [420, 16, 14, 33, 2], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['paneer makhani', 'butter paneer', 'paneer butter', 'பனீர் பட்டர் மசாலா'], sv: [x('Half katori (100 g)', 0.5)], basis: 'restaurant',
  }),
  food('palak-paneer', 'Palak paneer', NI, '1 katori (200 g)', 200, [320, 15, 11, 25, 3.5], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['saag paneer', 'spinach paneer', 'palak panir', 'பாலக் பனீர்'], sv: [x('Half katori (100 g)', 0.5)], basis: 'restaurant',
  }),
  food('kadai-paneer', 'Kadai paneer', NI, '1 katori (200 g)', 200, [360, 16, 12, 28, 2.5], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['karahi paneer', 'kadhai paneer', 'கடாய் பனீர்'], basis: 'restaurant',
  }),
  food('matar-paneer', 'Matar paneer', NI, '1 katori (200 g)', 200, [340, 16, 15, 24, 4], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['mutter paneer', 'peas paneer', 'paneer peas'], basis: 'restaurant',
  }),
  food('shahi-paneer', 'Shahi paneer', NI, '1 katori (200 g)', 200, [400, 15, 15, 31, 1.8], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['shahi panir', 'royal paneer'], basis: 'restaurant',
  }),
  food('dal-makhani', 'Dal makhani', NI, '1 katori (200 g)', 200, [300, 11, 28, 16, 8], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['dal makhni', 'dhal makhani', 'black dal', 'maa ki dal', 'டால் மக்கனி'], sv: [x('Half katori (100 g)', 0.5)], basis: 'restaurant',
  }),
  food('dal-tadka', 'Dal tadka', NI, '1 katori (200 g)', 200, [220, 10, 28, 8, 7], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['dal fry', 'tadka dal', 'dhal tadka', 'toor dal tadka', 'தால் தட்கா', 'பருப்பு'], basis: 'restaurant',
  }),
  food('dal', 'Dal (toor, cooked)', 'Vegetarian', '1 katori (150 g)', 150, [160, 8.5, 22, 4, 5], {
    tags: ['South Indian', 'North Indian', 'Protein Foods'], meals: [L, D],
    aka: ['dhal', 'paruppu', 'toor dal', 'tuvar dal', 'arhar dal', 'lentil curry', 'lentils', 'dal curry', 'பருப்பு', 'துவரம் பருப்பு'],
    sv: [x('1 large bowl (250 g)', 1.67)], vr: [v('Moong dal', [130, 8.5, 19, 2.5, 4.5]), v('Dal tadka (with ghee)', [200, 8.5, 22, 8.5, 5])],
  }),
  food('chole', 'Chole (chana masala)', NI, '1 katori (200 g)', 200, [330, 14, 42, 12, 11], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['chana masala', 'chhole', 'channa masala', 'chickpea curry', 'chole masala', 'சன்னா மசாலா'], sv: [x('Half katori (100 g)', 0.5)], basis: 'restaurant',
  }),
  food('chole-bhature', 'Chole bhature', NI, '1 plate (2 bhature with chole, 350 g)', 350, [800, 22, 100, 35, 14], {
    tags: ['Street Food', 'Vegetarian'], meals: [B, L], aka: ['chola bhatura', 'chana bhatura', 'chole bhatura', 'channa bhatura', 'சோலே பட்டூரா'], basis: 'restaurant',
    sv: [x('1 bhatura with chole (half plate)', 0.5)],
  }),
  food('bhatura', 'Bhatura', NI, '1 bhatura (80 g)', 80, [290, 6, 38, 12, 1.5], {
    tags: ['Vegetarian'], meals: [B, L], aka: ['bhature', 'batura', 'fried bread'], basis: 'restaurant',
  }),
  food('rajma', 'Rajma masala', NI, '1 katori (200 g)', 200, [250, 11, 36, 6.5, 9], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['rajma curry', 'kidney beans curry', 'rajmah', 'ராஜ்மா'], basis: 'recipe',
  }),
  food('rajma-chawal', 'Rajma chawal', NI, '1 plate (rajma 200 g + rice 150 g)', 350, [450, 16, 76, 7, 10], {
    tags: ['Vegetarian', 'Rice & Biryani'], meals: [L, D], aka: ['rajma rice', 'rajma chaawal', 'rajmah chawal', 'ராஜ்மா சாதம்'],
  }),
  food('aloo-gobi', 'Aloo gobi', NI, '1 katori (150 g)', 150, [170, 4, 19, 9, 4.5], {
    tags: ['Vegetarian', 'Vegetables'], meals: [L, D], aka: ['aloo gobhi', 'potato cauliflower curry', 'gobi aloo'],
  }),
  food('aloo-jeera', 'Aloo jeera', NI, '1 katori (120 g)', 120, [190, 3, 25, 9, 3], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['jeera aloo', 'cumin potato'],
  }),
  food('bhindi-masala', 'Bhindi masala', NI, '1 katori (120 g)', 120, [150, 3, 12, 10, 4.5], {
    tags: ['Vegetarian', 'Vegetables'], meals: [L, D], aka: ['okra masala', 'ladies finger masala', 'bhindi fry', 'vendakkai fry', 'vendakkai poriyal', 'வெண்டைக்காய் பொரியல்', 'வெண்டைக்காய் வறுவல்'],
  }),
  food('baingan-bharta', 'Baingan bharta', NI, '1 katori (150 g)', 150, [150, 3, 13, 10, 5], {
    tags: ['Vegetarian', 'Vegetables'], meals: [L, D], aka: ['baigan bharta', 'brinjal bharta', 'smoked eggplant', 'ringna oro'],
  }),
  food('mix-veg-curry', 'Mixed vegetable curry', NI, '1 katori (150 g)', 150, [150, 3.5, 14, 9, 4], {
    tags: ['Vegetarian', 'Vegetables'], meals: [L, D], aka: ['mix veg', 'mixed veg curry', 'vegetable curry', 'veg kurma', 'vegetable korma', 'veg sabzi', 'sabji', 'காய்கறி குருமா'], basis: 'restaurant',
  }),
  food('malai-kofta', 'Malai kofta', NI, '1 katori (3 koftas, 200 g)', 200, [420, 10, 24, 32, 3], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['kofta curry', 'malai kofta curry', 'veg kofta'], basis: 'restaurant',
  }),
  food('kadhi-pakora', 'Kadhi pakora', NI, '1 katori (200 g)', 200, [240, 8, 20, 14, 2], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['kadhi', 'kadi pakora', 'punjabi kadhi'],
  }),
  food('jeera-rice', 'Jeera rice', 'Rice & Biryani', '1 plate (200 g)', 200, [300, 5, 50, 8.5, 1.2], {
    tags: ['North Indian', 'Vegetarian'], meals: [L, D], aka: ['jeera chawal', 'cumin rice', 'ஜீரா சாதம்'], sv: [x('1 katori (150 g)', 0.75)], basis: 'restaurant',
  }),
  food('khichdi', 'Dal khichdi', NI, '1 katori (200 g)', 200, [210, 8, 34, 4.5, 3.5], {
    tags: ['Vegetarian', 'Rice & Biryani'], meals: [L, D], aka: ['khichri', 'khichdi', 'moong dal khichdi', 'dal khichri', 'kitchri', 'பருப்பு கிச்சடி'], sv: [w('1 plate (300 g)', 300)],
  }),
  food('poha', 'Poha', NI, '1 plate (150 g)', 150, [250, 5, 42, 7, 2.5], {
    tags: ['Vegetarian', 'Snacks'], meals: [B], aka: ['kanda poha', 'aval upma', 'flattened rice', 'aval', 'போஹா', 'அவல் உப்புமா'],
  }),
  food('besan-chilla', 'Besan chilla', NI, '1 chilla (70 g)', 70, [130, 6.5, 14, 5, 3.5], {
    tags: ['Vegetarian'], meals: [B], aka: ['chilla', 'cheela', 'besan cheela', 'gram flour pancake', 'pudla'], sv: [x('2 chillas', 2)],
  }),

  // ------------------------------------------------------------------ tandoori and non-vegetarian
  food('butter-chicken', 'Butter chicken', NV, '1 katori (200 g)', 200, [430, 26, 12, 31, 1.5], {
    tags: ['North Indian', 'Protein Foods'], meals: [L, D], aka: ['murgh makhani', 'chicken makhani', 'butter chicken masala', 'பட்டர் சிக்கன்'], sv: [x('Half katori (100 g)', 0.5)], basis: 'restaurant',
  }),
  food('chicken-tikka-masala', 'Chicken tikka masala', NV, '1 katori (200 g)', 200, [380, 28, 12, 25, 1.8], {
    tags: ['North Indian', 'Protein Foods'], meals: [L, D], aka: ['tikka masala', 'chicken tikka gravy', 'cth', 'சிக்கன் டிக்கா மசாலா'], sv: [x('Half katori (100 g)', 0.5)], basis: 'restaurant',
  }),
  food('chicken-tikka', 'Chicken tikka', NV, '6 pieces (150 g)', 150, [250, 33, 4, 11, 0.5], {
    tags: ['North Indian', 'Protein Foods', 'Snacks'], meals: [S, L, D], aka: ['tikka', 'chicken tikka kebab', 'murgh tikka', 'சிக்கன் டிக்கா'], sv: [x('3 pieces', 0.5), x('12 pieces', 2)], basis: 'restaurant',
    vr: [v('Malai / cream tikka', [310, 32, 4, 18, 0.4])],
  }),
  food('tandoori-chicken', 'Tandoori chicken', NV, '2 pieces, quarter chicken (200 g)', 200, [380, 54, 6, 15, 0.6], {
    tags: ['North Indian', 'Protein Foods'], meals: [L, D], aka: ['tandoori chicken leg', 'tandoor chicken', 'chicken tandoori', 'தந்தூரி சிக்கன்', 'தந்தூரி கோழி'],
    sv: [x('1 piece (100 g)', 0.5), x('Half chicken (400 g)', 2), x('Full chicken (800 g)', 4)], basis: 'restaurant',
  }),
  food('chicken-grilled', 'Grilled chicken breast', 'Protein Foods', '100 g cooked', 100, [165, 31, 0, 3.6, 0], {
    tags: ['Non-Vegetarian'], meals: [L, D], basis: 'reference',
    aka: ['grilled chicken', 'chicken breast', 'boiled chicken', 'roast chicken', 'grill chicken', 'கிரில்ட் சிக்கன்'],
    sv: [x('150 g', 1.5), x('200 g', 2)], vr: [v('With skin', [205, 30, 0, 9, 0]), v('Marinated and grilled (Arabic style)', [185, 28, 3, 6.5, 0.4])],
  }),
  food('chicken-korma', 'Chicken korma', NV, '1 katori (200 g)', 200, [390, 27, 10, 27, 1.5], {
    tags: ['North Indian', 'Protein Foods'], meals: [L, D], aka: ['korma', 'chicken kurma', 'murgh korma', 'சிக்கன் குருமா'], basis: 'restaurant',
  }),
  food('kadai-chicken', 'Kadai chicken', NV, '1 katori (200 g)', 200, [340, 28, 9, 22, 2], {
    tags: ['North Indian', 'Protein Foods'], meals: [L, D], aka: ['karahi chicken', 'chicken kadhai', 'chicken karahi'], basis: 'restaurant',
  }),
  food('mutton-rogan-josh', 'Mutton rogan josh', NV, '1 katori (200 g)', 200, [420, 30, 8, 30, 1.8], {
    tags: ['North Indian', 'Protein Foods'], meals: [L, D], aka: ['rogan josh', 'roghan josh', 'lamb rogan josh', 'mutton gravy north indian'], basis: 'restaurant',
  }),
  food('seekh-kebab', 'Seekh kebab', NV, '2 kebabs (100 g)', 100, [240, 18, 4, 17, 0.6], {
    tags: ['North Indian', 'Snacks', 'Protein Foods'], meals: [S, D], aka: ['seekh kabab', 'sheekh kebab', 'mutton seekh kebab', 'chicken seekh kebab', 'kabab'], basis: 'restaurant',
  }),
  food('paneer-tikka', 'Paneer tikka', 'Vegetarian', '6 pieces (150 g)', 150, [330, 20, 8, 24, 1.5], {
    tags: ['North Indian', 'Snacks', 'Protein Foods'], meals: [S, D], aka: ['paneer tikka kebab', 'grilled paneer', 'tandoori paneer', 'பனீர் டிக்கா'], sv: [x('3 pieces', 0.5)], basis: 'restaurant',
  }),
]
