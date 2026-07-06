import { useEffect, useState, lazy, Suspense } from "react";
import { getPantryItems, addPantryItem, updatePantryItem, deletePantryItem } from "../api/client";
import { useAuth } from "../AuthContext";

// Lazy-load the scanner so html5-qrcode is only downloaded when the user clicks Scan.
const BarcodeScanner = lazy(() => import("../components/BarcodeScanner"));

const UNITS = ["pcs", "g", "kg", "ml", "L", "oz", "lb", "cups", "tbsp", "tsp"];

const CATEGORIES = [
  "Vegetables",
  "Fruits",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Grains & Bread",
  "Condiments & Spices",
  "Beverages",
  "Snacks",
  "Other",
];

// Items with no category fall into this bucket for display purposes.
const UNCATEGORIZED = "Uncategorized";

const EMPTY_FORM = { name: "", quantity: "1", unit: "pcs", expiry_date: "", category: "" };

// Group a flat array of items into { category: [items] }, preserving CATEGORIES order.
function groupByCategory(items) {
  const groups = {};
  for (const item of items) {
    const key = item.category || UNCATEGORIZED;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  // Sort groups: known categories first (in defined order), then Uncategorized last.
  const order = [...CATEGORIES, UNCATEGORIZED];
  return Object.entries(groups).sort(
    ([a], [b]) => order.indexOf(a) - order.indexOf(b)
  );
}

export default function Pantry() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [addError, setAddError] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  const [showScanner, setShowScanner] = useState(false);

  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    setLoading(true);
    setError("");
    try {
      const data = await getPantryItems(token);
      setItems(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    setAddError("");
    setAddSaving(true);
    try {
      const newItem = await addPantryItem(token, {
        name: addForm.name.trim(),
        quantity: parseFloat(addForm.quantity) || 1,
        unit: addForm.unit,
        expiry_date: addForm.expiry_date || null,
        category: addForm.category || null,
      });
      setItems((prev) => [...prev, newItem].sort((a, b) => a.name.localeCompare(b.name)));
      setAddForm(EMPTY_FORM);
      setShowAdd(false);
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAddSaving(false);
    }
  }

  function startEdit(item) {
    setEditId(item.id);
    setEditForm({
      name: item.name,
      quantity: String(item.quantity),
      unit: item.unit,
      expiry_date: item.expiry_date || "",
      category: item.category || "",
    });
    setEditError("");
  }

  async function handleEdit(e) {
    e.preventDefault();
    setEditError("");
    setEditSaving(true);
    try {
      const updated = await updatePantryItem(token, editId, {
        name: editForm.name.trim(),
        quantity: parseFloat(editForm.quantity) || 1,
        unit: editForm.unit,
        expiry_date: editForm.expiry_date || null,
        category: editForm.category || null,
      });
      setItems((prev) =>
        prev.map((i) => (i.id === editId ? updated : i)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditId(null);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id) {
    await deletePantryItem(token, id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function handleScanResult(product) {
    setShowScanner(false);
    // Pre-fill the add form with scanned product data; user still sets quantity.
    setAddForm({ ...EMPTY_FORM, name: product.name, category: product.category });
    setAddError("");
    setShowAdd(true);
  }

  const grouped = groupByCategory(items);

  return (
    <div className="pantry-page">
      {showScanner && (
        <Suspense fallback={null}>
          <BarcodeScanner
            onResult={handleScanResult}
            onClose={() => setShowScanner(false)}
          />
        </Suspense>
      )}

      <div className="pantry-header">
        <h2>My Pantry</h2>
        <div className="pantry-header-actions">
          <button className="btn-ghost" onClick={() => setShowScanner(true)}>
            📷 Scan
          </button>
          <button className="btn-primary" onClick={() => { setShowAdd(true); setAddError(""); }}>
            + Add Item
          </button>
        </div>
      </div>

      {showAdd && (
        <form className="item-form" onSubmit={handleAdd}>
          <h3>New Item</h3>
          {addError && <p className="form-error">{addError}</p>}
          <input
            placeholder="Name (e.g. Eggs)"
            value={addForm.name}
            onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
            required
          />
          <div className="qty-row">
            <input
              type="number"
              min="0"
              step="any"
              placeholder="Qty"
              value={addForm.quantity}
              onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
            />
            <select
              value={addForm.unit}
              onChange={(e) => setAddForm({ ...addForm, unit: e.target.value })}
            >
              {UNITS.map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
          <select
            value={addForm.category}
            onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
          >
            <option value="">Category (optional)</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <label className="expiry-label">
            Expiry date (optional)
            <input
              type="text"
              placeholder="YYYY-MM-DD"
              value={addForm.expiry_date}
              onChange={(e) => setAddForm({ ...addForm, expiry_date: e.target.value })}
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={addSaving}>
              {addSaving ? "Saving..." : "Save"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setShowAdd(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading && <p className="status-msg">Loading...</p>}
      {error && <p className="form-error">{error}</p>}

      {!loading && items.length === 0 && !showAdd && (
        <p className="status-msg">Your pantry is empty. Add your first item!</p>
      )}

      {grouped.map(([category, categoryItems]) => (
        <section key={category} className="category-section">
          <h3 className="category-title">{category}</h3>
          <ul className="item-list">
            {categoryItems.map((item) =>
              editId === item.id ? (
                <li key={item.id} className="item-card item-card--editing">
                  <form onSubmit={handleEdit}>
                    {editError && <p className="form-error">{editError}</p>}
                    <input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      required
                    />
                    <div className="qty-row">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={editForm.quantity}
                        onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                      />
                      <select
                        value={editForm.unit}
                        onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                      >
                        {UNITS.map((u) => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                    <select
                      value={editForm.category}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    >
                      <option value="">Category (optional)</option>
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                    <label className="expiry-label">
                      Expiry date
                      <input
                        type="text"
                        placeholder="YYYY-MM-DD"
                        value={editForm.expiry_date}
                        onChange={(e) => setEditForm({ ...editForm, expiry_date: e.target.value })}
                      />
                    </label>
                    <div className="form-actions">
                      <button type="submit" className="btn-primary" disabled={editSaving}>
                        {editSaving ? "Saving..." : "Save"}
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => setEditId(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                </li>
              ) : (
                <li key={item.id} className="item-card">
                  <div className="item-info">
                    <span className="item-name">{item.name}</span>
                    <span className="item-qty">{item.quantity} {item.unit}</span>
                    {item.expiry_date && (
                      <span className="item-expiry">Expires {item.expiry_date}</span>
                    )}
                  </div>
                  <div className="item-actions">
                    <button className="btn-ghost" onClick={() => startEdit(item)}>Edit</button>
                    <button className="btn-danger" onClick={() => handleDelete(item.id)}>Delete</button>
                  </div>
                </li>
              )
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
