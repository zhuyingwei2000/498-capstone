# PantryPilot

A full-stack web application that helps users manage their pantry inventory, scan grocery receipts, look up recipes, and get AI-powered meal suggestions.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, CSS3 |
| Backend | Flask 3, Flask-JWT-Extended, Flask-SQLAlchemy |
| Database | PostgreSQL (Docker) |
| Auth | JWT (7-day tokens) |

## Features

- **User Authentication** — Register and login with JWT-secured sessions
- **Pantry Management** — Add, edit, and delete pantry items with categories and expiry dates
- **Barcode Scanner** — Scan product barcodes via device camera using Open Food Facts API
- **Receipt OCR** — Photograph a grocery receipt to automatically extract food items (Google Gemini Vision)
- **Recipe Search** — Search 1M+ recipes by ingredient using the Spoonacular API
- **AI Suggestions** — Get AI-generated recipe ideas from your current pantry (Groq / LLaMA 3.3)
- **Ingredient Normalization** — Automatically merges duplicate items (e.g. "whole milk" → "Milk")
- **Shopping List** — Track items to buy

## External APIs

| API | Purpose |
|-----|---------|
| Open Food Facts | Barcode → product name lookup (no key required) |
| Spoonacular | Recipe search by ingredient |
| Groq (LLaMA 3.3) | AI recipe suggestion generation |
| Google Gemini Vision | Receipt image OCR and food item extraction |

## Project Structure

```
498/
├── backend/
│   ├── app/
│   │   ├── __init__.py       # App factory, blueprint registration
│   │   ├── models.py         # SQLAlchemy models (User, PantryItem)
│   │   ├── auth.py           # Register / Login endpoints
│   │   ├── pantry.py         # Pantry CRUD + ingredient normalization
│   │   ├── receipt.py        # Receipt OCR via Gemini Vision
│   │   ├── recipes.py        # Spoonacular recipe search
│   │   └── suggest.py        # AI recipe suggestions via Groq
│   ├── migrations/           # Flask-Migrate DB migrations
│   ├── requirements.txt
│   └── run.py
├── frontend/
│   └── src/
│       ├── pages/            # Home, Login, Register, Shopping
│       ├── components/       # BarcodeScanner, ReceiptScanner, etc.
│       └── api/              # Fetch client, TheMealDB helper
├── PantryPilot_API_Documentation.docx
├── PantryPilot_Postman_Collection.json
└── docker-compose.yml
```

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | | Create account |
| POST | `/api/auth/login` | | Login, returns JWT |
| GET | `/api/pantry` | JWT | List all pantry items |
| POST | `/api/pantry` | JWT | Add item (auto-merges duplicates) |
| PUT | `/api/pantry/<id>` | JWT | Update item |
| DELETE | `/api/pantry/<id>` | JWT | Delete item |
| POST | `/api/receipt/scan` | JWT | OCR a receipt image |
| GET | `/api/recipes/search` | JWT | Search recipes by ingredients |
| GET | `/api/recipes/<id>` | JWT | Get recipe details |
| POST | `/api/suggest/recipes` | JWT | AI-generated recipe suggestions |

## Running Locally

**Prerequisites:** Docker Desktop, Python 3.12, Node.js 18+

```bash
# 1. Start the database
docker-compose up -d

# 2. Start the backend
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
# create backend/.env with keys (see below)
flask db upgrade
python run.py

# 3. Start the frontend
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Environment Variables

Create `backend/.env`:

```
DATABASE_URL=postgresql://pantrypilot:pantrypilot@localhost:5432/pantrypilot
JWT_SECRET_KEY=<your-secret>
GROQ_API_KEY=<your-groq-key>
SPOONACULAR_API_KEY=<your-spoonacular-key>
GEMINI_API_KEY=<your-gemini-key>
```
