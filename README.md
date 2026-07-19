# OPENLANE MARKETPLACE

## How to Run

Use the repository root for all commands below. This app has a React/Vite frontend, a FastAPI backend, and a SQLite database at `data/vehicles.sqlite`.

If you want the repo to handle setup and local startup for you, use the automated helper:

```bash
./dev.sh setup
./dev.sh start
```

Or run everything in one step:

```bash
./dev.sh all
```

### 1. Prerequisites

Make sure these are installed locally:

- `python3`
- `pip`
- `npm`

It is easiest to use two terminal tabs or windows while developing: one for the backend and one for the frontend.

### 2. Clone the repo

```bash
git clone <repo-url>
cd block
```

### 3. Create and activate a Python virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

If you are on Windows, use the equivalent activation command for your shell.

### 4. Install backend dependencies

```bash
python3 -m pip install --upgrade pip
pip install -r backend/requirements.txt
```

### 5. Populate the SQLite database

These scripts rebuild the application tables inside `data/vehicles.sqlite`. Run them from the repo root in this order:

```bash
python testing_scripts/load_data/vehicles.py
python testing_scripts/load_data/users.py
python testing_scripts/load_data/watching.py
python testing_scripts/load_data/purchased.py
python testing_scripts/load_data/bids.py
```

Rerunning these scripts resets the seeded data for the tables they recreate.

### 6. Install frontend dependencies

```bash
npm install
```

### 7. Start the backend API

```bash
uvicorn backend.app.main:app --reload
```

The API runs at `http://127.0.0.1:8000`.

Useful sanity checks:

- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8000/docs`

### 8. Start the frontend UI

Open a second terminal in the repo root. You only need to activate the virtual environment there if you plan to run Python commands in that terminal.

```bash
npm run dev
```

Vite prints the exact local URL when it starts, typically `http://127.0.0.1:5173/` or `http://localhost:5173/`.

### 9. Open the app in a browser

Visit the frontend URL shown by Vite in your browser.

The frontend talks to the backend at `http://127.0.0.1:8000` by default, so no extra environment configuration is required for standard local development.

### 10. Practical notes

- If port `8000` or `5173` is already in use, stop the conflicting process or start the service on a different port.
- If the frontend cannot reach the backend, confirm the FastAPI server is still running first.
- The frontend supports `VITE_API_BASE_URL` if you need to point it at a different backend, and it defaults to `http://127.0.0.1:8000`.
- After setup, run `npm run build` from the repo root to verify the frontend builds successfully.


## Time Spent

Roughly how much time you spent and how you approached the time box.

## Assumptions and Scope

What you intentionally included, skipped, or simplified.

## Stack

- **Frontend:**
- **Backend:**
- **Database:**

## What I Built

A brief description of your project and your approach.

## Notable Decisions

What choices did you make and why? What tradeoffs did you consider?

## Testing

What you tested and how.

## What I'd Do With More Time

What would you add, improve, or change?
