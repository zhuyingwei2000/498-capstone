function groupByRecipe(items) {
  const groups = {};
  for (const item of items) {
    const key = item.recipe || "Other";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return Object.entries(groups);
}

export default function Shopping({ shoppingList }) {
  const { items, toggleItem, removeItem, clearChecked, clearAll } = shoppingList;

  const checkedCount = items.filter((i) => i.checked).length;
  const grouped = groupByRecipe(items);

  if (items.length === 0) {
    return (
      <div className="shopping-page">
        <h2 className="section-heading">Shopping List</h2>
        <p className="status-msg">
          No items yet — open a recipe and tap "Add to Shopping List".
        </p>
      </div>
    );
  }

  return (
    <div className="shopping-page">
      <div className="shopping-page-header">
        <h2 className="section-heading">Shopping List</h2>
        <div className="shopping-header-actions">
          {checkedCount > 0 && (
            <button className="btn-ghost" onClick={clearChecked}>
              Clear bought ({checkedCount})
            </button>
          )}
          <button className="btn-danger" onClick={clearAll}>
            Clear all
          </button>
        </div>
      </div>

      {grouped.map(([recipe, recipeItems]) => (
        <section key={recipe} className="shopping-section">
          <h3 className="shopping-recipe-title">{recipe}</h3>
          <ul className="shopping-item-list">
            {recipeItems.map((item) => (
              <li key={item.id} className={`shopping-item${item.checked ? " shopping-item--checked" : ""}`}>
                <input
                  type="checkbox"
                  className="shopping-checkbox"
                  checked={item.checked}
                  onChange={() => toggleItem(item.id)}
                />
                <span className="shopping-item-name">{item.name}</span>
                <div className="shopping-item-actions">
                  <a
                    href={`https://www.walmart.com/search?q=${encodeURIComponent(item.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-instacart"
                    title="Search on Walmart"
                  >
                    🛒
                  </a>
                  <button
                    className="shopping-remove-btn"
                    onClick={() => removeItem(item.id)}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
