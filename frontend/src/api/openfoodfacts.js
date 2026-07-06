const OFF_BASE = "https://world.openfoodfacts.org/api/v2/product";

// Maps Open Food Facts category tags to our fixed category list.
function mapCategory(tags) {
  const s = tags.join(" ").toLowerCase();
  if (s.includes("vegetable")) return "Vegetables";
  if (s.includes("fruit")) return "Fruits";
  if (s.includes("meat") || s.includes("seafood") || s.includes("fish") || s.includes("poultry"))
    return "Meat & Seafood";
  if (s.includes("dairy") || s.includes("milk") || s.includes("cheese") || s.includes("egg"))
    return "Dairy & Eggs";
  if (
    s.includes("grain") || s.includes("bread") || s.includes("cereal") ||
    s.includes("pasta") || s.includes("rice") || s.includes("flour")
  )
    return "Grains & Bread";
  if (
    s.includes("sauce") || s.includes("spice") || s.includes("condiment") ||
    s.includes("oil") || s.includes("vinegar") || s.includes("seasoning")
  )
    return "Condiments & Spices";
  if (
    s.includes("beverage") || s.includes("drink") || s.includes("juice") ||
    s.includes("water") || s.includes("soda") || s.includes("coffee") || s.includes("tea")
  )
    return "Beverages";
  if (s.includes("snack") || s.includes("chip") || s.includes("cookie") || s.includes("biscuit"))
    return "Snacks";
  return "Other";
}

// Looks up a barcode on Open Food Facts.
// Returns { name, category } on success; throws an Error on failure.
export async function lookupBarcode(barcode) {
  const res = await fetch(`${OFF_BASE}/${barcode}.json`);
  if (!res.ok) throw new Error("Network error looking up barcode");

  const data = await res.json();
  if (data.status !== 1) throw new Error("Product not found in Open Food Facts database");

  const p = data.product;
  const name =
    p.product_name_en ||
    p.product_name ||
    p.abbreviated_product_name ||
    "";

  if (!name) throw new Error("Product found but has no name — enter it manually");

  return {
    name: name.trim(),
    category: mapCategory(p.categories_tags || []),
  };
}
