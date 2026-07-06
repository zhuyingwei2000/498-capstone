import { useEffect, useState, lazy, Suspense } from "react";
import { getPantryItems, addPantryItem, updatePantryItem, deletePantryItem } from "../api/client";
import { useAuth } from "../AuthContext";
import ReceiptScanner from "../components/ReceiptScanner";

const BarcodeScanner = lazy(() => import("../components/BarcodeScanner"));

const CATEGORIES = [
  "Vegetables", "Fruits", "Meat & Seafood", "Dairy & Eggs",
  "Grains & Bread", "Condiments & Spices", "Beverages", "Snacks", "Other",
];

const UNCATEGORIZED = "Uncategorized";

const EMPTY_FORM = { name: "", quantity: "1", expiry_date: "", category: "" };

function groupByCategory(items) {
  const groups = {};
  for (const item of items) {
    const key = item.category || UNCATEGORIZED;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
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
  const [showReceipt, setShowReceipt] = useState(false);

  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => { fetchItems(); }, []);

  async function fetchItems() {
    setLoading(true);
    setError("");
    try {
      setItems(await getPantryItems(token));
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
      await addPantryItem(token, {
        name: addForm.name.trim(),
        quantity: parseFloat(addForm.quantity) || 1,
        expiry_date: addForm.expiry_date || null,
        category: addForm.category || null,
      });
      setAddForm(EMPTY_FORM);
      setShowAdd(false);
      await fetchItems();
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
      await updatePantryItem(token, editId, {
        name: editForm.name.trim(),
        quantity: parseFloat(editForm.quantity) || 1,
        expiry_date: editForm.expiry_date || null,
        category: editForm.category || null,
      });
      setEditId(null);
      await fetchItems();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id) {
    await deletePantryItem(token, id);
    await fetchItems();
  }

  async function handleToggleExclude(item) {
    await updatePantryItem(token, item.id, {
      exclude_from_recipes: !item.exclude_from_recipes,
    });
    await fetchItems();
  }

  function handleScanResult(product) {
    setShowScanner(false);
    setAddForm({ ...EMPTY_FORM, name: product.name, category: product.category });
    setAddError("");
    setShowAdd(true);
  }

  async function handleReceiptDone() {
    setShowReceipt(false);
    await fetchItems();
  }

  const grouped = groupByCategory(items);

  return (
    <div className="pantry-page">
      {showScanner && (
        <Suspense fallback={null}>
          <BarcodeScanner onResult={handleScanResult} onClose={() => setShowScanner(false)} />
        </Suspense>
      )}

      {showReceipt && (
        <ReceiptScanner onDone={handleReceiptDone} onClose={() => setShowReceipt(false)} />
      )}

      <div className="pantry-header">
        <h2>My Pantry</h2>
        <div className="pantry-header-actions">
          <button className="btn-ghost" onClick={() => setShowReceipt(true)}>📄 Receipt</button>
          <button className="btn-ghost" onClick={() => setShowScanner(true)}>📷 Scan</button>
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
          <input
            type="number"
            min="0"
            step="any"
            placeholder="Quantity"
            value={addForm.quantity}
            onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
          />
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
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="Quantity"
                      value={editForm.quantity}
                      onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                    />
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
                <li key={item.id} className={`item-card${item.exclude_from_recipes ? " item-card--excluded" : ""}`}>
                  <div className="item-info">
                    <span className="item-name">{item.name}</span>
                    <span className="item-qty">{item.quantity}</span>
                    {item.expiry_date && (
                      <span className="item-expiry">Expires {item.expiry_date}</span>
                    )}
                    {item.exclude_from_recipes && (
                      <span className="item-excluded-tag">not matched to recipes</span>
                    )}
                  </div>
                  <div className="item-actions">
                    {item.exclude_from_recipes && (
                      <button
                        className="btn-exclude-toggle"
                        title="Include in recipe search"
                        onClick={() => handleToggleExclude(item)}
                      >
                        Include
                      </button>
                    )}
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
