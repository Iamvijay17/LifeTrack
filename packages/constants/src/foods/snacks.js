// Snacks, tiffin-shop fried items and street food. Fried items soak up very different amounts of oil: treat these as rough guides.
import { B, D, L, S, food, v, w, x } from './helpers.js'

const ST = 'Street Food'
const SN = 'Snacks'
const VEG = ['Vegetarian']

export const SNACKS = [
  // ------------------------------------------------------------------ tea-time fried snacks
  food('samosa', 'Samosa', ST, '1 samosa (60 g)', 60, [175, 3.5, 20, 9, 2], {
    tags: [SN, 'Vegetarian'], meals: [S], basis: 'restaurant', aka: ['samosas', 'aloo samosa', 'veg samosa', 'punjabi samosa', 'சமோசா'], sv: [x('2 samosas', 2)],
    vr: [v('Onion samosa', [165, 3.2, 20, 8, 2]), v('Chicken / keema samosa', [200, 8, 17, 11, 1.2])],
  }),
  food('bajji', 'Bajji', ST, '4 pieces (100 g)', 100, [250, 5, 26, 14, 3.5], {
    tags: [SN, 'South Indian', 'Vegetarian'], meals: [S], basis: 'restaurant', aka: ['bhaji', 'bajjis', 'pakoda', 'pakora', 'bajji varieties', 'பஜ்ஜி'], sv: [x('2 pieces', 0.5), x('6 pieces', 1.5)],
    vr: [v('Mirchi bajji (1 large chilli)', [210, 4, 21, 12, 3]), v('Onion bajji (4 rings)', [240, 4.5, 24, 14, 2.5]), v('Raw banana (vazhakkai) bajji', [260, 4, 28, 14, 3]), v('Potato bajji', [255, 4.5, 27, 14, 2.5])],
  }),
  food('bonda', 'Bonda', ST, '2 pieces (100 g)', 100, [260, 5, 28, 14, 3], {
    tags: [SN, 'South Indian', 'Vegetarian'], meals: [S], basis: 'restaurant', aka: ['bonda', 'aloo bonda', 'potato bonda', 'urulai bonda', 'batata vada', 'bonda soup', 'போண்டா'], sv: [x('1 piece', 0.5), x('3 pieces', 1.5)],
    vr: [v('Mysore bonda (4 small)', [230, 5, 25, 12, 1.5])],
  }),
  food('medu-vada', 'Vada (medu vada)', ST, '1 vada (50 g)', 50, [160, 5, 14, 9.5, 2.5], {
    tags: [SN, 'South Indian', 'Vegetarian'], meals: [B, S], basis: 'restaurant', aka: ['vada', 'vadai', 'medhu vada', 'ulundu vada', 'uzhunnu vada', 'urad vada', 'வடை', 'உளுந்து வடை'], sv: [x('2 vadas', 2), x('3 vadas', 3)],
  }),
  food('masala-vada', 'Masala vada', ST, '2 pieces (60 g)', 60, [190, 7, 18, 10, 4], {
    tags: [SN, 'South Indian', 'Vegetarian'], meals: [S], basis: 'restaurant', aka: ['paruppu vada', 'masal vadai', 'kadalai paruppu vada', 'dal vada', 'chana dal vada', 'கீரை வடை', 'பருப்பு வடை', 'மசாலா வடை'], sv: [x('1 piece', 0.5), x('4 pieces', 2)],
  }),
  food('sambar-vada', 'Sambar vada', ST, '2 vadas in sambar (1 bowl, 250 g)', 250, [400, 12, 40, 21, 7], {
    tags: ['South Indian', 'Vegetarian'], meals: [B, S], basis: 'restaurant', aka: ['vada sambar', 'sambar vadai', 'சாம்பார் வடை'],
  }),
  food('thayir-vada', 'Thayir vada (curd vada)', ST, '2 vadas in curd (200 g)', 200, [330, 12, 28, 19, 2.5], {
    tags: ['South Indian', 'Vegetarian'], meals: [S, L], basis: 'restaurant', aka: ['curd vada', 'dahi vada', 'dahi bhalla', 'perugu vada', 'தயிர் வடை'],
  }),
  food('murukku', 'Murukku', SN, '3 pieces (30 g)', 30, [150, 2.8, 17, 8, 1.5], {
    tags: ['South Indian', 'Vegetarian'], meals: [S], basis: 'recipe', aka: ['chakli', 'chakri', 'thenkuzhal', 'rice murukku', 'முறுக்கு', 'தேன்குழல்'], sv: [x('1 piece', 0.33), x('6 pieces', 2)],
  }),
  food('mixture', 'Mixture (namkeen)', SN, '1 handful (30 g)', 30, [160, 4, 14, 10, 2], {
    tags: ['South Indian', 'Vegetarian'], meals: [S], basis: 'restaurant', aka: ['chivda', 'namkeen', 'bombay mixture', 'sev mixture', 'kara mixture', 'மிக்சர்', 'கார மிக்சர்'], sv: [x('1 small packet (50 g)', 1.67)],
  }),
  food('banana-chips', 'Banana chips', SN, '1 handful (30 g)', 30, [165, 1, 18, 10.5, 2], {
    tags: ['South Indian', 'Vegetarian'], meals: [S], basis: 'restaurant', aka: ['nendran chips', 'kerala banana chips', 'vazhakkai chips', 'plantain chips', 'வாழைக்காய் சிப்ஸ்'], sv: [x('1 small packet (50 g)', 1.67)],
  }),
  food('potato-chips', 'Potato chips (packet)', SN, '1 small packet (30 g)', 30, [160, 2, 15, 10, 1.2], {
    tags: ['Fast Food', 'Vegetarian'], meals: [S], basis: 'reference', aka: ['chips', 'wafers', 'lays', 'crisps', 'kurkure', 'potato wafers', 'சிப்ஸ்'], sv: [x('1 big packet (52 g)', 1.73)],
  }),
  food('kozhukattai', 'Kozhukattai', 'South Indian', '2 pieces (80 g)', 80, [130, 2.2, 26, 2, 1.5], {
    tags: [SN, 'Vegetarian'], meals: [B, S], basis: 'recipe', aka: ['modak', 'kolukattai', 'pidi kozhukattai', 'steamed dumpling', 'கொழுக்கட்டை'], sv: [x('1 piece', 0.5), x('4 pieces', 2)],
  }),
  food('bread-omelette', 'Bread omelette', ST, '1 sandwich (2 slices, 1 egg, 110 g)', 110, [290, 11, 28, 15, 1.5], {
    tags: ['Non-Vegetarian', 'Snacks'], meals: [B, S], basis: 'restaurant', aka: ['bread omlet', 'egg bread', 'egg sandwich street', 'ப்ரெட் ஆம்லெட்'],
  }),
  food('cutlet', 'Veg cutlet', SN, '2 pieces (80 g)', 80, [190, 4, 22, 9.5, 3], {
    tags: ['Vegetarian'], meals: [S], basis: 'restaurant', aka: ['vegetable cutlet', 'cutlets', 'aloo cutlet', 'veg patty', 'கட்லெட்'],
    vr: [v('Chicken cutlet', [230, 12, 17, 12, 1.2])],
  }),
  food('spring-roll', 'Spring roll', 'Fast Food', '2 pieces (100 g)', 100, [260, 6, 30, 13, 2.5], {
    tags: ['Snacks'], meals: [S], basis: 'restaurant', aka: ['veg spring roll', 'chicken spring roll', 'egg roll fried', 'ஸ்பிரிங் ரோல்'],
    vr: [v('Chicken spring roll', [290, 11, 29, 14, 1.5])],
  }),

  // ------------------------------------------------------------------ chaat and Mumbai street food
  food('pani-puri', 'Pani puri', ST, '6 puris (120 g, with water)', 120, [190, 3.5, 31, 6, 2.5], {
    tags: [SN, 'Vegetarian'], meals: [S], basis: 'restaurant', aka: ['panipuri', 'golgappa', 'gol gappa', 'puchka', 'phuchka', 'gup chup', 'pani poori', 'பானி பூரி'], sv: [x('3 puris', 0.5), x('10 puris', 1.67)],
  }),
  food('bhel-puri', 'Bhel puri', ST, '1 plate (100 g)', 100, [200, 4.5, 33, 6, 3], {
    tags: [SN, 'Vegetarian'], meals: [S], basis: 'restaurant', aka: ['bhelpuri', 'bhel', 'jhal muri', 'jhalmuri', 'churumuri', 'பேல் பூரி'],
  }),
  food('sev-puri', 'Sev puri', ST, '6 pieces (120 g)', 120, [290, 5.5, 34, 15, 3], {
    tags: [SN, 'Vegetarian'], meals: [S], basis: 'restaurant', aka: ['sevpuri', 'sev poori', 'papdi chaat', 'sev batata puri', 'சேவ் பூரி'],
  }),
  food('dahi-puri', 'Dahi puri', ST, '6 pieces (130 g)', 130, [260, 6.5, 34, 11, 2.5], {
    tags: [SN, 'Vegetarian'], meals: [S], basis: 'restaurant', aka: ['dahi poori', 'dahi papdi chaat', 'curd puri'],
  }),
  food('aloo-tikki', 'Aloo tikki (chaat)', ST, '2 tikkis (140 g)', 140, [260, 4.5, 34, 12, 3.5], {
    tags: [SN, 'North Indian', 'Vegetarian'], meals: [S], basis: 'restaurant', aka: ['aloo tikki chaat', 'tikki chaat', 'potato tikki', 'ragda patties'],
  }),
  food('pav-bhaji', 'Pav bhaji', ST, '1 plate (2 pav, 200 g bhaji)', 330, [580, 14, 78, 24, 8], {
    tags: ['Vegetarian', 'Fast Food'], meals: [L, D], basis: 'restaurant', aka: ['pav bhaji', 'pao bhaji', 'paw bhaji', 'pau bhaji', 'bhaji pav', 'பாவ் பாஜி'], sv: [x('1 pav with bhaji (half)', 0.5)],
    vr: [v('Extra butter', [680, 14, 78, 34, 8])],
  }),
  food('vada-pav', 'Vada pav', ST, '1 vada pav (140 g)', 140, [300, 7, 42, 12, 3], {
    tags: [SN, 'Vegetarian', 'Fast Food'], meals: [S, L], basis: 'restaurant', aka: ['wada pav', 'vada pao', 'batata vada pav', 'bombay burger', 'வடா பாவ்'], sv: [x('2 vada pav', 2)],
  }),
  food('misal-pav', 'Misal pav', ST, '1 plate (misal 200 g + 2 pav)', 280, [520, 17, 70, 20, 9], {
    tags: ['Vegetarian'], meals: [B, L], basis: 'restaurant', aka: ['misal', 'usal pav', 'missal pav'],
  }),
  food('kachori', 'Kachori', ST, '1 kachori (70 g)', 70, [260, 5.5, 26, 15, 3], {
    tags: [SN, 'North Indian', 'Vegetarian'], meals: [B, S], basis: 'restaurant', aka: ['khasta kachori', 'dal kachori', 'pyaaz kachori', 'kachauri', 'கச்சோரி'],
  }),
  food('dhokla', 'Dhokla', SN, '4 pieces (100 g)', 100, [160, 6, 24, 4.5, 2.5], {
    tags: ['Vegetarian'], meals: [B, S], basis: 'recipe', aka: ['khaman dhokla', 'khaman', 'white dhokla', 'dhokla gujarati', 'தோக்ளா'], sv: [x('2 pieces', 0.5), x('6 pieces', 1.5)],
  }),
  food('kothu-parotta', 'Kothu parotta (veg)', ST, '1 plate (300 g)', 300, [620, 14, 78, 28, 4], {
    tags: ['South Indian', 'Vegetarian'], meals: [D], basis: 'restaurant',
    aka: ['kothu paratha', 'koththu parotta', 'kothu porotta', 'kothu barotta', 'veg kothu parotta', 'vegetable kothu parotta', 'koththu parota', 'கொத்து பரோட்டா', 'கொத்துப் பரோட்டா', 'வெஜ் கொத்து பரோட்டா'],
    sv: [x('Half plate (150 g)', 0.5)],
  }),
  food('egg-kothu-parotta', 'Egg kothu parotta', ST, '1 plate (330 g, 2 eggs)', 330, [780, 24, 78, 40, 4], {
    tags: ['South Indian', 'Non-Vegetarian'], meals: [D], basis: 'restaurant',
    aka: ['egg kothu paratha', 'muttai kothu parotta', 'egg koththu parotta', 'egg kothu porotta', 'egg kothu barotta', 'முட்டை கொத்து பரோட்டா'], sv: [x('Half plate (165 g)', 0.5)],
  }),
  food('chicken-kothu-parotta', 'Chicken kothu parotta', ST, '1 plate (350 g)', 350, [850, 35, 78, 44, 4], {
    tags: ['South Indian', 'Non-Vegetarian'], meals: [D], basis: 'restaurant',
    aka: ['chicken kothu paratha', 'chicken koththu parotta', 'chicken kothu porotta', 'chicken kothu barotta', 'kozhi kothu parotta', 'சிக்கன் கொத்து பரோட்டா'], sv: [x('Half plate (175 g)', 0.5)],
  }),
  food('mutton-kothu-parotta', 'Mutton kothu parotta', ST, '1 plate (350 g)', 350, [920, 36, 78, 52, 4], {
    tags: ['South Indian', 'Non-Vegetarian'], meals: [D], basis: 'restaurant',
    aka: ['mutton kothu paratha', 'mutton koththu parotta', 'mutton kothu porotta', 'aatu kari kothu parotta', 'மட்டன் கொத்து பரோட்டா'], sv: [x('Half plate (175 g)', 0.5)],
  }),
  food('veg-puff', 'Veg puff', SN, '1 puff (80 g)', 80, [250, 4, 24, 16, 2], {
    tags: [ST, 'Vegetarian'], meals: [S], basis: 'restaurant', aka: ['vegetable puff', 'puff', 'bakery puff', 'puffs', 'வெஜ் பப்ஸ்', 'பப்ஸ்'], sv: [x('2 puffs', 2)],
  }),
  food('chicken-puff', 'Chicken puff', SN, '1 puff (90 g)', 90, [290, 9, 24, 18, 1.5], {
    tags: [ST, 'Non-Vegetarian'], meals: [S], basis: 'restaurant', aka: ['chicken puffs', 'bakery chicken puff', 'சிக்கன் பப்ஸ்'], sv: [x('2 puffs', 2)],
  }),
  food('egg-puff', 'Egg puff', SN, '1 puff (90 g)', 90, [280, 8, 24, 17, 1.5], {
    tags: [ST, 'Non-Vegetarian'], meals: [S], basis: 'restaurant', aka: ['egg puffs', 'bakery egg puff', 'முட்டை பப்ஸ்'], sv: [x('2 puffs', 2)],
  }),
  food('sweet-corn', 'Sweet corn (boiled)', SN, '1 cup (150 g)', 150, [130, 4.5, 29, 1.8, 3.5], {
    tags: [ST, 'Vegetarian', 'Vegetables'], meals: [S], basis: 'reference', aka: ['corn', 'boiled corn', 'masala corn', 'corn cup', 'roasted corn', 'bhutta', 'cholam', 'சோளம்', 'ஸ்வீட் கார்ன்'],
    vr: [v('Masala corn cup (butter, spice)', [200, 4.5, 29, 8, 3.5]), v('Roasted corn on the cob (1)', [155, 5, 33, 2, 4])],
  }),
  food('biscuits', 'Biscuits (tea / marie)', SN, '4 biscuits (30 g)', 30, [135, 2, 21, 4.5, 0.6], {
    tags: ['Vegetarian'], meals: [B, S], basis: 'reference', aka: ['biscuit', 'marie biscuit', 'glucose biscuit', 'tea biscuit', 'parle g', 'good day', 'rusk', 'பிஸ்கட்'], sv: [x('2 biscuits', 0.5), x('8 biscuits', 2)],
    vr: [v('Cream biscuits (3, 35 g)', [170, 2, 24, 7.5, 0.5])],
  }),
]
