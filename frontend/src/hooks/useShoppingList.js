import { useEffect, useState } from "react";

const STORAGE_KEY = "pantrypilot_shopping";

export function useShoppingList() {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  // newItems: [{ id, name, recipe }]
  function addItems(newItems) {
    setItems((prev) => {
      const existing = new Set(prev.map((i) => i.id));
      const fresh = newItems
        .filter((i) => !existing.has(i.id))
        .map((i) => ({ ...i, checked: false }));
      return [...prev, ...fresh];
    });
  }

  function toggleItem(id) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, checked: !it.checked } : it))
    );
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function clearChecked() {
    setItems((prev) => prev.filter((it) => !it.checked));
  }

  function clearAll() {
    setItems([]);
  }

  return { items, addItems, toggleItem, removeItem, clearChecked, clearAll };
}
