import { useEffect, useState, lazy, Suspense } from "react";
import { getPantryItems, addPantryItem, updatePantryItem, deletePantryItem } from "../api/client";
import { useAuth } from "../AuthContext";
import ReceiptScanner from "../components/ReceiptScanner";
import FoodPhotoScanner from "../components/FoodPhotoScanner";

const BarcodeScanner = lazy(() => import("../components/BarcodeScanner"));

const CATEGORIES = [
  "Vegetables", "Fruits", "Meat & Seafood", "Dairy & Eggs",
  "Grains & Bread", "Condiments & Spices", "Beverages", "Snacks", "Other",
];

const UNCATEGORIZED = "Uncategorized";

const CATEGORY_EMOJI = {
  "Vegetables": "🥦", "Fruits": "🍎", "Meat & Seafood": "🥩",
  "Dairy & Eggs": "🥚", "Grains & Bread": "🌾", "Condiments & Spices": "🧂",
  "Beverages": "🧃", "Snacks": "🍪", "Other": "📦", "Uncategorized": "❓",
};

function getExpiryStatus(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const expiry = new Date(dateStr);
  const diff = Math.floor((expiry - today) / 86400000);
  if (diff < 0)  return { status: "expired",  days: Math.abs(diff) };
  if (diff <= 3) return { status: "expiring", days: diff };
  return null;
}

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
  const [showPhotoScan, setShowPhotoScan] = useState(false);
  const [search, setSearch] = useState("");

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

  async function handlePhotoScanDone() {
    setShowPhotoScan(false);
    await fetchItems();
  }

  // Expiry alerts
  const expiredItems  = items.filter(i => i.expiry_date && getExpiryStatus(i.expiry_date)?.status === "expired");
  const expiringItems = items.filter(i => i.expiry_date && getExpiryStatus(i.expiry_date)?.status === "expiring");

  // Search filter
  const filteredItems = search.trim()
    ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : items;
  const grouped = groupByCategory(filteredItems);

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

      {showPhotoScan && (
        <FoodPhotoScanner onDone={handlePhotoScanDone} onClose={() => setShowPhotoScan(false)} />
      )}

      <div className="pantry-header">
        <h2>My Pantry</h2>
        <div className="pantry-header-actions">
          <button className="btn-ghost" onClick={() => setShowReceipt(true)}>📄 Receipt</button>
          <button className="btn-ghost" onClick={() => setShowScanner(true)}>📷 Scan</button>
          <button className="btn-ghost" onClick={() => setShowPhotoScan(true)}>🍱 Photo</button>
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

      {/* Expiry banners */}
      {!loading && expiredItems.length > 0 && (
        <div className="expiry-banner expiry-banner--danger">
          <span className="expiry-banner-icon">🚨</span>
          <span className="expiry-banner-text">
            <strong>{expiredItems.length} item{expiredItems.length > 1 ? "s" : ""} expired:</strong>{" "}
            {expiredItems.map(i => i.name).join(", ")}
          </span>
        </div>
      )}
      {!loading && expiringItems.length > 0 && (
        <div className="expiry-banner expiry-banner--warning">
          <span className="expiry-banner-icon">⏰</span>
          <span className="expiry-banner-text">
            <strong>{expiringItems.length} item{expiringItems.length > 1 ? "s" : ""} expiring soon:</strong>{" "}
            {expiringItems.map(i => i.name).join(", ")}
          </span>
        </div>
      )}

      {/* Search bar */}
      {!loading && items.length > 0 && (
        <div className="pantry-search">
          <span className="pantry-search-icon">🔍</span>
          <input
            placeholder="Search ingredients…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3, 4].map(i => (
            <div className="skeleton-card" key={i}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <div className={`skeleton skeleton-line skeleton-line--${i % 2 === 0 ? "mid" : "long"}`} />
                <div className="skeleton skeleton-line skeleton-line--short" />
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p className="form-error">{error}</p>}

      {!loading && items.length === 0 && !showAdd && (
        <div className="empty-state">
          <span className="empty-state-icon">🧺</span>
          <p className="empty-state-title">Your pantry is empty</p>
          <p className="empty-state-desc">Add your first ingredient to get started!</p>
          <div className="empty-state-actions">
            <button className="empty-action-btn" onClick={() => setShowScanner(true)}>
              📷 Scan Barcode
            </button>
            <button className="empty-action-btn" onClick={() => setShowReceipt(true)}>
              📄 Upload Receipt
            </button>
            <button className="empty-action-btn" onClick={() => setShowPhotoScan(true)}>
              🍱 Photo Scan
            </button>
            <button className="empty-action-btn" onClick={() => { setShowAdd(true); setAddError(""); }}>
              ✏️ Add Manually
            </button>
          </div>
        </div>
      )}

      {!loading && items.length > 0 && filteredItems.length === 0 && (
        <div className="empty-state">
          <span className="empty-state-icon">🔍</span>
          <p className="empty-state-title">No items match "{search}"</p>
          <p className="empty-state-desc">Try a different search term</p>
        </div>
      )}

      {grouped.map(([category, categoryItems]) => (
        <section key={category} className="category-section">
          <h3 className="category-title">
            <span className="category-title-emoji">{CATEGORY_EMOJI[category] ?? "📦"}</span>
            {category}
          </h3>
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
                <PantryItemCard
                  key={item.id}
                  item={item}
                  onEdit={startEdit}
                  onDelete={handleDelete}
                  onToggleExclude={handleToggleExclude}
                />
              )
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

function PantryItemCard({ item, onEdit, onDelete, onToggleExclude }) {
  const expiry = getExpiryStatus(item.expiry_date);
  const expiryClass = expiry?.status === "expired"  ? " item-card--expired"
                    : expiry?.status === "expiring" ? " item-card--expiring"
                    : "";
  return (
    <li className={`item-card${item.exclude_from_recipes ? " item-card--excluded" : ""}${expiryClass}`}>
      <div className="item-info">
        <span className="item-name">{item.name}</span>
        <span className="item-qty">{item.quantity}</span>
        {item.expiry_date && !expiry && (
          <span className="item-expiry">Expires {item.expiry_date}</span>
        )}
        {expiry?.status === "expired" && (
          <span className="expiry-tag expiry-tag--danger">
            Expired {expiry.days}d ago
          </span>
        )}
        {expiry?.status === "expiring" && (
          <span className="expiry-tag expiry-tag--warning">
            {expiry.days === 0 ? "Expires today!" : `Expires in ${expiry.days}d`}
          </span>
        )}
        {item.exclude_from_recipes && (
          <span className="item-excluded-tag">not matched to recipes</span>
        )}
      </div>
      <div className="item-actions">
        {item.exclude_from_recipes && (
          <button className="btn-exclude-toggle" onClick={() => onToggleExclude(item)}>
            Include
          </button>
        )}
        <button className="btn-ghost" onClick={() => onEdit(item)}>Edit</button>
        <button className="btn-danger" onClick={() => onDelete(item.id)}>Delete</button>
      </div>
    </li>
  );
}
