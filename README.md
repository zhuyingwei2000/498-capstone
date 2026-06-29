# PantryPilot

手机优先的响应式 Web 应用：拍小票/扫码/传订单截图录入家里的食材库存，推荐"现在就能做"的菜，并自动生成购物清单。

毕业设计项目，当前阶段：**第一阶段 — 项目骨架 + 注册登录打通**。

## 技术栈

- 前端：React（JavaScript） + Vite，`react-router-dom` 做路由
- 后端：Flask REST API，`Flask-SQLAlchemy` + `Flask-Migrate` 管理数据库，`Flask-JWT-Extended` 做登录态
- 数据库：PostgreSQL（本地用 Docker Compose 起）

## 目录结构

```
PantryPilot/
├── docker-compose.yml      # 本地 Postgres
├── backend/                # Flask API
│   ├── app/
│   │   ├── __init__.py     # app factory
│   │   ├── config.py
│   │   ├── models.py       # User 模型
│   │   └── auth.py         # /api/auth/register, /api/auth/login
│   ├── migrations/         # Flask-Migrate / Alembic
│   └── run.py
└── frontend/               # React (Vite)
    └── src/
        ├── pages/           # Login.jsx, Register.jsx, Home.jsx
        ├── api/client.js     # 封装 fetch 调后端
        └── AuthContext.jsx   # 保存登录 token
```

## 第一次启动（完整步骤）

### 0. 前置依赖

- Node.js ≥ 18（自带 npm）
- Python ≥ 3.10（自带 venv）
- Docker Desktop（跑本地 Postgres）

### 1. 启动数据库

在仓库根目录：

```bash
cp .env.example .env        # 第一次需要，里面是 Postgres 的用户名/密码
docker compose up -d        # 启动本地 Postgres 容器
docker compose ps           # 确认 pantrypilot-postgres 状态是 Up
```

### 2. 启动后端

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt

cp .env.example .env        # 第一次需要，按需修改 DATABASE_URL / JWT_SECRET_KEY

# 建表（Flask-Migrate）
set FLASK_APP=run.py        # Windows cmd: set FLASK_APP=run.py / PowerShell: $env:FLASK_APP="run.py"
flask db upgrade

# 启动服务
python run.py
```

后端跑在 `http://localhost:5000`，访问 `http://localhost:5000/health` 应该返回 `{"status": "ok"}`。

### 3. 启动前端

新开一个终端：

```bash
cd frontend
npm install
cp .env.example .env         # 第一次需要，里面配的是后端 API 地址
npm run dev
```

前端跑在 `http://localhost:5173`。浏览器打开它，注册一个账号，应该会跳转到占位首页。

### 之后再次启动（数据库已建过表）

```bash
docker compose up -d                          # 仓库根目录
cd backend && venv\Scripts\activate && python run.py   # 终端 1
cd frontend && npm run dev                              # 终端 2
```

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查 |
| POST | `/api/auth/register` | `{email, password}` → 创建用户，返回 JWT |
| POST | `/api/auth/login` | `{email, password}` → 返回 JWT |

## 关键决策说明

- **Vite 而不是 Create React App**：CRA 已停止维护，Vite 是目前 React 社区的主流选择，dev server 启动快、热更新快。对你来说用法和 CRA 差不多，主要差异是环境变量要用 `VITE_` 前缀（`import.meta.env.VITE_XXX`）而不是 `REACT_APP_`。
- **Flask-JWT-Extended 而不是 session/cookie 登录**：前后端是分开部署的（不同端口/不同域名），用 JWT token 比 cookie session 更简单，前端拿到 token 存起来，每次请求带 `Authorization: Bearer <token>` 头即可。
- **Flask-Migrate (Alembic)**：迁移脚本会记录每次表结构变更，比手写 SQL 建表更安全，后面加 Pantry/Recipes 表时直接 `flask db migrate` 自动生成。
- **密码哈希**：用 Flask 自带的 `werkzeug.security`（`generate_password_hash`/`check_password_hash`），不存明文密码，也不用额外装包。
- **`.env` 不进 git**：数据库密码、JWT 密钥都通过 `.env` 文件读取，仓库里只保留 `.env.example` 作为模板，`.gitignore` 已排除所有 `.env` 文件。

## 下一步（第二个里程碑，本阶段不做）

**M2 Pantry 模块**：设计食材表结构（名称、数量、单位、过期日期等），实现手动添加/编辑/删除食材的接口和页面，把首页的占位换成真正的 Pantry 列表页。
