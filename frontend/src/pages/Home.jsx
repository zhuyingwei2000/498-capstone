import { useAuth } from "../AuthContext";
import { useNavigate } from "react-router-dom";
import Pantry from "./Pantry";

export default function Home() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">PantryPilot</h1>
        <button className="btn-ghost" onClick={handleLogout}>Log out</button>
      </header>

      <main className="app-content">
        <Pantry />
      </main>

      <nav className="bottom-nav">
        <button className="nav-tab nav-tab--active">
          <span className="nav-icon">🧺</span>
          <span>Pantry</span>
        </button>
        <button className="nav-tab nav-tab--disabled" disabled>
          <span className="nav-icon">🍳</span>
          <span>Recipes</span>
        </button>
        <button className="nav-tab nav-tab--disabled" disabled>
          <span className="nav-icon">🛒</span>
          <span>Shopping</span>
        </button>
      </nav>
    </div>
  );
}
