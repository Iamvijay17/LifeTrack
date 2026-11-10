// Biryani, fried rice and noodles, restaurant non-vegetarian starters, and fast food.
// Restaurant dishes vary a great deal (oil, portion, how much meat is in the rice), so these are rough guides: basis 'restaurant'.
import { B, D, L, S, food, v, w, x } from './helpers.js'

const RB = 'Rice & Biryani'
const NV = 'Non-Vegetarian'
const FF = 'Fast Food'

export const RESTAURANT = [
  // ------------------------------------------------------------------ biryani, pulao
  food('chicken-biryani', 'Chicken biryani', RB, '1 plate (350 g)', 350, [620, 30, 74, 22, 3], {
    tags: [NV, 'South Indian', 'Protein Foods'], meals: [L, D], basis: 'restaurant',
    aka: ['chicken briyani', 'chicken biriyani', 'kozhi biryani', 'dum biryani', 'hyderabadi biryani', 'ambur biryani', 'dindigul biryani', 'thalappakatti biryani', 'seeraga samba biryani', 'சிக்கன் பிரியாணி', 'கோழி பிரியாணி', 'பிரியாணி'],
    sv: [x('Half plate (175 g)', 0.5), x('Full plate (500 g)', 1.43)],
    vr: [v('Home style (less oil)', [520, 28, 70, 14, 3]), v('Ambur / Dindigul style (seeraga samba)', [660, 29, 76, 26, 3])],
  }),
  food('mutton-biryani', 'Mutton biryani', RB, '1 plate (350 g)', 350, [700, 32, 72, 31, 3], {
    tags: [NV, 'South Indian', 'Protein Foods'], meals: [L, D], basis: 'restaurant',
    aka: ['mutton briyani', 'mutton biriyani', 'goat biryani', 'aatu kari biryani', 'lamb biryani', 'மட்டன் பிரியாணி'],
    sv: [x('Half plate (175 g)', 0.5), x('Full plate (500 g)', 1.43)],
  }),
  food('beef-biryani', 'Beef biryani', RB, '1 plate (350 g)', 350, [680, 33, 72, 28, 3], {
    tags: [NV, 'Protein Foods'], meals: [L, D], basis: 'restaurant',
    aka: ['beef briyani', 'beef biriyani', 'bf biryani', 'maadu biryani', 'பீஃப் பிரியாணி', 'மாட்டிறைச்சி பிரியாணி'],
    sv: [x('Half plate (175 g)', 0.5)],
  }),
  food('egg-biryani', 'Egg biryani', RB, '1 plate (350 g, 2 eggs)', 350, [560, 20, 76, 19, 3], {
    tags: [NV, 'South Indian'], meals: [L, D], basis: 'restaurant',
    aka: ['egg briyani', 'egg biriyani', 'muttai biryani', 'முட்டை பிரியாணி'], sv: [x('Half plate (175 g)', 0.5)],
  }),
  food('fish-biryani', 'Fish biryani', RB, '1 plate (350 g)', 350, [590, 28, 74, 19, 3], {
    tags: [NV, 'South Indian', 'Protein Foods'], meals: [L, D], basis: 'restaurant',
    aka: ['fish briyani', 'meen biryani', 'fish biriyani', 'மீன் பிரியாணி'], sv: [x('Half plate (175 g)', 0.5)],
  }),
  food('prawn-biryani', 'Prawn biryani', RB, '1 plate (350 g)', 350, [580, 26, 75, 19, 3], {
    tags: [NV, 'Protein Foods'], meals: [L, D], basis: 'restaurant',
    aka: ['prawn briyani', 'shrimp biryani', 'eral biryani', 'இறால் பிரியாணி'], sv: [x('Half plate (175 g)', 0.5)],
  }),
  food('veg-biryani', 'Vegetable biryani', RB, '1 plate (350 g)', 350, [520, 11, 82, 16, 5], {
    tags: ['Vegetarian', 'South Indian'], meals: [L, D], basis: 'restaurant',
    aka: ['veg biryani', 'veg briyani', 'vegetable briyani', 'veg biriyani', 'வெஜ் பிரியாணி'], sv: [x('Half plate (175 g)', 0.5)],
  }),
  food('paneer-biryani', 'Paneer biryani', RB, '1 plate (350 g)', 350, [600, 20, 76, 24, 4], {
    tags: ['Vegetarian'], meals: [L, D], basis: 'restaurant', aka: ['paneer briyani', 'paneer biriyani'],
  }),
  food('veg-pulao', 'Vegetable pulao', RB, '1 plate (250 g)', 250, [370, 8, 60, 10, 4], {
    tags: ['Vegetarian', 'North Indian'], meals: [L, D], aka: ['pulao', 'pulav', 'veg pulao', 'veg pulav', 'vegetable pulav', 'matar pulao', 'பிலாவ்'], sv: [x('1 katori (150 g)', 0.6)],
  }),
  food('kuska', 'Kuska (plain biryani rice)', RB, '1 plate (250 g)', 250, [400, 7, 62, 14, 1.5], {
    tags: ['South Indian', 'Vegetarian'], meals: [L, D], aka: ['kushka', 'biryani rice', 'plain biryani', 'பிரியாணி சாதம்', 'குஸ்கா'], basis: 'restaurant',
  }),

  // ------------------------------------------------------------------ fried rice and noodles (Indo-Chinese)
  food('chicken-fried-rice', 'Chicken fried rice', RB, '1 plate (300 g)', 300, [540, 24, 72, 18, 3], {
    tags: [FF, NV], meals: [L, D], basis: 'restaurant',
    aka: ['chicken fry rice', 'chicken friedrice', 'chicken rice chinese', 'சிக்கன் ப்ரைட் ரைஸ்', 'சிக்கன் ஃப்ரைட் ரைஸ்'],
    sv: [x('Half plate (150 g)', 0.5)],
  }),
  food('egg-fried-rice', 'Egg fried rice', RB, '1 plate (300 g)', 300, [490, 15, 72, 16, 3], {
    tags: [FF, NV], meals: [L, D], basis: 'restaurant',
    aka: ['egg fry rice', 'egg friedrice', 'muttai fried rice', 'முட்டை ப்ரைட் ரைஸ்', 'முட்டை ஃப்ரைட் ரைஸ்'],
    sv: [x('Half plate (150 g)', 0.5)],
  }),
  food('mixed-fried-rice', 'Mixed fried rice', RB, '1 plate (350 g)', 350, [640, 28, 80, 24, 4], {
    tags: [FF, NV], meals: [L, D], basis: 'restaurant',
    aka: ['mixed fry rice', 'mix fried rice', 'special fried rice', 'chicken egg prawn fried rice', 'மிக்ஸ்டு ஃப்ரைட் ரைஸ்'],
    sv: [x('Half plate (175 g)', 0.5)],
  }),
  food('veg-fried-rice', 'Vegetable fried rice', RB, '1 plate (300 g)', 300, [450, 9, 74, 13, 4], {
    tags: [FF, 'Vegetarian'], meals: [L, D], basis: 'restaurant', aka: ['veg fried rice', 'veg fry rice', 'vegetable fry rice', 'schezwan fried rice', 'வெஜ் ப்ரைட் ரைஸ்'],
    sv: [x('Half plate (150 g)', 0.5)],
  }),
  food('chicken-noodles', 'Chicken noodles', FF, '1 plate (300 g)', 300, [520, 24, 68, 16, 3.5], {
    tags: [NV], meals: [L, D], basis: 'restaurant', aka: ['chicken hakka noodles', 'chicken fried noodles', 'chicken chowmein', 'chicken chow mein', 'சிக்கன் நூடுல்ஸ்'], sv: [x('Half plate (150 g)', 0.5)],
  }),
  food('egg-noodles', 'Egg noodles', FF, '1 plate (300 g)', 300, [480, 16, 70, 15, 3.5], {
    tags: [NV], meals: [L, D], basis: 'restaurant', aka: ['egg hakka noodles', 'egg fried noodles', 'egg chowmein', 'egg chow mein', 'முட்டை நூடுல்ஸ்'], sv: [x('Half plate (150 g)', 0.5)],
  }),
  food('veg-noodles', 'Vegetable noodles', FF, '1 plate (300 g)', 300, [430, 10, 68, 13, 4], {
    tags: ['Vegetarian'], meals: [L, D], basis: 'restaurant', aka: ['veg noodles', 'veg hakka noodles', 'veg chowmein', 'veg chow mein', 'வெஜ் நூடுல்ஸ்'], sv: [x('Half plate (150 g)', 0.5)],
  }),
  food('maggi-noodles', 'Instant noodles (masala)', FF, '1 packet cooked (70 g dry)', 70, [310, 7, 44, 12, 2], {
    tags: ['Snacks', 'Vegetarian'], meals: [S, D], basis: 'reference', aka: ['maggi', 'maggie', 'maggi masala', 'instant noodles', 'ramen', 'top ramen', 'yippee', 'மேகி'],
    sv: [x('Half packet', 0.5), x('2 packets', 2)],
  }),
  food('pasta-white-sauce', 'Pasta (white sauce)', FF, '1 plate (250 g)', 250, [460, 14, 52, 22, 3], {
    tags: ['Vegetarian'], meals: [L, D], basis: 'restaurant', aka: ['alfredo pasta', 'creamy pasta', 'penne white sauce', 'white sauce pasta'],
    vr: [v('With chicken', [540, 28, 52, 24, 3])],
  }),
  food('pasta-red-sauce', 'Pasta (red sauce)', FF, '1 plate (250 g)', 250, [380, 11, 60, 11, 4], {
    tags: ['Vegetarian'], meals: [L, D], basis: 'restaurant', aka: ['arrabbiata pasta', 'tomato pasta', 'penne red sauce', 'red sauce pasta', 'spaghetti marinara'],
    vr: [v('With chicken', [470, 27, 60, 13, 4])],
  }),

  // ------------------------------------------------------------------ chicken starters
  food('chicken-65', 'Chicken 65', NV, '1 serving (6 pieces, 120 g)', 120, [310, 22, 14, 18, 0.8], {
    tags: ['Snacks', 'South Indian', 'Protein Foods'], meals: [S, D], basis: 'restaurant',
    aka: ['chicken sixty five', 'chicken 65 fry', 'chicken65', 'hot chicken 65', 'சிக்கன் 65'],
    sv: [x('Half serving (3 pieces)', 0.5), x('Full plate (250 g)', 2.08)],
    vr: [v('Boneless', [340, 25, 15, 20, 0.8]), v('Gravy style (chicken 65 gravy)', [380, 24, 18, 25, 1.2])],
  }),
  food('chicken-lollipop', 'Chicken lollipop', NV, '4 pieces (160 g)', 160, [420, 28, 20, 26, 1], {
    tags: ['Snacks', 'Protein Foods'], meals: [S, D], basis: 'restaurant', aka: ['chicken lolipop', 'lollipop chicken', 'lollypop', 'chicken drumstick starter', 'சிக்கன் லாலிபாப்'],
    sv: [x('1 piece (40 g)', 0.25), x('6 pieces', 1.5)],
  }),
  food('chicken-fry', 'Chicken fry', NV, '1 serving (150 g)', 150, [340, 28, 10, 21, 0.8], {
    tags: ['South Indian', 'Protein Foods'], meals: [L, D], basis: 'restaurant',
    aka: ['chicken varuval', 'fried chicken south indian', 'kozhi varuval', 'chicken roast', 'country chicken fry', 'சிக்கன் வறுவல்', 'கோழி வறுவல்'],
    vr: [v('Deep fried, crispy', [420, 28, 18, 26, 0.8])],
  }),
  food('chilli-chicken', 'Chilli chicken', NV, '1 serving (150 g)', 150, [320, 25, 15, 18, 1.5], {
    tags: ['Fast Food', 'Protein Foods'], meals: [S, L, D], basis: 'restaurant', aka: ['chicken chilli', 'chilly chicken', 'chilli chicken dry', 'chilly chicken dry', 'சில்லி சிக்கன்'],
    vr: [v('Gravy', [350, 24, 20, 20, 1.8])], sv: [x('Half plate (75 g)', 0.5)],
  }),
  food('chicken-manchurian', 'Chicken manchurian', NV, '1 serving (150 g)', 150, [330, 23, 20, 18, 1.5], {
    tags: ['Fast Food', 'Protein Foods'], meals: [S, L, D], basis: 'restaurant', aka: ['manchurian chicken', 'chicken manchuria', 'சிக்கன் மஞ்சூரியன்'],
  }),
  food('gobi-manchurian', 'Gobi manchurian', FF, '1 serving (150 g)', 150, [290, 6, 32, 15, 3], {
    tags: ['Vegetarian', 'Street Food'], meals: [S, L], basis: 'restaurant', aka: ['gobi manchurian', 'cauliflower manchurian', 'veg manchurian', 'gobi manchuria', 'காலிஃபிளவர் மஞ்சூரியன்'],
    vr: [v('Gravy', [250, 6, 35, 10, 3])],
  }),
  food('chicken-nuggets', 'Chicken nuggets', FF, '6 pieces (100 g)', 100, [290, 16, 18, 17, 1], {
    tags: [NV, 'Snacks'], meals: [S, L, D], basis: 'restaurant', aka: ['nuggets', 'mcnuggets', 'popcorn chicken', 'chicken popcorn'], sv: [x('4 pieces', 0.67), x('10 pieces', 1.67)],
  }),
  food('fried-chicken', 'Fried chicken (crispy)', FF, '1 piece (110 g)', 110, [310, 22, 11, 20, 0.5], {
    tags: [NV, 'Protein Foods'], meals: [L, D], basis: 'restaurant', aka: ['kfc chicken', 'crispy chicken', 'fried chicken leg', 'broasted chicken', 'chicken bucket', 'ஃப்ரைடு சிக்கன்'],
    sv: [x('2 pieces', 2), x('3 pieces', 3)],
  }),
  food('shawarma', 'Chicken shawarma', FF, '1 roll (200 g)', 200, [430, 25, 40, 19, 3], {
    tags: [NV, 'Street Food'], meals: [L, D], basis: 'restaurant',
    aka: ['shawarma', 'shawarma roll', 'chicken shawarma roll', 'shwarma', 'shawerma', 'sharwarma', 'ஷவர்மா'],
    vr: [v('Plate (with rice / fries, 400 g)', [820, 40, 85, 36, 5]), v('Large roll with extra mayo', [560, 28, 44, 28, 3])],
  }),
  food('chicken-burger', 'Chicken burger', FF, '1 burger (180 g)', 180, [440, 22, 40, 20, 2.5], {
    tags: [NV], meals: [L, D], basis: 'restaurant', aka: ['burger', 'zinger burger', 'crispy chicken burger', 'chicken zinger', 'சிக்கன் பர்கர்'],
    vr: [v('Grilled', [380, 26, 38, 13, 2.5]), v('Double patty', [640, 38, 42, 33, 2.5])],
  }),
  food('veg-burger', 'Veg burger', FF, '1 burger (170 g)', 170, [380, 11, 52, 14, 4], {
    tags: ['Vegetarian'], meals: [L, D], basis: 'restaurant', aka: ['aloo tikki burger', 'vegetable burger', 'veggie burger', 'வெஜ் பர்கர்'],
  }),
  food('chicken-pizza', 'Chicken pizza', FF, '1 slice (110 g)', 110, [290, 14, 31, 12, 1.8], {
    tags: [NV], meals: [L, D], basis: 'restaurant', aka: ['pizza chicken', 'chicken tikka pizza', 'chicken pizza slice', 'pizza', 'சிக்கன் பீட்சா'],
    sv: [x('2 slices', 2), x('3 slices', 3), x('Medium pizza, 8 slices', 8)],
  }),
  food('veg-pizza', 'Veg / cheese pizza', FF, '1 slice (100 g)', 100, [265, 11, 33, 10, 2], {
    tags: ['Vegetarian'], meals: [L, D], basis: 'restaurant', aka: ['margherita pizza', 'cheese pizza', 'veg pizza', 'paneer pizza', 'pizza slice', 'வெஜ் பீட்சா'],
    sv: [x('2 slices', 2), x('3 slices', 3), x('Medium pizza, 8 slices', 8)],
  }),
  food('chicken-roll', 'Chicken roll (kathi roll)', FF, '1 roll (180 g)', 180, [410, 22, 42, 17, 2.5], {
    tags: [NV, 'Street Food'], meals: [L, D], basis: 'restaurant', aka: ['kathi roll', 'chicken kathi roll', 'frankie', 'chicken wrap', 'wrap', 'egg roll', 'சிக்கன் ரோல்'],
    vr: [v('Egg roll', [380, 15, 43, 16, 2.2]), v('Paneer roll', [430, 17, 42, 22, 3])],
  }),
  food('french-fries', 'French fries', FF, '1 medium serving (115 g)', 115, [365, 4, 48, 17, 4], {
    tags: ['Snacks', 'Vegetarian'], meals: [S, L, D], basis: 'restaurant', aka: ['fries', 'chips', 'potato fries', 'finger chips', 'peri peri fries', 'பிரெஞ்சு பிரைஸ்'],
    sv: [x('Small (70 g)', 0.6), x('Large (150 g)', 1.3)],
  }),
  food('sandwich', 'Vegetable sandwich', FF, '1 sandwich (150 g)', 150, [280, 8, 38, 11, 3.5], {
    tags: ['Snacks', 'Vegetarian'], meals: [B, S], basis: 'restaurant', aka: ['veg sandwich', 'sandwiches', 'grilled sandwich', 'bombay sandwich', 'veg grilled sandwich', 'சாண்ட்விச்'],
    vr: [v('Cheese grilled', [380, 14, 38, 18, 3]), v('Chicken sandwich', [360, 22, 36, 14, 2.5]), v('Egg sandwich', [330, 14, 36, 14, 2.5])],
  }),
  food('momos', 'Momos (steamed)', FF, '6 pieces (120 g)', 120, [210, 10, 30, 5.5, 1.5], {
    tags: ['Street Food', 'Snacks'], meals: [S, L, D], basis: 'restaurant', aka: ['momo', 'dumplings', 'dimsum', 'dim sum', 'steamed dumplings', 'மோமோஸ்'],
    sv: [x('4 pieces', 0.67), x('8 pieces', 1.33)],
    vr: [v('Chicken (steamed)', [240, 14, 28, 8, 1.2]), v('Veg (steamed)', [190, 6, 32, 4.5, 2.2]), v('Fried chicken momos', [340, 15, 30, 18, 1.2]), v('Paneer (steamed)', [250, 11, 29, 10, 1.5])],
  }),
  food('garlic-bread', 'Garlic bread', FF, '2 slices (60 g)', 60, [210, 5, 26, 9.5, 1.5], {
    tags: ['Snacks', 'Vegetarian'], meals: [S, D], basis: 'restaurant', aka: ['cheese garlic bread', 'garlic toast'], vr: [v('Cheese garlic bread', [270, 9, 26, 14, 1.5])],
  }),
  food('popcorn', 'Popcorn', 'Snacks', '1 medium tub (50 g)', 50, [230, 3.5, 28, 12, 4.5], {
    tags: ['Street Food', 'Vegetarian'], meals: [S], basis: 'restaurant', aka: ['pop corn', 'cinema popcorn', 'butter popcorn', 'caramel popcorn', 'பாப்கார்ன்'],
    vr: [v('Air-popped, plain (30 g)', [115, 3.5, 23, 1.4, 4.2]), v('Caramel (50 g)', [210, 2, 40, 5, 3])], sv: [x('1 small cup (25 g)', 0.5), x('1 large tub (100 g)', 2)],
  }),
]
