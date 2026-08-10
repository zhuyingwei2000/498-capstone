import { useEffect, useState } from "react";

function getUserKey(token) {
  if (!token) return "pantrypilot_shopping_guest";
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return `pantrypilot_shopping_${payload.sub}`;
  } catch {
    return "pantrypilot_shopping_guest";
  }
}

export function useShoppingList(token) {
  const storageKey = getUserKey(token);

  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items, storageKey]);

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
