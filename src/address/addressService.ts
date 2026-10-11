import citiesData from "./cities.json";
import provincesData from "./provinces.json";
import regionsData from "./regions.json";

export type Region = { code: string; name: string };
export type Province = { code: string; name: string; regionCode: string };
export type City = { code: string; name: string; regionCode: string; provinceCode: string };
export type Barangay = { code: string; name: string; cityCode: string };

export const regions = [...(regionsData as Region[])].sort((a, b) => a.name.localeCompare(b.name));
export const provinces = [...(provincesData as Province[])].sort((a, b) => a.name.localeCompare(b.name));
export const cities = [...(citiesData as City[])].sort((a, b) => a.name.localeCompare(b.name));

let barangayIndex: Barangay[] | null = null;
let pendingIndex: Promise<Barangay[]> | null = null;

async function loadBarangays() {
  if (barangayIndex) return barangayIndex;
  if (!pendingIndex) pendingIndex = (async () => {
    const response = await fetch(new URL("./barangay-search-index.json", import.meta.url));
    if (!response.ok) throw new Error("Unable to load barangay reference data.");
    barangayIndex = await response.json() as Barangay[];
    return barangayIndex;
  })().catch((error) => { pendingIndex = null; throw error; });
  return pendingIndex;
}

export async function searchBarangays(query: string, cityCode?: string) {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return [];
  return (await loadBarangays()).filter((item) => (!cityCode || item.cityCode === cityCode) && item.name.toLocaleLowerCase().includes(term))
    .sort((a, b) => Number(b.name.toLocaleLowerCase().startsWith(term)) - Number(a.name.toLocaleLowerCase().startsWith(term)) || a.name.localeCompare(b.name))
    .slice(0, 20);
}

export function provincesForRegion(regionCode: string) {
  return provinces.filter((province) => province.regionCode === regionCode);
}

export function citiesForProvince(provinceCode: string) {
  return cities.filter((city) => city.provinceCode === provinceCode);
}

export async function barangaysForCity(cityCode: string) {
  return (await loadBarangays()).filter((barangay) => barangay.cityCode === cityCode);
}

export async function addressValidationError(value: { province: string | null; city_municipality: string | null; barangay: string | null }) {
  const normalize = (name: string | null) => (name ?? "").trim().toLowerCase().replace(/^city of\s+/, "").replace(/\s+city$/, "");
  const province = provinces.find((item) => normalize(item.name) === normalize(value.province));
  if (value.province && !province) return "Choose a province from the official list.";
  const city = cities.find((item) => normalize(item.name) === normalize(value.city_municipality) && (province ? item.provinceCode === province.code : !item.provinceCode));
  if (value.city_municipality && !city) return "Choose a city and its matching province from the official list.";
  if (value.barangay) {
    if (!city) return "Choose the barangay's city and province from the official list.";
    const barangays = await barangaysForCity(city.code);
    if (!barangays.some((item) => normalize(item.name) === normalize(value.barangay))) return "Choose a barangay within the selected city or municipality.";
  }
  return null;
}
