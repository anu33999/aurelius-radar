/**
 * Target niches. `osm` lists OpenStreetMap tag selectors (key + regex of values) used for discovery;
 * `places` is the phrase sent to Google Places when a key is configured. `value` (0-40) is a rough
 * "budget potential" used in the opportunity score: how much a typical business in the niche can
 * afford to spend on marketing. These are planning heuristics, not market data.
 */
export interface Niche {
  id: string;
  label: string;
  group: "Hospitality" | "Lifestyle & personal care" | "High-ticket services" | "Retail & D2C" | "Industry & manufacturing";
  osm: { key: string; values: string }[];
  places: string;
  value: number;
}

export const NICHES: Niche[] = [
  // Hospitality
  { id: "cafe", label: "Cafes & coffee", group: "Hospitality", osm: [{ key: "amenity", values: "cafe" }], places: "specialty cafes", value: 20 },
  { id: "bakery", label: "Bakeries", group: "Hospitality", osm: [{ key: "shop", values: "bakery|pastry|confectionery" }], places: "bakeries", value: 18 },
  { id: "restaurant", label: "Restaurants & fine dining", group: "Hospitality", osm: [{ key: "amenity", values: "restaurant" }], places: "fine dining restaurants", value: 26 },
  { id: "bar", label: "Bars & rooftops", group: "Hospitality", osm: [{ key: "amenity", values: "bar|pub|biergarten" }], places: "rooftop bars", value: 24 },
  // Lifestyle & personal care
  { id: "salon", label: "Premium salons", group: "Lifestyle & personal care", osm: [{ key: "shop", values: "hairdresser|beauty" }], places: "premium hair salons", value: 24 },
  { id: "medspa", label: "Med-spas & aesthetics clinics", group: "Lifestyle & personal care", osm: [{ key: "healthcare:speciality", values: "dermatology|aesthetic|plastic_surgery|cosmetic" }, { key: "shop", values: "beauty" }], places: "med spa aesthetics clinic", value: 34 },
  { id: "boutique", label: "Boutiques & designer fashion", group: "Lifestyle & personal care", osm: [{ key: "shop", values: "boutique|clothes|fashion|shoes|bag" }], places: "designer boutiques", value: 22 },
  { id: "fitness", label: "Fitness studios & gyms", group: "Lifestyle & personal care", osm: [{ key: "leisure", values: "fitness_centre|sports_centre" }], places: "boutique fitness studios", value: 22 },
  // High-ticket services
  { id: "dental", label: "Dental & implant clinics", group: "High-ticket services", osm: [{ key: "amenity", values: "dentist" }, { key: "healthcare", values: "dentist" }], places: "dental implant clinics", value: 38 },
  { id: "clinic", label: "Private clinics", group: "High-ticket services", osm: [{ key: "amenity", values: "clinic|doctors" }], places: "private clinics", value: 30 },
  { id: "realestate", label: "Real estate developers & agents", group: "High-ticket services", osm: [{ key: "office", values: "estate_agent|property_management" }], places: "luxury real estate developers", value: 40 },
  { id: "architecture", label: "Architecture firms", group: "High-ticket services", osm: [{ key: "office", values: "architect" }], places: "architecture firms", value: 30 },
  { id: "interior", label: "Interior designers", group: "High-ticket services", osm: [{ key: "shop", values: "interior_decoration" }, { key: "craft", values: "interior_decorator|interior_designer" }, { key: "office", values: "interior_designer" }], places: "interior design studios", value: 28 },
  // Retail & D2C
  { id: "jewelry", label: "Jewelry stores", group: "Retail & D2C", osm: [{ key: "shop", values: "jewelry|jewellery|watches" }], places: "jewelry stores", value: 30 },
  { id: "furniture", label: "Furniture showrooms", group: "Retail & D2C", osm: [{ key: "shop", values: "furniture|bed|kitchen|lighting" }], places: "furniture showrooms", value: 26 },
  // Industry & manufacturing
  { id: "factory", label: "Factories & manufacturers", group: "Industry & manufacturing", osm: [{ key: "man_made", values: "works" }, { key: "industrial", values: ".+" }, { key: "building", values: "factory|manufacture|industrial" }], places: "manufacturing companies factories", value: 36 },
  { id: "industrial_supply", label: "Industrial suppliers & wholesalers", group: "Industry & manufacturing", osm: [{ key: "shop", values: "wholesale|trade|industrial|machinery" }, { key: "craft", values: "metal_construction|welder|electronics_repair|machinery" }], places: "industrial suppliers wholesalers", value: 32 },
];

export const NICHE_GROUPS = [...new Set(NICHES.map((n) => n.group))];
export const nicheById = (id: string | undefined | null) => NICHES.find((n) => n.id === id) ?? null;
