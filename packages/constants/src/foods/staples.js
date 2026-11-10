// Everyday staples: fruit, vegetables, dairy, eggs, meat, fish, pulses, nuts and breakfast cereals.
// Most of these are plain ingredients, so the values are tight (basis 'reference'); cooked or oily versions are separate foods or variants.
import { B, D, L, S, food, v, w, x } from './helpers.js'

const FR = 'Fruits'
const VG = 'Vegetables'
const PF = 'Protein Foods'
const DY = 'Dairy'
const VEG = ['Vegetarian']

export const STAPLES = [
  // ------------------------------------------------------------------ fruits
  food('banana', 'Banana', FR, '1 medium banana (118 g)', 118, [105, 1.3, 27, 0.4, 3.1], {
    tags: VEG, meals: [B, S], basis: 'reference', aka: ['vazhaipazham', 'vazhapazham', 'kela', 'nendran', 'poovan', 'ethapazham', 'robusta banana', 'வாழைப்பழம்'], sv: [x('1 small banana (80 g)', 0.7), x('1 large banana', 1.2)],
  }),
  food('apple', 'Apple', FR, '1 medium apple (180 g)', 180, [95, 0.5, 25, 0.3, 4.4], {
    tags: VEG, meals: [S, B], basis: 'reference', aka: ['apple fruit', 'seb', 'ஆப்பிள்'], sv: [x('1 small apple', 0.75), x('1 large apple', 1.3)],
  }),
  food('mango', 'Mango', FR, '1 cup, sliced (165 g)', 165, [100, 1.4, 25, 0.6, 2.6], {
    tags: VEG, meals: [S, B], basis: 'reference', aka: ['maambazham', 'mambazham', 'aam', 'alphonso', 'banganapalli', 'raw mango', 'மாம்பழம்', 'மா'], sv: [x('1 medium mango (200 g, edible)', 1.2), x('Half cup', 0.5)],
  }),
  food('orange', 'Orange / sweet lime', FR, '1 medium orange (130 g)', 130, [62, 1.2, 15.4, 0.2, 3.1], {
    tags: VEG, meals: [S, B], basis: 'reference', aka: ['orange fruit', 'mosambi', 'musambi', 'sathukudi', 'santra', 'naranga', 'tangerine', 'ஆரஞ்சு', 'சாத்துக்குடி'],
  }),
  food('papaya', 'Papaya', FR, '1 cup, cubed (150 g)', 150, [65, 0.7, 16.5, 0.2, 2.5], {
    tags: VEG, meals: [B, S], basis: 'reference', aka: ['pappali', 'papali', 'papita', 'ripe papaya', 'பப்பாளி'], sv: [x('1 bowl (250 g)', 1.67)],
  }),
  food('guava', 'Guava', FR, '1 medium guava (100 g)', 100, [68, 2.6, 14, 1, 5.4], {
    tags: VEG, meals: [S], basis: 'reference', aka: ['koyya', 'koyyapazham', 'amrood', 'peru', 'jamphal', 'கொய்யா', 'கொய்யாப்பழம்'],
  }),
  food('watermelon', 'Watermelon', FR, '1 bowl (200 g)', 200, [60, 1.2, 15, 0.3, 0.8], {
    tags: VEG, meals: [S], basis: 'reference', aka: ['tharbuz', 'tharbooni', 'kalingad', 'dharbusini', 'தர்பூசணி'], sv: [x('2 bowls', 2), x('1 slice (280 g)', 1.4)],
  }),
  food('grapes', 'Grapes', FR, '1 cup (150 g)', 150, [104, 1.1, 27, 0.2, 1.4], {
    tags: VEG, meals: [S], basis: 'reference', aka: ['dhrakshai', 'draksha', 'angoor', 'black grapes', 'green grapes', 'seedless grapes', 'திராட்சை'], sv: [x('1 handful (80 g)', 0.53)],
  }),
  food('pomegranate', 'Pomegranate', FR, '1 cup seeds (140 g)', 140, [144, 2.9, 32, 2, 7], {
    tags: VEG, meals: [S, B], basis: 'reference', aka: ['madhulai', 'maadhulai', 'anar', 'dalimb', 'மாதுளை', 'மாதுளம்பழம்'], sv: [x('Half cup (70 g)', 0.5)],
  }),
  food('pineapple', 'Pineapple', FR, '1 cup, chunks (165 g)', 165, [82, 0.9, 22, 0.2, 2.3], {
    tags: VEG, meals: [S], basis: 'reference', aka: ['annasi', 'ananas', 'annachi pazham', 'அன்னாசி', 'அன்னாசிப்பழம்'],
  }),
  food('sapota', 'Sapota (chikoo)', FR, '1 medium (100 g)', 100, [83, 0.4, 20, 1.1, 5.3], {
    tags: VEG, meals: [S], basis: 'reference', aka: ['chikoo', 'chiku', 'sapodilla', 'sapota fruit', 'chikku', 'சப்போட்டா'],
  }),
  food('muskmelon', 'Muskmelon', FR, '1 bowl (200 g)', 200, [68, 1.7, 16, 0.4, 1.8], {
    tags: VEG, meals: [S], basis: 'reference', aka: ['kharbuja', 'cantaloupe', 'melon', 'kirnipazham', 'கிர்ணி பழம்'],
  }),
  food('jackfruit', 'Jackfruit (ripe)', FR, '5 pieces (100 g)', 100, [95, 1.7, 23, 0.6, 1.5], {
    tags: VEG, meals: [S], basis: 'reference', aka: ['palapazham', 'pala pazham', 'chakka', 'kathal', 'பலாப்பழம்'],
  }),
  food('dates', 'Dates', FR, '3 dates (24 g)', 24, [67, 0.6, 18, 0.1, 1.6], {
    tags: [...VEG, 'Snacks'], meals: [S, B], basis: 'reference', aka: ['date', 'khajur', 'pericham pazham', 'kharjura', 'பேரீச்சம்பழம்'], sv: [x('1 date', 0.33), x('5 dates', 1.67)],
  }),
  food('coconut', 'Coconut (fresh)', FR, '2 tablespoons grated (20 g)', 20, [71, 0.7, 3.1, 6.7, 1.8], {
    tags: VEG, meals: [], basis: 'reference', aka: ['thengai', 'nariyal', 'coconut scrapings', 'grated coconut', 'தேங்காய்'], sv: [w('1 piece (45 g)', 45)],
  }),

  // ------------------------------------------------------------------ vegetables
  food('salad', 'Vegetable salad', VG, '1 bowl (150 g)', 150, [45, 2, 9, 0.4, 3], {
    tags: VEG, meals: [L, D, S], basis: 'recipe', aka: ['green salad', 'cucumber tomato salad', 'kachumber', 'raw vegetables', 'veg salad', 'சாலட்', 'சாலட்'],
    sv: [x('Small bowl (80 g)', 0.53), x('Large bowl (250 g)', 1.67)], vr: [v('With dressing / oil', [90, 2, 9, 5.5, 3])],
  }),
  food('potato-boiled', 'Potato (boiled)', VG, '1 medium potato (150 g)', 150, [130, 3, 30, 0.2, 3], {
    tags: VEG, meals: [L, D], basis: 'reference', aka: ['aloo', 'urulai kizhangu', 'boiled potato', 'potatoes', 'உருளைக்கிழங்கு'], sv: [x('1 small potato (80 g)', 0.53)],
  }),
  food('sweet-potato', 'Sweet potato (boiled)', VG, '1 medium (130 g)', 130, [112, 2, 26, 0.1, 3.8], {
    tags: VEG, meals: [B, S], basis: 'reference', aka: ['sakarai valli kizhangu', 'shakarkandi', 'ratalu', 'சர்க்கரைவள்ளிக் கிழங்கு'],
  }),
  food('carrot', 'Carrot (raw)', VG, '1 medium carrot (60 g)', 60, [25, 0.6, 5.8, 0.1, 1.7], {
    tags: VEG, meals: [S], basis: 'reference', aka: ['gajar', 'carrots', 'கேரட்'], sv: [x('1 cup, chopped (130 g)', 2.17)],
  }),
  food('tomato', 'Tomato', VG, '1 medium tomato (120 g)', 120, [22, 1.1, 4.7, 0.2, 1.4], {
    tags: VEG, meals: [], basis: 'reference', aka: ['thakkali', 'tamatar', 'tomatoes', 'தக்காளி'],
  }),
  food('cucumber', 'Cucumber', VG, '1 cup, sliced (120 g)', 120, [16, 0.8, 3.7, 0.2, 0.6], {
    tags: VEG, meals: [S], basis: 'reference', aka: ['vellarikai', 'kheera', 'kakdi', 'வெள்ளரிக்காய்'],
  }),
  food('onion', 'Onion (raw)', VG, '1 medium onion (110 g)', 110, [44, 1.2, 10, 0.1, 1.9], {
    tags: VEG, meals: [], basis: 'reference', aka: ['vengayam', 'pyaaz', 'pyaz', 'ulli', 'big onion', 'sambar onion', 'வெங்காயம்'],
  }),
  food('spinach', 'Spinach / keerai (cooked)', VG, '1 katori (100 g)', 100, [50, 4, 6, 1.5, 3.5], {
    tags: VEG, meals: [L, D], basis: 'recipe', aka: ['palak', 'keerai', 'palak keerai', 'spinach cooked', 'amaranth leaves', 'thandu keerai', 'arai keerai', 'greens', 'கீரை', 'பாலக் கீரை'],
  }),
  food('drumstick', 'Drumstick (murungakkai)', VG, '2 pieces (80 g)', 80, [30, 2, 5.5, 0.1, 2.5], {
    tags: VEG, meals: [L], basis: 'reference', aka: ['murungakkai', 'moringa', 'sahjan', 'munaga', 'murungai', 'முருங்கைக்காய்'],
  }),
  food('broccoli', 'Broccoli (steamed)', VG, '1 cup (90 g)', 90, [31, 2.6, 6, 0.3, 2.4], {
    tags: VEG, meals: [L, D], basis: 'reference', aka: ['brocoli', 'broccolli', 'பிராக்கோலி'],
  }),
  food('mushroom', 'Mushroom (cooked)', VG, '1 cup (100 g)', 100, [28, 3.1, 4.3, 0.5, 2.2], {
    tags: VEG, meals: [L, D], basis: 'reference', aka: ['mushrooms', 'button mushroom', 'kalan', 'காளான்'],
    vr: [v('Mushroom masala / fry', [120, 4, 7, 8.5, 2.5])],
  }),
  food('green-peas', 'Green peas (boiled)', VG, '1 katori (100 g)', 100, [84, 5.4, 15, 0.2, 5.5], {
    tags: VEG, meals: [L, D], basis: 'reference', aka: ['matar', 'peas', 'pattani', 'pachai pattani', 'பட்டாணி', 'பச்சை பட்டாணி'],
  }),

  // ------------------------------------------------------------------ dairy
  food('curd', 'Curd (dahi)', DY, '1 katori (100 g)', 100, [60, 3.5, 4.7, 3.3, 0], {
    tags: VEG, meals: [B, L, D], basis: 'reference', aka: ['dahi', 'yogurt', 'yoghurt', 'thayir', 'thayiru', 'perugu', 'curds', 'plain curd', 'தயிர்'], sv: [w('1 large bowl (200 g)', 200)],
    vr: [v('Low fat', [45, 4, 5, 1, 0]), v('Greek yogurt (100 g)', [97, 9, 4, 5, 0])],
  }),
  food('paneer', 'Paneer', DY, '100 g (about 5 cubes)', 100, [265, 18, 1.2, 20, 0], {
    tags: ['Protein Foods', 'Vegetarian'], meals: [L, D], basis: 'reference', aka: ['panir', 'cottage cheese', 'indian cottage cheese', 'பனீர்'], sv: [x('50 g', 0.5), x('150 g', 1.5)],
    vr: [v('Paneer curry (1 katori, 150 g)', [320, 14, 9, 26, 1.5]), v('Grilled paneer tikka', [240, 17, 4, 17, 0.5]), v('Paneer bhurji (1 katori)', [290, 16, 6, 22, 1])],
  }),
  food('cheese', 'Cheese', DY, '1 slice (20 g)', 20, [70, 4.2, 0.5, 5.6, 0], {
    tags: VEG, meals: [B, S], basis: 'reference', aka: ['cheese slice', 'processed cheese', 'amul cheese', 'cheddar', 'mozzarella', 'cheese cube', 'சீஸ்'], sv: [x('1 cube (25 g)', 1.25), x('2 slices', 2)],
  }),
  food('butter', 'Butter', DY, '1 teaspoon (5 g)', 5, [36, 0, 0, 4, 0], {
    tags: VEG, meals: [B], basis: 'reference', aka: ['amul butter', 'salted butter', 'makhan', 'வெண்ணெய்', 'பட்டர்'], sv: [x('1 tablespoon (14 g)', 2.8), x('1 portion pack (10 g)', 2)],
  }),
  food('ghee', 'Ghee', DY, '1 teaspoon (5 g)', 5, [45, 0, 0, 5, 0], {
    tags: VEG, meals: [L, D], basis: 'reference', aka: ['clarified butter', 'nei', 'neyyi', 'desi ghee', 'நெய்'], sv: [x('1 tablespoon (14 g)', 2.8)],
  }),
  food('oil', 'Cooking oil', 'Other', '1 teaspoon (5 ml)', 5, [44, 0, 0, 5, 0], {
    meals: [], basis: 'reference', aka: ['sunflower oil', 'groundnut oil', 'vegetable oil', 'gingelly oil', 'sesame oil', 'coconut oil', 'olive oil', 'ennai', 'எண்ணெய்'], sv: [x('1 tablespoon (15 ml)', 3)],
  }),

  // ------------------------------------------------------------------ eggs, meat, fish, protein
  food('egg-boiled', 'Boiled egg', PF, '1 large egg (50 g)', 50, [78, 6.3, 0.6, 5.3, 0], {
    tags: ['Non-Vegetarian'], meals: [B, S], basis: 'reference', aka: ['egg', 'eggs', 'muttai', 'anda', 'hard boiled egg', 'boiled eggs', 'முட்டை', 'வேகவைத்த முட்டை'], sv: [x('2 eggs', 2), x('3 eggs', 3)],
    vr: [v('Egg white only', [17, 3.6, 0.2, 0.1, 0]), v('Omelette (1 egg, with oil)', [105, 6.5, 1, 8, 0])],
  }),
  food('egg-white', 'Egg white (boiled)', PF, '1 egg white (33 g)', 33, [17, 3.6, 0.2, 0.1, 0], {
    tags: ['Non-Vegetarian'], meals: [B, S], basis: 'reference', aka: ['egg whites', 'albumen', 'muttai vellai karu', 'முட்டை வெள்ளைக்கரு'], sv: [x('3 whites', 3), x('4 whites', 4)],
  }),
  food('chicken-thigh', 'Chicken thigh (cooked, skinless)', PF, '100 g cooked', 100, [209, 26, 0, 11, 0], {
    tags: ['Non-Vegetarian'], meals: [L, D], basis: 'reference', aka: ['chicken leg', 'chicken drumstick', 'chicken piece', 'chicken thigh', 'chicken boneless', 'கோழி', 'சிக்கன்'], sv: [x('150 g', 1.5)],
  }),
  food('mutton-cooked', 'Mutton (cooked, lean)', PF, '100 g cooked', 100, [235, 27, 0, 14, 0], {
    tags: ['Non-Vegetarian'], meals: [L, D], basis: 'reference', aka: ['goat meat', 'mutton', 'lamb', 'aatu kari', 'ஆட்டிறைச்சி', 'மட்டன்'], sv: [x('150 g', 1.5)],
  }),
  food('fish-grilled', 'Grilled / baked fish', PF, '100 g cooked', 100, [140, 24, 0, 4.5, 0], {
    tags: ['Non-Vegetarian', 'South Indian'], meals: [L, D], basis: 'reference', aka: ['fish', 'baked fish', 'steamed fish', 'grilled fish', 'tilapia', 'seer fish', 'vanjaram', 'rohu', 'pomfret', 'meen', 'மீன்', 'வஞ்சரம்'], sv: [x('150 g', 1.5)],
  }),
  food('tofu', 'Tofu', PF, '100 g', 100, [76, 8, 1.9, 4.8, 0.3], {
    tags: ['Vegetarian'], meals: [L, D], basis: 'reference', aka: ['soya paneer', 'bean curd', 'soy paneer', 'டோஃபு'], sv: [x('150 g', 1.5)],
  }),
  food('soya-chunks', 'Soya chunks (cooked)', PF, '1 katori (100 g)', 100, [115, 16, 8.5, 0.5, 4.5], {
    tags: ['Vegetarian'], meals: [L, D], basis: 'reference', aka: ['soy chunks', 'nutrela', 'meal maker', 'soya nuggets', 'soyabean chunks', 'சோயா'],
    vr: [v('Soya chunks curry', [190, 14, 12, 9, 4.5])],
  }),
  food('peanut-butter', 'Peanut butter', PF, '1 tablespoon (16 g)', 16, [94, 3.6, 3.2, 8, 1], {
    tags: ['Vegetarian', 'Snacks'], meals: [B, S], basis: 'reference', aka: ['pb', 'nut butter', 'groundnut butter', 'kadalai mittai butter'], sv: [x('2 tablespoons', 2)],
  }),
  food('sprouts', 'Sprouts (moong)', PF, '1 katori (100 g)', 100, [85, 7, 13, 0.5, 3], {
    tags: ['Vegetarian', 'Snacks'], meals: [S, B], basis: 'reference', aka: ['sprouted moong', 'moong sprouts', 'mulaikattiya payir', 'green gram sprouts', 'முளைகட்டிய பயறு'], sv: [x('Small katori (60 g)', 0.6)],
    vr: [v('Sprouts salad (with onion, tomato, lemon)', [95, 7, 15, 0.8, 3.5])],
  }),
  food('roasted-chana', 'Roasted chana', PF, '1 handful (30 g)', 30, [110, 6.5, 17, 1.8, 5], {
    tags: ['Vegetarian', 'Snacks'], meals: [S], basis: 'reference', aka: ['pottu kadalai', 'bhuna chana', 'roasted gram', 'fried gram', 'chana', 'பொட்டுக்கடலை', 'வறுத்த கடலை'], sv: [x('1 katori (50 g)', 1.67)],
  }),

  // ------------------------------------------------------------------ nuts
  food('almonds', 'Almonds', 'Snacks', '10 almonds (12 g)', 12, [70, 2.5, 2.6, 6, 1.5], {
    tags: ['Vegetarian', 'Protein Foods'], meals: [S, B], basis: 'reference', aka: ['badam', 'almond', 'soaked almonds', 'பாதாம்', 'பாதாம் பருப்பு'], sv: [x('5 almonds', 0.5), x('20 almonds', 2), x('1 handful (28 g)', 2.33)],
  }),
  food('peanuts', 'Peanuts (roasted)', 'Snacks', '1 handful (28 g)', 28, [164, 7.3, 4.6, 14, 2.4], {
    tags: ['Vegetarian', 'Protein Foods'], meals: [S], basis: 'reference', aka: ['groundnut', 'verkadalai', 'moongfali', 'peanut', 'nilakadalai', 'வேர்க்கடலை', 'நிலக்கடலை'], sv: [x('Half handful (14 g)', 0.5), x('2 handfuls', 2)],
    vr: [v('Boiled', [95, 4.3, 6.5, 6.2, 2.5])],
  }),
  food('cashews', 'Cashew nuts', 'Snacks', '10 cashews (15 g)', 15, [83, 2.7, 4.5, 6.6, 0.5], {
    tags: ['Vegetarian'], meals: [S], basis: 'reference', aka: ['kaju', 'mundhiri', 'munthiri', 'cashew', 'முந்திரி'], sv: [x('5 cashews', 0.5), x('1 handful (28 g)', 1.87)],
  }),
  food('walnuts', 'Walnuts', 'Snacks', '4 halves (14 g)', 14, [92, 2.1, 1.9, 9.2, 0.9], {
    tags: ['Vegetarian'], meals: [S, B], basis: 'reference', aka: ['akhrot', 'akrot', 'walnut', 'வால்நட்'], sv: [x('1 handful (28 g)', 2)],
  }),
  food('mixed-nuts', 'Mixed dry fruits and nuts', 'Snacks', '1 handful (30 g)', 30, [175, 4.5, 11, 13, 2.5], {
    tags: ['Vegetarian'], meals: [S], basis: 'reference', aka: ['dry fruits', 'dry fruit mix', 'trail mix', 'nuts', 'kismis', 'raisins', 'pista', 'pistachio', 'dried fruits', 'உலர் பழங்கள்'],
  }),

  // ------------------------------------------------------------------ cereals and bread
  food('bread', 'Bread', 'Vegetarian', '1 slice (30 g)', 30, [79, 2.7, 14.7, 1, 0.8], {
    tags: ['Snacks'], meals: [B, S], basis: 'reference', aka: ['white bread', 'sandwich bread', 'toast', 'brown bread', 'pav', 'bun', 'bread slice', 'பிரட்', 'பிரெட்'], sv: [x('2 slices', 2), x('3 slices', 3), x('1 pav (35 g)', 1.17)],
    vr: [v('Brown / whole wheat', [74, 3, 13.5, 1, 1.8]), v('Toasted with butter', [115, 2.7, 14.7, 4.8, 0.8]), v('With jam (1 slice)', [105, 2.7, 22, 1, 0.9])],
  }),
  food('oats', 'Oats', 'Vegetarian', '1 bowl, cooked with water (40 g dry)', 40, [150, 5.3, 27, 2.6, 4], {
    tags: ['Snacks'], meals: [B], basis: 'reference', aka: ['oatmeal', 'oats porridge', 'rolled oats', 'quaker oats', 'oats upma', 'ஓட்ஸ்'],
    vr: [v('Cooked with milk', [250, 10, 33, 8, 4]), v('Savoury oats (vegetables)', [170, 5.5, 28, 3.8, 4.5])],
  }),
  food('cornflakes', 'Cornflakes / muesli with milk', 'Vegetarian', '1 bowl (30 g cereal + 150 ml milk)', 180, [210, 7, 36, 4.5, 1.5], {
    tags: ['Dairy'], meals: [B], basis: 'reference', aka: ['corn flakes', 'muesli', 'cereal', 'breakfast cereal', 'chocos', 'granola', 'kellogs'],
    vr: [v('Muesli with milk', [270, 9, 40, 8, 4])],
  }),
  food('chapati-roll', 'Chapati roll with ghee', 'Vegetarian', '1 roll (70 g)', 70, [190, 5, 28, 6, 3], {
    tags: ['South Indian', 'Snacks'], meals: [B, S], basis: 'recipe', aka: ['chapati roll', 'roti roll', 'jaggery chapati roll', 'sweet chapati', 'ghee chapati roll'],
  }),
]
