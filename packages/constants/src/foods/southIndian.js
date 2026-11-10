// Tamil Nadu and South Indian foods: tiffin, rice dishes, meals, gravies, sides and non-vegetarian home cooking.
// Keys that existed in the first release are kept as they were (idli, dosa, pongal, upma, chapati, sambar, rasam, curd-rice, chicken-curry, fish,
// poriyal, sundal, rice-white, rice-brown): meals logged against them and users' edited copies keep pointing at the right food.
import { B, D, L, S, food, v, w, x } from './helpers.js'

const SI = 'South Indian'
const VEG = ['Vegetarian']
const NV = 'Non-Vegetarian'

export const SOUTH_INDIAN = [
  // ------------------------------------------------------------------ idli
  food('idli', 'Idli', SI, '1 idli (40 g)', 40, [58, 2, 12, 0.4, 0.6], {
    tags: VEG, meals: [B, D], basis: 'recipe',
    aka: ['idly', 'itli', 'eddli', 'steamed rice cake', 'இட்லி'],
    sv: [x('2 idlis', 2), x('3 idlis', 3), x('4 idlis', 4)],
  }),
  food('mini-idli', 'Mini idli', SI, '10 mini idlis (100 g)', 100, [145, 4.5, 30, 1, 1.5], {
    tags: VEG, meals: [B, D],
    aka: ['mini idly', 'button idli', 'podi idli', 'சிறிய இட்லி', 'மினி இட்லி'],
    sv: [x('5 mini idlis', 0.5), x('15 mini idlis', 1.5), x('20 mini idlis', 2)],
  }),
  food('sambar-idli', 'Sambar idli', SI, '2 idlis in sambar (1 bowl, 250 g)', 250, [185, 7, 33, 3, 4], {
    tags: VEG, meals: [B, D],
    aka: ['idli sambar', 'idly sambar', 'sambar idly', 'ghee sambar idli', 'சாம்பார் இட்லி'],
    sv: [x('3 idlis in sambar (350 g)', 1.5), x('Mini idlis in sambar (1 bowl, 200 g)', 0.8)],
    vr: [v('Ghee sambar idli (with 1 tsp ghee)', [225, 7, 33, 7, 4])],
  }),
  food('rava-idli', 'Rava idli', SI, '1 rava idli (60 g)', 60, [90, 2.7, 14, 2.5, 1], {
    tags: VEG, meals: [B], aka: ['semolina idli', 'sooji idli', 'ரவா இட்லி'], sv: [x('2 rava idlis', 2)],
  }),
  food('ragi-idli', 'Ragi idli', SI, '1 ragi idli (45 g)', 45, [60, 1.8, 12, 0.5, 1.4], {
    tags: VEG, meals: [B], aka: ['finger millet idli', 'kezhvaragu idli', 'ராகி இட்லி'], sv: [x('2 ragi idlis', 2), x('3 ragi idlis', 3)],
  }),
  food('thatte-idli', 'Thatte idli', SI, '1 thatte idli (120 g)', 120, [175, 5, 35, 1.2, 1.5], {
    tags: VEG, meals: [B], aka: ['plate idli', 'thatte idly'],
  }),

  // ------------------------------------------------------------------ dosa and its family
  food('dosa', 'Plain dosa', SI, '1 medium dosa (80 g)', 80, [133, 2.7, 25, 2.6, 1], {
    tags: VEG, meals: [B, D],
    aka: ['dosa', 'dosai', 'thosai', 'dosha', 'sada dosa', 'saada dosa', 'plain dosai', 'தோசை', 'தோசா'],
    sv: [x('2 dosas', 2), x('3 dosas', 3)],
  }),
  food('masala-dosa', 'Masala dosa', SI, '1 masala dosa (180 g)', 180, [290, 6, 44, 10, 3], {
    tags: VEG, meals: [B, D], basis: 'restaurant',
    aka: ['masala dosai', 'masala thosai', 'potato dosa', 'மசாலா தோசை', 'மசாலா தோசா'],
    vr: [v('Restaurant style (more oil / butter)', [390, 7, 52, 17, 3])],
  }),
  food('ghee-dosa', 'Ghee dosa', SI, '1 ghee dosa (90 g)', 90, [190, 3.2, 26, 8, 1], {
    tags: VEG, meals: [B, D],
    aka: ['ghee roast', 'ghee roast dosa', 'neyyi dosai', 'nei dosai', 'ghee thosai', 'நெய் தோசை', 'நெய் ரோஸ்ட்'],
    vr: [v('Ghee roast (large, crisp)', [240, 3.8, 30, 11, 1.2])],
  }),
  food('onion-dosa', 'Onion dosa', SI, '1 onion dosa (110 g)', 110, [170, 3.5, 28, 4.5, 1.5], {
    tags: VEG, meals: [B, D], aka: ['onion dosai', 'vengaya dosai', 'onion thosai', 'வெங்காய தோசை'],
  }),
  food('rava-dosa', 'Rava dosa', SI, '1 rava dosa (100 g)', 100, [165, 3.5, 26, 5, 1.2], {
    tags: VEG, meals: [B, D], aka: ['rava dosai', 'sooji dosa', 'semolina dosa', 'ரவா தோசை'],
    vr: [v('Onion rava dosa', [185, 3.8, 29, 5.5, 1.8])],
  }),
  food('podi-dosa', 'Podi dosa', SI, '1 podi dosa (100 g)', 100, [190, 4.5, 28, 6.5, 2], {
    tags: VEG, meals: [B, D], aka: ['podi dosai', 'milagai podi dosa', 'gunpowder dosa', 'பொடி தோசை'],
  }),
  food('egg-dosa', 'Egg dosa', SI, '1 egg dosa (130 g)', 130, [225, 10, 25, 9, 1], {
    tags: ['Non-Vegetarian', 'Protein Foods'], meals: [B, D], aka: ['muttai dosai', 'egg dosai', 'egg thosai', 'முட்டை தோசை'],
  }),
  food('ragi-dosa', 'Ragi dosa', SI, '1 ragi dosa (80 g)', 80, [125, 3, 22, 2.5, 2], {
    tags: VEG, meals: [B, D], aka: ['ragi dosai', 'finger millet dosa', 'kezhvaragu dosai', 'ராகி தோசை'],
  }),
  food('set-dosa', 'Set dosa', SI, '1 piece (50 g)', 50, [80, 1.8, 14.5, 1.6, 0.6], {
    tags: VEG, meals: [B], aka: ['set dosai', 'sponge dosa', 'uttapam style dosa'], sv: [x('3 pieces (usual plate)', 3)],
  }),
  food('neer-dosa', 'Neer dosa', SI, '1 neer dosa (60 g)', 60, [80, 1.5, 16, 1, 0.4], {
    tags: VEG, meals: [B], aka: ['neer dosai', 'water dosa', 'neer thosai'], sv: [x('2 neer dosas', 2)],
  }),
  food('uthappam', 'Onion uthappam', SI, '1 uthappam (130 g)', 130, [210, 5, 34, 6, 2.5], {
    tags: VEG, meals: [B, D], aka: ['uttapam', 'oothappam', 'uthapam', 'ooththappam', 'வெங்காய ஊத்தப்பம்', 'ஊத்தப்பம்'],
    vr: [v('Plain uthappam', [185, 4.5, 33, 3.5, 1.5]), v('Tomato onion uthappam', [215, 5, 35, 6, 2.8])],
  }),
  food('pesarattu', 'Pesarattu', SI, '1 pesarattu (100 g)', 100, [150, 7, 22, 3.5, 3.5], {
    tags: VEG, meals: [B], aka: ['pesarattu dosa', 'green gram dosa', 'moong dosa', 'pachai payir dosai'],
  }),
  food('adai', 'Adai', SI, '1 adai (90 g)', 90, [190, 8, 26, 6, 5], {
    tags: VEG, meals: [B, D], aka: ['adai dosai', 'adai dosa', 'mixed dal dosa', 'அடை'], sv: [x('2 adais', 2)],
  }),
  food('paniyaram', 'Kuzhi paniyaram', SI, '5 pieces (100 g)', 100, [200, 4, 30, 7, 1.5], {
    tags: VEG, meals: [B, S], aka: ['paniyaram', 'paddu', 'appe', 'kuli paniyaram', 'பணியாரம்', 'குழிப் பணியாரம்'], sv: [x('3 pieces', 0.6), x('10 pieces', 2)],
  }),

  // ------------------------------------------------------------------ appam, string hoppers, puttu
  food('appam', 'Appam', SI, '1 appam (50 g)', 50, [75, 1.2, 15, 1, 0.4], {
    tags: VEG, meals: [B, D], aka: ['aappam', 'palappam', 'hoppers', 'அப்பம்'], sv: [x('2 appams', 2), x('3 appams', 3)],
    vr: [v('With coconut milk (stew serving)', [140, 1.8, 17, 7, 0.8])],
  }),
  food('idiyappam', 'Idiyappam', SI, '3 idiyappam (100 g)', 100, [130, 2.5, 28, 0.8, 0.8], {
    tags: VEG, meals: [B, D], aka: ['idiappam', 'idiyappam', 'string hoppers', 'noolputtu', 'sevai', 'இடியாப்பம்'],
    sv: [w('1 idiyappam (33 g)', 33), x('6 idiyappam', 2)],
  }),
  food('puttu', 'Puttu', SI, '1 cup puttu with coconut (100 g)', 100, [180, 3.2, 34, 3, 1.8], {
    tags: VEG, meals: [B, D], aka: ['putu', 'rice puttu', 'steamed rice cake with coconut', 'புட்டு'],
    sv: [w('2 cups (200 g)', 200)],
    vr: [v('Ragi puttu', [160, 3.5, 32, 2.5, 3]), v('Wheat puttu', [170, 4.5, 31, 3, 3.5])],
  }),
  food('kadala-curry', 'Kadala curry', SI, '1 katori (150 g)', 150, [210, 10, 28, 7, 8], {
    tags: VEG, meals: [B], aka: ['kadalai curry', 'black chana curry', 'kala chana curry', 'கடலை கறி'],
  }),

  // ------------------------------------------------------------------ pongal, upma, kichadi, poori, parotta, chapati
  food('pongal', 'Ven pongal', SI, '1 katori (200 g)', 200, [230, 5.5, 34, 8, 1.5], {
    tags: VEG, meals: [B], aka: ['pongal', 'venn pongal', 'khara pongal', 'huggi', 'வெண் பொங்கல்', 'பொங்கல்'],
    sv: [w('1 plate (300 g)', 300)],
  }),
  food('sweet-pongal', 'Sweet pongal', SI, '1 katori (150 g)', 150, [290, 4.5, 50, 8, 1.2], {
    tags: ['Desserts', 'Vegetarian'], meals: [B, S], aka: ['sakkarai pongal', 'chakkarai pongal', 'sarkarai pongal', 'jaggery pongal', 'சர்க்கரை பொங்கல்', 'சக்கரை பொங்கல்'],
  }),
  food('upma', 'Upma', SI, '1 katori (150 g)', 150, [200, 4.5, 30, 6.5, 2], {
    tags: VEG, meals: [B], aka: ['uppuma', 'uppittu', 'rava upma', 'sooji upma', 'உப்புமா'], sv: [w('1 plate (250 g)', 250)],
    vr: [v('Vegetable upma', [210, 5, 31, 7, 3]), v('Semiya (vermicelli) upma', [215, 4.5, 33, 7, 2])],
  }),
  food('kichadi', 'Kichadi (rava kichadi)', SI, '1 katori (200 g)', 200, [215, 5, 32, 7, 3.5], {
    tags: VEG, meals: [B], aka: ['kichdi', 'khichadi', 'vegetable kichadi', 'rava kichadi', 'kitchadi', 'கிச்சடி'],
  }),
  food('kesari', 'Rava kesari', SI, '1 katori (100 g)', 100, [290, 3, 45, 11, 0.8], {
    tags: ['Desserts', 'Vegetarian'], meals: [B, S], aka: ['kesari bath', 'sheera', 'sooji halwa', 'rava kesari', 'கேசரி'],
  }),
  food('poori', 'Poori', SI, '1 poori (35 g)', 35, [120, 2.3, 15, 5.8, 1], {
    tags: ['North Indian', 'Vegetarian'], meals: [B, L], aka: ['puri', 'poorie', 'பூரி'], sv: [x('2 poori', 2), x('3 poori', 3)], basis: 'restaurant',
  }),
  food('poori-masala', 'Poori masala', SI, '2 poori with potato masala (250 g)', 250, [440, 9, 62, 18, 5], {
    tags: ['Vegetarian'], meals: [B], aka: ['poori kizhangu', 'poori bhaji', 'puri masala', 'பூரி மசாலா', 'பூரி கிழங்கு'], basis: 'restaurant',
    sv: [x('3 poori with masala', 1.45)],
  }),
  food('chapati', 'Chapati', 'North Indian', '1 medium chapati (40 g)', 40, [110, 3.2, 19.5, 2.4, 2.7], {
    tags: ['South Indian', 'Vegetarian'], meals: [B, L, D], aka: ['chappati', 'chapathi', 'phulka', 'சப்பாத்தி'],
    sv: [x('2 chapatis', 2), x('3 chapatis', 3)],
    vr: [v('With ghee or oil', [140, 3.2, 19.5, 5, 2.7]), v('Phulka (small, no oil)', [80, 2.5, 15, 1.2, 2])],
  }),
  food('parotta', 'Parotta', SI, '1 parotta (80 g)', 80, [280, 5.5, 38, 11, 1.5], {
    tags: ['Vegetarian'], meals: [L, D], basis: 'restaurant',
    aka: ['porotta', 'barotta', 'paratha', 'parota', 'kerala parotta', 'layered parotta', 'பரோட்டா', 'புரோட்டா'],
    sv: [x('2 parottas', 2), x('3 parottas', 3)],
    vr: [v('Wheat parotta', [250, 6.5, 33, 10, 3.5]), v('Veechu parotta (thin, large)', [320, 6, 42, 14, 1.8])],
  }),

  // ------------------------------------------------------------------ rice and meals
  food('rice-white', 'White rice (cooked)', 'Rice & Biryani', '1 katori (150 g)', 150, [195, 4, 43, 0.4, 0.6], {
    tags: ['South Indian', 'Vegetarian'], meals: [L, D], basis: 'reference',
    aka: ['rice', 'sadam', 'saadam', 'steamed rice', 'boiled rice', 'plain rice', 'annam', 'சாதம்', 'அரிசி சாதம்'],
    sv: [x('1 cup (200 g)', 1.33), w('1 plate (300 g)', 300), x('Small katori (100 g)', 0.67)],
  }),
  food('rice-brown', 'Brown rice (cooked)', 'Rice & Biryani', '1 katori (150 g)', 150, [165, 3.8, 34.5, 1.3, 2.7], {
    tags: ['Vegetarian'], meals: [L, D], basis: 'reference', aka: ['red rice', 'matta rice', 'kerala matta rice', 'unpolished rice', 'பிரவுன் ரைஸ்'],
    sv: [x('1 cup (200 g)', 1.33), w('1 plate (300 g)', 300)],
  }),
  food('sambar-rice', 'Sambar rice', 'Rice & Biryani', '1 plate (300 g)', 300, [390, 12, 63, 9, 5], {
    tags: ['South Indian', 'Vegetarian'], meals: [L, D], aka: ['sambar sadam', 'sambar saadham', 'sambhar rice', 'சாம்பார் சாதம்'], sv: [x('1 katori (150 g)', 0.5)],
  }),
  food('curd-rice', 'Curd rice', 'Rice & Biryani', '1 katori (200 g)', 200, [240, 7, 38, 6.5, 0.8], {
    tags: ['South Indian', 'Vegetarian'], meals: [L, D], aka: ['thayir sadam', 'thayir saadham', 'dahi rice', 'yogurt rice', 'mosaranna', 'perugu annam', 'தயிர் சாதம்'],
    sv: [w('1 plate (300 g)', 300)],
  }),
  food('lemon-rice', 'Lemon rice', 'Rice & Biryani', '1 plate (250 g)', 250, [395, 7.5, 62, 13, 2.5], {
    tags: ['South Indian', 'Vegetarian'], meals: [L, D], aka: ['elumichai sadam', 'lemon sadam', 'chitranna', 'nimmakaya pulihora', 'எலுமிச்சை சாதம்'], sv: [x('1 katori (150 g)', 0.6)],
  }),
  food('tomato-rice', 'Tomato rice', 'Rice & Biryani', '1 plate (250 g)', 250, [380, 7, 62, 11, 3], {
    tags: ['South Indian', 'Vegetarian'], meals: [L, D], aka: ['thakkali sadam', 'tomato bath', 'tomato sadam', 'தக்காளி சாதம்'], sv: [x('1 katori (150 g)', 0.6)],
  }),
  food('tamarind-rice', 'Tamarind rice (puliyodarai)', 'Rice & Biryani', '1 plate (250 g)', 250, [420, 7, 64, 15, 3], {
    tags: ['South Indian', 'Vegetarian'], meals: [L, D], aka: ['puliyodarai', 'puliyogare', 'pulihora', 'puli sadam', 'puliyodharai', 'புளியோதரை', 'புளி சாதம்'], sv: [x('1 katori (150 g)', 0.6)],
  }),
  food('coconut-rice', 'Coconut rice', 'Rice & Biryani', '1 plate (250 g)', 250, [430, 7, 60, 18, 3], {
    tags: ['South Indian', 'Vegetarian'], meals: [L, D], aka: ['thengai sadam', 'thengai saadham', 'kobbari annam', 'தேங்காய் சாதம்'], sv: [x('1 katori (150 g)', 0.6)],
  }),
  food('rasam-rice', 'Rasam rice', 'Rice & Biryani', '1 plate (300 g)', 300, [300, 7.5, 56, 4.5, 2.5], {
    tags: ['South Indian', 'Vegetarian'], meals: [L, D], aka: ['rasam sadam', 'rasa sadam', 'ரசம் சாதம்'],
  }),
  food('ghee-rice', 'Ghee rice', 'Rice & Biryani', '1 plate (250 g)', 250, [440, 7, 62, 17, 1], {
    tags: ['South Indian', 'Vegetarian'], meals: [L, D], aka: ['neyyi sadam', 'nei choru', 'nei sadam', 'நெய் சாதம்', 'நெய் சோறு'], basis: 'restaurant',
  }),
  food('bisi-bele-bath', 'Bisi bele bath', 'Rice & Biryani', '1 katori (250 g)', 250, [330, 10, 52, 9, 6], {
    tags: ['South Indian', 'Vegetarian'], meals: [L, D], aka: ['bisibelebath', 'bisi bele huli anna', 'sambar bath'],
  }),
  food('south-indian-meals', 'South Indian meals (full meals)', SI, '1 plate (rice, sambar, rasam, poriyal, kootu, curd)', 850, [800, 24, 135, 18, 14], {
    tags: ['Vegetarian'], meals: [L, D], basis: 'restaurant',
    aka: ['full meals', 'meals', 'veg meals', 'unlimited meals', 'sapadu', 'saapadu', 'saapaadu', 'thali', 'south indian thali', 'sappadu', 'சாப்பாடு', 'முழு சாப்பாடு', 'மீல்ஸ்'],
    sv: [x('Mini meals (about 70%)', 0.7), x('Extra rice (+1 katori) added', 1.25)],
    note: 'A typical restaurant plate: about 2 katoris of rice with sambar, rasam, two vegetables, kootu, curd and appalam. Portions differ a lot.',
  }),
  food('south-indian-nonveg-meals', 'South Indian meals with chicken or fish', SI, '1 plate (rice, gravy, fry, sides)', 900, [1000, 42, 135, 33, 12], {
    tags: ['Non-Vegetarian'], meals: [L, D], basis: 'restaurant',
    aka: ['non veg meals', 'non-veg meals', 'nonveg meals', 'fish meals', 'chicken meals', 'meen sapadu', 'non veg sapadu', 'அசைவ சாப்பாடு', 'மீன் சாப்பாடு'],
    sv: [x('Mini meals (about 70%)', 0.7)],
  }),
  food('sambar', 'Sambar', SI, '1 katori (150 ml)', 150, [85, 4, 12, 2.5, 3], {
    tags: VEG, meals: [B, L, D], aka: ['sambhar', 'saambar', 'sambaar', 'சாம்பார்'], sv: [x('1 cup (240 ml)', 1.6)],
    vr: [v('Tiffin sambar (thin)', [60, 2.8, 9, 1.8, 2])],
  }),
  food('rasam', 'Rasam', SI, '1 katori (150 ml)', 150, [40, 1.5, 6, 1.2, 1], {
    tags: VEG, meals: [L, D], aka: ['saaru', 'chaaru', 'pepper rasam', 'tomato rasam', 'milagu rasam', 'ரசம்'], sv: [x('1 cup (240 ml)', 1.6)],
  }),
  food('kootu', 'Kootu', SI, '1 katori (120 g)', 120, [120, 5.5, 13, 5, 4], {
    tags: VEG, meals: [L, D], aka: ['koottu', 'dal kootu', 'poosanikai kootu', 'கூட்டு'],
  }),
  food('poriyal', 'Vegetable poriyal', SI, '1 katori (100 g)', 100, [90, 2, 9, 5, 3.5], {
    tags: ['Vegetarian', 'Vegetables'], meals: [L, D], aka: ['poriyal', 'porial', 'palya', 'thoran', 'stir fry vegetable', 'பொரியல்'], sv: [x('Small katori (60 g)', 0.6)],
    vr: [v('Light oil, no coconut', [60, 2, 8, 2.5, 3])],
  }),
  food('beans-poriyal', 'Beans poriyal', SI, '1 katori (100 g)', 100, [85, 2.5, 8, 5, 3], {
    tags: ['Vegetarian', 'Vegetables'], meals: [L, D], aka: ['beans palya', 'green beans stir fry', 'beans thoran', 'பீன்ஸ் பொரியல்'],
  }),
  food('cabbage-poriyal', 'Cabbage poriyal', SI, '1 katori (100 g)', 100, [80, 2, 8, 4.5, 3], {
    tags: ['Vegetarian', 'Vegetables'], meals: [L, D], aka: ['cabbage thoran', 'muttaikose poriyal', 'முட்டைகோஸ் பொரியல்'],
  }),
  food('carrot-poriyal', 'Carrot poriyal', SI, '1 katori (100 g)', 100, [85, 1.5, 10, 4.5, 2.8], {
    tags: ['Vegetarian', 'Vegetables'], meals: [L, D], aka: ['carrot palya', 'carrot thoran', 'கேரட் பொரியல்'],
  }),
  food('potato-fry', 'Potato fry (urulai kizhangu roast)', SI, '1 katori (100 g)', 100, [150, 2.2, 22, 6.5, 2.5], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['urulai kizhangu', 'urulaikizhangu fry', 'urulai roast', 'aloo fry', 'potato roast', 'potato varuval', 'உருளைக்கிழங்கு வறுவல்', 'உருளைக்கிழங்கு ரோஸ்ட்'],
  }),
  food('brinjal-curry', 'Brinjal curry (kathirikai)', SI, '1 katori (120 g)', 120, [110, 2.2, 9, 7.5, 3.5], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['kathirikai kari', 'kathirikai kuzhambu', 'baingan curry', 'eggplant curry', 'brinjal masala', 'brinjal fry', 'கத்திரிக்காய் கறி'],
  }),
  food('vazhakkai-fry', 'Raw banana fry (vazhakkai)', SI, '1 katori (100 g)', 100, [140, 1.5, 24, 5, 3], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['vazhakkai varuval', 'raw banana roast', 'plantain fry', 'வாழைக்காய் வறுவல்'],
  }),
  food('avial', 'Avial', SI, '1 katori (150 g)', 150, [150, 3, 10, 11, 4], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['aviyal', 'mixed vegetable coconut curry', 'அவியல்'],
  }),
  food('keerai-masiyal', 'Keerai masiyal', SI, '1 katori (120 g)', 120, [90, 5, 9, 3.5, 4], {
    tags: ['Vegetarian', 'Vegetables'], meals: [L, D], aka: ['keerai kootu', 'spinach dal', 'keerai', 'greens masiyal', 'கீரை மசியல்'],
  }),
  food('vatha-kuzhambu', 'Vatha kuzhambu', SI, '1 katori (150 ml)', 150, [120, 2, 15, 6, 3], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['kara kuzhambu', 'puli kuzhambu', 'vathal kuzhambu', 'pulikulambu', 'tamarind gravy', 'வத்தக் குழம்பு', 'காரக்குழம்பு'],
  }),
  food('mor-kuzhambu', 'Mor kuzhambu', SI, '1 katori (150 ml)', 150, [90, 3, 7, 5.5, 1], {
    tags: ['Vegetarian'], meals: [L, D], aka: ['moru kuzhambu', 'majjiga pulusu', 'buttermilk curry', 'மோர் குழம்பு'],
  }),
  food('appalam', 'Appalam (papad)', SI, '1 appalam (roasted, 10 g)', 10, [35, 2.2, 5, 0.5, 0.4], {
    tags: ['Snacks', 'Vegetarian'], meals: [L, D], aka: ['papad', 'papadam', 'pappadam', 'pappad', 'அப்பளம்'],
    vr: [v('Fried', [55, 2, 5, 3, 0.4])],
  }),
  food('coconut-chutney', 'Coconut chutney', SI, '2 tablespoons (30 g)', 30, [55, 1, 2.5, 4.5, 1.2], {
    tags: VEG, meals: [B, D], aka: ['thengai chutney', 'chutney', 'தேங்காய் சட்னி', 'சட்னி'], sv: [x('4 tablespoons', 2)],
  }),
  food('tomato-chutney', 'Tomato chutney', SI, '2 tablespoons (30 g)', 30, [40, 0.7, 3, 2.8, 0.6], {
    tags: VEG, meals: [B, D], aka: ['thakkali chutney', 'tomato thokku', 'தக்காளி சட்னி'], sv: [x('4 tablespoons', 2)],
  }),
  food('onion-chutney', 'Onion chutney', SI, '2 tablespoons (30 g)', 30, [45, 0.8, 4, 3, 0.7], {
    tags: VEG, meals: [B, D], aka: ['vengaya chutney', 'வெங்காய சட்னி'], sv: [x('4 tablespoons', 2)],
  }),
  food('idli-podi', 'Idli podi (milagai podi)', SI, '1 tablespoon (10 g)', 10, [50, 2.5, 5, 2.3, 1.3], {
    tags: VEG, meals: [B, D], aka: ['milagai podi', 'gunpowder', 'idly podi', 'chutney powder', 'molaga podi', 'மிளகாய் பொடி', 'இட்லி பொடி'],
    vr: [v('Mixed with gingelly oil', [95, 2.5, 5, 8, 1.3])],
  }),
  food('sundal', 'Sundal (chickpea)', SI, '1 katori (100 g)', 100, [165, 8, 22, 5, 6.5], {
    tags: ['Snacks', 'Vegetarian'], meals: [S], aka: ['chana sundal', 'kondakadalai sundal', 'channa sundal', 'chickpea salad', 'சுண்டல்'], sv: [x('Small katori (60 g)', 0.6)],
  }),
  food('ragi-koozh', 'Ragi koozh (ragi porridge)', SI, '1 glass (250 ml)', 250, [110, 2.8, 22, 1, 2.2], {
    tags: ['Beverages', 'Vegetarian'], meals: [B, S], aka: ['ragi kali', 'ragi malt', 'kezhvaragu koozh', 'ragi ambali', 'finger millet porridge', 'கேழ்வரகு கூழ்', 'ராகி கூழ்'],
    vr: [v('Ragi malt with milk and jaggery', [190, 5, 35, 3.5, 2.5])],
  }),
  food('kambu-koozh', 'Kambu koozh (pearl millet porridge)', SI, '1 glass (250 ml)', 250, [100, 3, 19, 1.4, 1.5], {
    tags: ['Beverages', 'Vegetarian'], meals: [B, S], aka: ['kambu kali', 'bajra koozh', 'pearl millet porridge', 'கம்பு கூழ்'],
  }),

  // ------------------------------------------------------------------ non-vegetarian home cooking
  food('chicken-curry', 'Chicken curry', NV, '1 katori (150 g, with gravy)', 150, [240, 19, 6, 15, 1.2], {
    tags: ['South Indian', 'Protein Foods'], meals: [L, D],
    aka: ['chicken kuzhambu', 'chicken kulambu', 'kozhi kuzhambu', 'kozhi curry', 'country chicken curry', 'chicken gravy', 'கோழி குழம்பு', 'சிக்கன் குழம்பு', 'சிக்கன் கறி'],
    sv: [x('2 katoris', 2)], vr: [v('Boneless', [270, 26, 6, 16, 1.2]), v('Restaurant style (oily)', [340, 20, 8, 25, 1.2])],
  }),
  food('mutton-curry', 'Mutton curry', NV, '1 katori (150 g, with gravy)', 150, [310, 22, 6, 22, 1.2], {
    tags: ['South Indian', 'Protein Foods'], meals: [L, D],
    aka: ['mutton kuzhambu', 'mutton kulambu', 'aatu kari', 'attu kari', 'goat curry', 'mutton gravy', 'mutton masala', 'ஆட்டுக்கறி குழம்பு', 'மட்டன் குழம்பு', 'மட்டன் கறி'],
    sv: [x('2 katoris', 2)], basis: 'restaurant',
  }),
  food('egg-curry', 'Egg curry', NV, '1 katori (2 eggs, 150 g)', 150, [270, 14, 9, 20, 1.5], {
    tags: ['South Indian', 'Protein Foods'], meals: [L, D], aka: ['muttai kuzhambu', 'muttai curry', 'egg kuzhambu', 'egg masala', 'egg gravy', 'முட்டை குழம்பு', 'முட்டை கறி'],
  }),
  food('fish', 'Fish curry', NV, '1 katori (150 g, 2 pieces)', 150, [190, 20, 4, 10, 0.5], {
    tags: ['South Indian', 'Protein Foods'], meals: [L, D],
    aka: ['meen kuzhambu', 'meen kulambu', 'meen curry', 'fish kuzhambu', 'fish kulambu', 'fish gravy', 'fish masala', 'மீன் குழம்பு', 'மீன் கறி'],
    vr: [v('Coconut milk fish curry (Kerala style)', [250, 20, 6, 17, 0.8])],
  }),
  food('chettinad-chicken', 'Chettinad chicken', NV, '1 katori (150 g)', 150, [290, 22, 7, 19, 1.5], {
    tags: ['South Indian', 'Protein Foods'], meals: [L, D], aka: ['chettinadu chicken', 'chettinad kozhi', 'chettinad chicken masala', 'செட்டிநாடு சிக்கன்', 'செட்டிநாடு கோழி'], basis: 'restaurant',
  }),
  food('pepper-chicken', 'Pepper chicken', NV, '1 serving (150 g)', 150, [260, 26, 4, 16, 1], {
    tags: ['South Indian', 'Protein Foods'], meals: [L, D], aka: ['chicken pepper fry', 'milagu kozhi', 'pepper chicken dry', 'chicken milagu varuval', 'மிளகு சிக்கன்', 'மிளகு கோழி'], basis: 'restaurant',
  }),
  food('chicken-chukka', 'Chicken chukka', NV, '1 serving (120 g)', 120, [250, 24, 5, 15, 1], {
    tags: ['South Indian', 'Protein Foods'], meals: [L, D], aka: ['chicken chukka varuval', 'chicken sukka', 'kozhi chukka', 'சிக்கன் சுக்கா', 'கோழி சுக்கா'], basis: 'restaurant',
  }),
  food('mutton-chukka', 'Mutton chukka', NV, '1 serving (120 g)', 120, [330, 26, 5, 23, 1], {
    tags: ['South Indian', 'Protein Foods'], meals: [L, D], aka: ['mutton sukka', 'mutton varuval', 'mutton fry', 'aatu kari varuval', 'மட்டன் சுக்கா', 'ஆட்டுக்கறி வறுவல்'], basis: 'restaurant',
  }),
  food('mutton-keema', 'Mutton keema', NV, '1 katori (120 g)', 120, [290, 21, 6, 20, 1.5], {
    tags: ['Protein Foods', 'North Indian'], meals: [L, D], aka: ['keema', 'kheema', 'minced mutton', 'keema masala', 'கொத்துக்கறி', 'கீமா'], basis: 'restaurant',
  }),
  food('fish-fry', 'Fish fry', NV, '1 piece (100 g)', 100, [200, 20, 7, 10, 0.4], {
    tags: ['South Indian', 'Protein Foods'], meals: [L, D], aka: ['meen varuval', 'fish varuval', 'fried fish', 'masala fish fry', 'tawa fish', 'மீன் வறுவல்'], sv: [x('2 pieces', 2)], basis: 'restaurant',
    vr: [v('Deep fried (batter)', [260, 21, 11, 15, 0.5]), v('Shallow fried, little oil', [165, 21, 4, 7, 0.3])],
  }),
  food('fish-65', 'Fish 65', NV, '6 pieces (120 g)', 120, [280, 21, 12, 16, 0.8], {
    tags: ['Snacks', 'Protein Foods'], meals: [S, D], aka: ['fish sixty five', 'fish 65 fry', 'மீன் 65'], sv: [x('10 pieces', 1.67)], basis: 'restaurant',
  }),
  food('prawn-fry', 'Prawn fry', NV, '1 serving (100 g)', 100, [220, 20, 6, 13, 0.5], {
    tags: ['South Indian', 'Protein Foods'], meals: [L, D], aka: ['prawn varuval', 'shrimp fry', 'prawn roast', 'eral varuval', 'இறால் வறுவல்'], basis: 'restaurant',
  }),
  food('prawn-masala', 'Prawn masala', NV, '1 katori (150 g)', 150, [200, 22, 6, 10, 1], {
    tags: ['South Indian', 'Protein Foods'], meals: [L, D], aka: ['prawn curry', 'eral masala', 'eral kuzhambu', 'shrimp masala', 'இறால் மசாலா', 'இறால் குழம்பு'], basis: 'restaurant',
  }),
  food('sardine-fry', 'Sardine fry (mathi)', NV, '2 small fish (100 g)', 100, [190, 20, 3, 11, 0.2], {
    tags: ['South Indian', 'Protein Foods'], meals: [L, D], aka: ['mathi fry', 'mathi varuval', 'sardines', 'oil sardine fry', 'மத்தி வறுவல்'], basis: 'recipe',
  }),
  food('omelette', 'Omelette', 'Protein Foods', '1 omelette (2 eggs, 110 g)', 110, [210, 13, 2, 16, 0.2], {
    tags: ['Non-Vegetarian', 'South Indian'], meals: [B, D], aka: ['omlet', 'egg omelette', 'masala omelette', 'muttai omelette', 'ஆம்லெட்', 'முட்டை ஆம்லெட்'],
    vr: [v('1 egg omelette', [105, 6.5, 1, 8, 0.1])], sv: [x('3 egg omelette', 1.5)],
  }),
  food('half-boil', 'Half boil egg', 'Protein Foods', '1 egg (50 g)', 50, [80, 6.3, 0.6, 5.5, 0], {
    tags: ['Non-Vegetarian'], meals: [B, D], aka: ['half boiled egg', 'half boil', 'fried egg', 'egg poach', 'பாதி வேகவைத்த முட்டை'], basis: 'reference',
    vr: [v('Fried egg (1 tsp oil)', [105, 6.5, 0.6, 8.5, 0])],
  }),
]
