import { useState } from "react";
import { useAuth } from "../AuthContext";
import { useNavigate } from "react-router-dom";
import { useShoppingList } from "../hooks/useShoppingList";
import Pantry from "./Pantry";
import Recipes from "./Recipes";
import Shopping from "./Shopping";

export default function Home() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("pantry");
  const shoppingList = useShoppingList();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const pendingCount = shoppingList.items.filter((i) => !i.checked).length;

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">PantryPilot</h1>
        <button className="btn-ghost" onClick={handleLogout}>Log out</button>
      </header>

      <main className="app-content">
        <div key={activeTab} className="tab-page">
          {activeTab === "pantry" && <Pantry />}
          {activeTab === "recipes" && (
            <Recipes shoppingList={shoppingList} />
          )}
          {activeTab === "shopping" && <Shopping shoppingList={shoppingList} />}
        </div>
      </main>

      <nav className="bottom-nav">
        <button
          className={`nav-tab${activeTab === "pantry" ? " nav-tab--active" : ""}`}
          onClick={() => setActiveTab("pantry")}
        >
          <span className="nav-icon">🧺</span>
          <span>Pantry</span>
        </button>
        <button
          className={`nav-tab${activeTab === "recipes" ? " nav-tab--active" : ""}`}
          onClick={() => setActiveTab("recipes")}
        >
          <span className="nav-icon">🍳</span>
          <span>Recipes</span>
        </button>
        <button
          className={`nav-tab${activeTab === "shopping" ? " nav-tab--active" : ""}`}
          onClick={() => setActiveTab("shopping")}
        >
          <span className="nav-icon">🛒</span>
          <span>Shopping</span>
          {pendingCount > 0 && (
            <span className="nav-badge">{pendingCount}</span>
          )}
        </button>
      </nav>
    </div>
  );
}
