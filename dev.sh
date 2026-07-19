#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"
VENV_DIR="$REPO_ROOT/.venv"
VENV_PYTHON="$VENV_DIR/bin/python"
VENV_PIP="$VENV_DIR/bin/pip"
DB_PATH="$REPO_ROOT/data/vehicles.sqlite"
BACKEND_LOG="$REPO_ROOT/backend.log"
FRONTEND_LOG="$REPO_ROOT/frontend.log"
BACKEND_URL="http://127.0.0.1:8000"
FRONTEND_URL="http://127.0.0.1:5173"
BACKEND_HEALTH_URL="$BACKEND_URL/health"
BACKEND_DOCS_URL="$BACKEND_URL/docs"
BACKEND_PID=""
FRONTEND_PID=""

usage() {
  cat <<'EOF'
Usage: ./dev.sh <command>

Commands:
  setup   Create the Python virtualenv, install dependencies, and seed SQLite
  start   Launch the backend and frontend development servers
  all     Run setup, then start both services
  help    Show this message
EOF
}

print_step() {
  printf '\n==> %s\n' "$1"
}

print_missing_tool() {
  local tool="$1"
  case "$tool" in
    bash)
      echo "Missing required tool: bash"
      echo "Install Bash with your system package manager or from https://www.gnu.org/software/bash/."
      ;;
    python3)
      echo "Missing required tool: python3"
      echo "Install Python 3 from https://www.python.org/downloads/ or your system package manager."
      ;;
    node)
      echo "Missing required tool: node"
      echo "Install the current Node.js LTS release from https://nodejs.org/."
      ;;
    npm)
      echo "Missing required tool: npm"
      echo "Install Node.js from https://nodejs.org/ to get npm."
      ;;
    curl)
      echo "Missing required tool: curl"
      echo "Install curl with your system package manager."
      ;;
    *)
      echo "Missing required tool: $tool"
      ;;
  esac
}

check_required_tools() {
  local missing=0
  local tool
  for tool in bash python3 node npm curl; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      print_missing_tool "$tool"
      missing=1
    fi
  done

  if [ "$missing" -ne 0 ]; then
    exit 1
  fi
}

ensure_repo_root() {
  cd "$REPO_ROOT"
}

ensure_venv_commands() {
  if [ ! -x "$VENV_PYTHON" ] || [ ! -x "$VENV_PIP" ]; then
    echo "Python virtual environment is missing or incomplete at $VENV_DIR."
    echo "Run ./dev.sh setup to create it."
    exit 1
  fi
}

check_port_available() {
  local port="$1"
  python3 - "$port" <<'PY'
import socket
import sys

port = int(sys.argv[1])
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.settimeout(0.5)
    in_use = sock.connect_ex(("127.0.0.1", port)) == 0

sys.exit(1 if in_use else 0)
PY
}

wait_for_url() {
  local url="$1"
  local label="$2"
  local attempts="${3:-30}"
  local sleep_seconds="${4:-1}"
  local i=1

  while [ "$i" -le "$attempts" ]; do
    if curl --silent --show-error --fail "$url" >/dev/null 2>&1; then
      return 0
    fi

    sleep "$sleep_seconds"
    i=$((i + 1))
  done

  echo "$label did not become ready in time."
  return 1
}

cleanup() {
  local pid=""

  for pid in "$FRONTEND_PID" "$BACKEND_PID"; do
    if [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    fi
  done
}

seed_database() {
  print_step "Seeding SQLite database"
  "$VENV_PYTHON" testing_scripts/load_data/vehicles.py
  "$VENV_PYTHON" testing_scripts/load_data/users.py
  "$VENV_PYTHON" testing_scripts/load_data/watching.py
  "$VENV_PYTHON" testing_scripts/load_data/purchased.py
  "$VENV_PYTHON" testing_scripts/load_data/bids.py
}

run_setup() {
  check_required_tools
  ensure_repo_root

  if [ ! -d "$VENV_DIR" ]; then
    print_step "Creating Python virtual environment"
    python3 -m venv "$VENV_DIR"
  else
    print_step "Using existing Python virtual environment"
  fi

  ensure_venv_commands

  print_step "Upgrading pip"
  "$VENV_PYTHON" -m pip install --upgrade pip

  print_step "Installing backend dependencies"
  "$VENV_PIP" install -r backend/requirements.txt

  print_step "Installing frontend dependencies"
  npm install

  seed_database

  printf '\nSetup complete.\n'
  printf 'Database: %s\n' "$DB_PATH"
  printf 'Next step: ./dev.sh start\n'
}

launch_backend() {
  print_step "Starting backend"
  : > "$BACKEND_LOG"
  "$VENV_PYTHON" -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000 \
    >"$BACKEND_LOG" 2>&1 &
  BACKEND_PID=$!

  if ! wait_for_url "$BACKEND_HEALTH_URL" "Backend health check" 30 1; then
    echo "Backend failed to start. See $BACKEND_LOG"
    cleanup
    exit 1
  fi
}

launch_frontend() {
  print_step "Starting frontend"
  : > "$FRONTEND_LOG"
  npm run dev -- --host 127.0.0.1 --port 5173 >"$FRONTEND_LOG" 2>&1 &
  FRONTEND_PID=$!

  if ! wait_for_url "$FRONTEND_URL" "Frontend dev server" 30 1; then
    echo "Frontend failed to start. See $FRONTEND_LOG"
    cleanup
    exit 1
  fi
}

ensure_start_prereqs() {
  check_required_tools
  ensure_repo_root

  if [ ! -d "$VENV_DIR" ] || [ ! -x "$VENV_PYTHON" ]; then
    echo "Missing Python virtual environment at $VENV_DIR."
    echo "Run ./dev.sh setup or ./dev.sh all first."
    exit 1
  fi

  if [ ! -d "$REPO_ROOT/node_modules" ]; then
    echo "Missing frontend dependencies in $REPO_ROOT/node_modules."
    echo "Run ./dev.sh setup or ./dev.sh all first."
    exit 1
  fi

  if ! check_port_available 8000; then
    echo "Port 8000 is already in use."
    echo "Stop the conflicting process or free the port, then rerun ./dev.sh start."
    exit 1
  fi

  if ! check_port_available 5173; then
    echo "Port 5173 is already in use."
    echo "Stop the conflicting process or free the port, then rerun ./dev.sh start."
    exit 1
  fi
}

run_start() {
  ensure_start_prereqs
  trap cleanup EXIT INT TERM

  launch_backend
  launch_frontend

  printf '\nDevelopment servers are running.\n'
  printf 'Frontend: %s\n' "$FRONTEND_URL"
  printf 'Backend:  %s\n' "$BACKEND_URL"
  printf 'Health:   %s\n' "$BACKEND_HEALTH_URL"
  printf 'Docs:     %s\n' "$BACKEND_DOCS_URL"
  printf 'Logs:     %s and %s\n' "$BACKEND_LOG" "$FRONTEND_LOG"
  printf 'Press Ctrl+C to stop both services.\n'

  while true; do
    if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
      echo "Backend exited unexpectedly. See $BACKEND_LOG"
      exit 1
    fi

    if ! kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
      echo "Frontend exited unexpectedly. See $FRONTEND_LOG"
      exit 1
    fi

    sleep 2
  done
}

main() {
  local command="${1:-help}"

  case "$command" in
    setup)
      run_setup
      ;;
    start)
      run_start
      ;;
    all)
      run_setup
      run_start
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      echo "Unknown command: $command"
      echo
      usage
      exit 1
      ;;
  esac
}

main "$@"
