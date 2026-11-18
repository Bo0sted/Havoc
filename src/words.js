// Words for ?hangman: common, friendly singular nouns of 5 to 8 plain
// letters. The category is shown as the hint, so keep each one broad
// enough not to give the word away but specific enough to narrow it.
export const CATEGORIES = {
  'Animal': [
    'anchovy', 'antelope', 'baboon', 'badger', 'beagle', 'beetle', 'beluga', 'bison', 'bobcat', 'buffalo',
    'bulldog', 'bunny', 'camel', 'canary', 'caribou', 'catfish', 'cheetah', 'chick', 'chicken', 'chipmunk',
    'cobra', 'collie', 'condor', 'coyote', 'crane', 'cricket', 'cuckoo', 'dolphin', 'donkey', 'duckling',
    'eagle', 'elephant', 'falcon', 'ferret', 'firefly', 'flamingo', 'gazelle', 'gecko', 'gerbil', 'giraffe',
    'goldfish', 'goose', 'gopher', 'gorilla', 'hamster', 'hedgehog', 'heron', 'hippo', 'hornet', 'horse',
    'hound', 'husky', 'hyena', 'iguana', 'insect', 'jaguar', 'kangaroo', 'kitten', 'koala', 'ladybug', 'lemur',
    'leopard', 'lizard', 'llama', 'lobster', 'magpie', 'mammoth', 'manatee', 'meerkat', 'minnow', 'monkey',
    'moose', 'mouse', 'narwhal', 'octopus', 'ostrich', 'otter', 'oyster', 'panda', 'panther', 'parakeet',
    'parrot', 'peacock', 'pelican', 'penguin', 'pigeon', 'piglet', 'piranha', 'platypus', 'poodle', 'puffin',
    'puppy', 'python', 'quail', 'rabbit', 'raccoon', 'raven', 'reindeer', 'rhino', 'robin', 'rooster', 'salmon',
    'sardine', 'scorpion', 'seagull', 'seahorse', 'shark', 'sheep', 'shrimp', 'skunk', 'sloth', 'snail',
    'snake', 'sparrow', 'spider', 'squid', 'squirrel', 'starfish', 'stingray', 'stork', 'tadpole', 'termite',
    'terrier', 'tiger', 'toucan', 'trout', 'turtle', 'viper', 'vulture', 'walrus', 'warthog', 'weasel', 'whale',
    'wombat', 'zebra',
  ],
  'Food & drink': [
    'almond', 'apple', 'apricot', 'avocado', 'bacon', 'bagel', 'baguette', 'banana', 'basil', 'berry',
    'biscuit', 'bread', 'broccoli', 'brownie', 'burger', 'burrito', 'butter', 'cabbage', 'candy', 'caramel',
    'carrot', 'cashew', 'celery', 'cereal', 'cheddar', 'cheese', 'cherry', 'chestnut', 'cinnamon', 'cocoa',
    'coconut', 'coffee', 'cookie', 'cracker', 'cream', 'crepe', 'cucumber', 'cupcake', 'curry', 'custard',
    'donut', 'dumpling', 'eggplant', 'flour', 'frosting', 'fudge', 'garlic', 'gelato', 'ginger', 'granola',
    'grape', 'gravy', 'guava', 'gumdrop', 'hazelnut', 'honey', 'honeydew', 'hotdog', 'icing', 'jelly', 'juice',
    'kebab', 'ketchup', 'lasagna', 'lemon', 'lemonade', 'lettuce', 'licorice', 'lollipop', 'mango', 'meatball',
    'melon', 'muffin', 'mushroom', 'mustard', 'nacho', 'noodle', 'nugget', 'oatmeal', 'olive', 'omelet',
    'onion', 'orange', 'oregano', 'pancake', 'papaya', 'parsley', 'parsnip', 'pasta', 'pastry', 'peach',
    'peanut', 'pepper', 'pickle', 'pizza', 'popcorn', 'popsicle', 'porridge', 'potato', 'pretzel', 'pudding',
    'pumpkin', 'radish', 'raisin', 'ramen', 'relish', 'salad', 'salsa', 'sandwich', 'sauce', 'sausage', 'scone',
    'sesame', 'smoothie', 'sorbet', 'spice', 'spinach', 'sprinkle', 'squash', 'steak', 'sugar', 'sundae',
    'sushi', 'syrup', 'teabag', 'toast', 'toffee', 'tomato', 'tortilla', 'turnip', 'vanilla', 'wafer', 'waffle',
    'walnut', 'water', 'yogurt', 'zucchini',
  ],
  'Around the house': [
    'lantern', 'alarm', 'armchair', 'attic', 'balcony', 'basket', 'bathtub', 'bedroom', 'bench', 'blanket', 'blender',
    'bookcase', 'bottle', 'broom', 'brush', 'bubble', 'bucket', 'cabinet', 'candle', 'carpet', 'ceiling',
    'cellar', 'chair', 'chimney', 'clock', 'closet', 'couch', 'cupboard', 'curtain', 'cushion', 'doorbell',
    'doormat', 'drawer', 'dresser', 'dryer', 'dustpan', 'faucet', 'fence', 'floor', 'frame', 'freezer',
    'fridge', 'furnace', 'garage', 'garbage', 'garden', 'gutter', 'hallway', 'hanger', 'heater', 'hinge',
    'kettle', 'kitchen', 'knife', 'laundry', 'lipstick', 'lotion', 'lunchbox', 'mailbox', 'makeup', 'mattress',
    'mirror', 'napkin', 'pantry', 'perfume', 'pillow', 'plate', 'plunger', 'porch', 'razor', 'recliner',
    'saucer', 'shampoo', 'shelf', 'shower', 'sponge', 'spoon', 'stool', 'stove', 'table', 'teacup', 'teapot',
    'toaster', 'toilet', 'towel', 'trashcan', 'vacuum', 'wardrobe', 'washer', 'window',
  ],
  'Clothing & accessories': [
    'apron', 'backpack', 'bathrobe', 'blouse', 'bracelet', 'buckle', 'button', 'costume', 'dress', 'earring',
    'glove', 'handbag', 'helmet', 'hoodie', 'jacket', 'keychain', 'mitten', 'necklace', 'pocket', 'purse',
    'sandal', 'scarf', 'sequin', 'shirt', 'skirt', 'slipper', 'sneaker', 'sweater', 'umbrella', 'uniform',
    'wallet', 'watch', 'zipper',
  ],
  'Tools': [
    'anvil', 'chisel', 'clamp', 'crowbar', 'drill', 'hacksaw', 'hammer', 'ladder', 'mallet', 'needle',
    'padlock', 'pickaxe', 'pliers', 'shovel', 'spade', 'thread', 'toolbelt', 'toolbox', 'trowel', 'wrench',
  ],
  'Plants & flowers': [
    'acorn', 'bamboo', 'blossom', 'branch', 'cactus', 'cedar', 'clover', 'daffodil', 'daisy', 'flower', 'grass',
    'lilac', 'maple', 'orchid', 'petal', 'pinecone', 'poppy', 'sapling', 'seaweed', 'seedling', 'stump',
    'thistle', 'tulip', 'violet', 'willow',
  ],
  'Landscapes': [
    'beach', 'boulder', 'canyon', 'cliff', 'coral', 'crater', 'creek', 'crystal', 'desert', 'forest', 'geyser',
    'glacier', 'island', 'jungle', 'lagoon', 'marsh', 'meadow', 'mountain', 'oasis', 'ocean', 'pebble',
    'plateau', 'prairie', 'ridge', 'river', 'shell', 'stone', 'stream', 'summit', 'swamp', 'valley', 'volcano',
  ],
  'Weather & seasons': [
    'autumn', 'blizzard', 'breeze', 'climate', 'cloud', 'cyclone', 'drizzle', 'frost', 'icicle', 'monsoon',
    'puddle', 'rainbow', 'raindrop', 'rainfall', 'season', 'sleet', 'snowball', 'snowfall', 'snowman', 'spring',
    'storm', 'summer', 'sunshine', 'thunder', 'tornado', 'typhoon', 'weather', 'winter',
  ],
  'Space & sky': [
    'asteroid', 'comet', 'earth', 'eclipse', 'galaxy', 'horizon', 'meteor', 'moonbeam', 'nebula', 'orbit',
    'planet', 'shadow', 'sunbeam', 'sunlight', 'sunrise', 'sunset', 'twilight',
  ],
  'Vehicles & travel': [
    'airplane', 'airport', 'anchor', 'balloon', 'bicycle', 'bridge', 'canoe', 'carriage', 'chariot', 'compass',
    'cruise', 'engine', 'ferry', 'glider', 'gondola', 'harbor', 'highway', 'hotel', 'jetpack', 'kayak',
    'luggage', 'minivan', 'motel', 'paddle', 'passport', 'plane', 'platform', 'postcard', 'railroad', 'rocket',
    'runway', 'sailboat', 'scooter', 'sidewalk', 'souvenir', 'station', 'subway', 'suitcase', 'terminal',
    'ticket', 'tractor', 'traffic', 'trailer', 'train', 'truck', 'tunnel', 'wagon', 'wheel', 'yacht',
  ],
  'Places & buildings': [
    'alley', 'avenue', 'bakery', 'cabin', 'castle', 'cinema', 'corner', 'cottage', 'country', 'fountain',
    'grocery', 'hospital', 'igloo', 'library', 'market', 'museum', 'nation', 'palace', 'pharmacy', 'street',
    'theater', 'tower', 'village', 'world',
  ],
  'School & office': [
    'binder', 'chalk', 'crayon', 'diploma', 'envelope', 'eraser', 'folder', 'geometry', 'globe', 'grammar',
    'history', 'homework', 'lecture', 'lesson', 'letter', 'locker', 'marker', 'notebook', 'package', 'paper',
    'pencil', 'poetry', 'project', 'recess', 'ruler', 'school', 'science', 'spelling', 'stamp', 'stapler',
    'student', 'teacher',
  ],
  'Music': [
    'banjo', 'cello', 'concert', 'dance', 'flute', 'guitar', 'melody', 'music', 'piano', 'rhythm', 'trumpet',
    'ukulele', 'violin', 'whistle',
  ],
  'Technology': [
    'battery', 'cable', 'camera', 'charger', 'computer', 'console', 'gadget', 'headset', 'joystick', 'keyboard',
    'laptop', 'laser', 'magnet', 'monitor', 'phone', 'printer', 'radio', 'remote', 'robot', 'screen', 'speaker',
    'tablet', 'webcam',
  ],
  'People & jobs': [
    'acrobat', 'actor', 'actress', 'artist', 'athlete', 'author', 'baker', 'banker', 'barber', 'boxer',
    'builder', 'butcher', 'butler', 'captain', 'cashier', 'clown', 'coach', 'comedian', 'cowboy', 'dancer',
    'dentist', 'doctor', 'driver', 'explorer', 'farmer', 'florist', 'gardener', 'hunter', 'janitor', 'jeweler',
    'judge', 'juggler', 'lawyer', 'magician', 'mayor', 'mechanic', 'miner', 'ninja', 'nurse', 'painter',
    'pilot', 'pirate', 'player', 'plumber', 'ranger', 'referee', 'runner', 'sailor', 'samurai', 'sculptor',
    'sheriff', 'singer', 'skater', 'surfer', 'swimmer', 'tailor', 'viking', 'waiter', 'writer',
  ],
  'Family & friends': [
    'adult', 'brother', 'cousin', 'friend', 'grandma', 'grandpa', 'husband', 'infant', 'neighbor', 'nephew',
    'niece', 'parent', 'sister', 'teenager', 'toddler', 'uncle',
  ],
  'Fantasy & legends': [
    'alien', 'cyborg', 'dragon', 'fairy', 'ghost', 'giant', 'goblin', 'magic', 'mermaid', 'monster', 'troll',
    'unicorn', 'wizard', 'zombie',
  ],
  'Castles & knights': [
    'armor', 'arrow', 'cannon', 'emperor', 'empire', 'kingdom', 'knight', 'prince', 'princess', 'queen',
    'scepter', 'shield', 'sword', 'throne', 'tiara',
  ],
  'Body part': [
    'ankle', 'beard', 'belly', 'brain', 'cheek', 'dimple', 'earlobe', 'elbow', 'eyebrow', 'eyelash', 'eyelid',
    'finger', 'forehead', 'freckle', 'heart', 'kidney', 'kneecap', 'knuckle', 'liver', 'mouth', 'muscle',
    'mustache', 'nostril', 'ribcage', 'shoulder', 'skeleton', 'spine', 'stomach', 'throat', 'thumb', 'tongue',
    'tooth', 'wrist',
  ],
  'Sports': [
    'archery', 'badge', 'baseball', 'bowling', 'boxing', 'bullseye', 'champion', 'football', 'goalie', 'hockey',
    'hurdle', 'javelin', 'jersey', 'karate', 'kickball', 'marathon', 'medal', 'racket', 'relay', 'rugby',
    'score', 'skipping', 'soccer', 'softball', 'stadium', 'tennis', 'trophy', 'umpire', 'wicket',
  ],
  'Toys & games': [
    'bingo', 'domino', 'frisbee', 'jackpot', 'jigsaw', 'lottery', 'marble', 'poker', 'puppet', 'puzzle',
    'raffle', 'sandbox', 'seesaw', 'slide', 'sticker', 'swing',
  ],
  'Treasure & materials': [
    'brick', 'concrete', 'copper', 'cotton', 'diamond', 'dollar', 'emerald', 'glass', 'jewel', 'leather',
    'metal', 'money', 'nickel', 'pearl', 'penny', 'plastic', 'rubber', 'silver', 'treasure',
  ],
  'Art & entertainment': [
    'album', 'cartoon', 'comic', 'diary', 'drawing', 'headline', 'journal', 'magazine', 'movie', 'mystery',
    'novel', 'painting', 'photo', 'picture', 'poster', 'pottery', 'quilt', 'sketch', 'statue', 'story',
  ],
  'Celebrations': [
    'banner', 'birthday', 'campfire', 'carnival', 'circus', 'confetti', 'festival', 'glitter', 'holiday',
    'ornament', 'parade', 'party', 'picnic', 'present', 'ribbon', 'sparkle', 'wreath',
  ],
  'Time & events': [
    'bedtime', 'calendar', 'century', 'deadline', 'decade', 'evening', 'future', 'journey', 'meeting',
    'midnight', 'minute', 'moment', 'morning', 'reunion', 'schedule', 'today', 'tomorrow', 'vacation', 'voyage',
    'wedding', 'weekend',
  ],
  'Math & language': [
    'alphabet', 'answer', 'circle', 'color', 'number', 'question', 'riddle', 'sentence', 'shape', 'square',
    'triangle',
  ],
};

// Every word with its category, for picking one at random.
export const WORDS = Object.entries(CATEGORIES).flatMap(([category, words]) => words.map((word) => ({ word, category })));
