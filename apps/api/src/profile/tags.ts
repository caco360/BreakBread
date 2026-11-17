// The only food tags a profile may contain. Users tap these in the app; they
// never type their own. Fixed lists matter because matching compares two
// people's tags: "japanese" must be the exact same text for both of them.
//
// "as const" tells TypeScript these are these exact words, not just "some
// strings", so a typo elsewhere in the code becomes a compile error.
//
// To add a tag, add it here. Removing or renaming one needs more care,
// because saved profiles may already contain it.

export const CUISINES = [
  "lebanese",
  "italian",
  "japanese",
  "chinese",
  "indian",
  "mexican",
  "korean",
  "thai",
  "vietnamese",
  "greek",
  "french",
  "fast_food",
  "pizza",
  "burgers",
  "sushi",
  "sandwiches",
  "salads",
  "breakfast",
  "desserts",
  "coffee",
] as const;

export const DIETARY = [
  "vegetarian",
  "vegan",
  "halal",
  "kosher",
  "gluten_free",
  "dairy_free",
  "nut_allergy",
] as const;
