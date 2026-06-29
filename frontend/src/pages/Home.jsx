import { useAuth } from "../AuthContext";
import { useNavigate } from "react-router-dom";

// Placeholder landing page. Pantry / Recipes / Shopping List tabs land here later.
export default function Home() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="home-page">
      <header className="home-header">
        <h1>PantryPilot</h1>
        <button onClick={handleLogout}>退出登录</button>
      </header>
      <p>登录成功！Pantry / Recipes / Shopping List 三个 tab 将在下一阶段加入这里。</p>
    </div>
  );
}
