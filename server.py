import hashlib
import http.cookies
import http.server
import json
import os
import secrets
import sqlite3
import urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT, "kivo.sqlite3")
SESSIONS = {}
INVITE_CODE = "KIVO2026"


def database():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.executescript("""
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        username TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'blue',
        deadline TEXT NOT NULL DEFAULT 'Hoje',
        status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'done')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'investment')),
        amount REAL NOT NULL CHECK(amount > 0),
        category TEXT NOT NULL DEFAULT 'Outros',
        note TEXT NOT NULL DEFAULT '',
        transaction_date TEXT NOT NULL DEFAULT (date('now')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    """)
    columns = {row["name"] for row in connection.execute("PRAGMA table_info(users)")}
    if "username" not in columns:
        connection.execute("ALTER TABLE users ADD COLUMN username TEXT")
    connection.execute(
        "UPDATE users SET username = lower(substr(email, 1, instr(email, '@') - 1)) "
        "WHERE username IS NULL OR username = ''"
    )
    connection.commit()
    return connection


def password_hash(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120000)
    return salt.hex() + ":" + digest.hex()


def password_matches(password, stored):
    salt, digest = stored.split(":")
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 120000)
    return secrets.compare_digest(candidate.hex(), digest)


class KivoHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length) or b"{}")

    def current_user(self):
        cookies = http.cookies.SimpleCookie(self.headers.get("Cookie"))
        token = cookies.get("kivo_session")
        user_id = SESSIONS.get(token.value) if token else None
        if not user_id:
            return None
        return database().execute("SELECT id, name, username FROM users WHERE id = ?", (user_id,)).fetchone()

    def session_cookie(self, user_id):
        token = secrets.token_urlsafe(32)
        SESSIONS[token] = user_id
        cookie = http.cookies.SimpleCookie()
        cookie["kivo_session"] = token
        cookie["kivo_session"]["path"] = "/"
        cookie["kivo_session"]["httponly"] = True
        cookie["kivo_session"]["samesite"] = "Lax"
        return cookie.output(header="").strip()

    def do_GET(self):
        if self.path == "/api/session":
            user = self.current_user()
            self.send_json({"user": dict(user) if user else None})
            return
        if self.path == "/api/tasks":
            user = self.current_user()
            if not user:
                self.send_json({"error": "Não autenticado."}, 401)
                return
            rows = database().execute("SELECT id, title, category, deadline, status FROM tasks WHERE user_id = ? ORDER BY id", (user["id"],)).fetchall()
            self.send_json({"tasks": [dict(row) for row in rows]})
            return
        if self.path == "/api/transactions":
            user = self.current_user()
            if not user:
                self.send_json({"error": "Não autenticado."}, 401)
                return
            connection = database()
            rows = connection.execute(
                "SELECT id, description, type, amount, category, note, transaction_date "
                "FROM transactions WHERE user_id = ? ORDER BY transaction_date DESC, id DESC",
                (user["id"],),
            ).fetchall()
            totals = connection.execute(
                "SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) income, "
                "COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) expense, "
                "COALESCE(SUM(CASE WHEN type = 'investment' THEN amount ELSE 0 END), 0) investment "
                "FROM transactions WHERE user_id = ?", (user["id"],)
            ).fetchone()
            self.send_json({"transactions": [dict(row) for row in rows], "totals": dict(totals)})
            return
        super().do_GET()

    def do_POST(self):
        data = self.read_json()
        if self.path == "/api/register":
            username = data.get("username", "").strip().lower()
            password = data.get("password", "")
            confirm_password = data.get("confirm_password", "")
            invite_code = data.get("invite_code", "").strip().upper()
            if not username or not username.replace("_", "").replace("-", "").isalnum():
                self.send_json({"error": "Use um usuário com letras, números, hífen ou sublinhado."}, 400)
                return
            if len(password) < 6:
                self.send_json({"error": "A senha deve ter pelo menos 6 caracteres."}, 400)
                return
            if password != confirm_password:
                self.send_json({"error": "As senhas não conferem."}, 400)
                return
            if invite_code != INVITE_CODE:
                self.send_json({"error": "Código de convite inválido."}, 403)
                return
            connection = database()
            try:
                cursor = connection.execute(
                    "INSERT INTO users (name, email, username, password_hash) VALUES (?, ?, ?, ?)",
                    (username, username + "@local.kivo", username, password_hash(password)),
                )
                connection.commit()
            except sqlite3.IntegrityError:
                self.send_json({"error": "Este usuário já está cadastrado."}, 409)
                return
            self.send_response(201)
            self.send_header("Set-Cookie", self.session_cookie(cursor.lastrowid))
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"user": {"name": username, "username": username}}).encode())
            return
        if self.path == "/api/login":
            username, password = data.get("username", "").strip().lower(), data.get("password", "")
            user = database().execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
            if not user or not password_matches(password, user["password_hash"]):
                self.send_json({"error": "Usuário ou senha inválidos."}, 401)
                return
            self.send_response(200)
            self.send_header("Set-Cookie", self.session_cookie(user["id"]))
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"user": {"name": user["name"], "username": user["username"]}}).encode())
            return
        if self.path == "/api/logout":
            cookies = http.cookies.SimpleCookie(self.headers.get("Cookie"))
            token = cookies.get("kivo_session")
            if token:
                SESSIONS.pop(token.value, None)
            cookie = http.cookies.SimpleCookie()
            cookie["kivo_session"] = ""
            cookie["kivo_session"]["path"] = "/"
            cookie["kivo_session"]["expires"] = "Thu, 01 Jan 1970 00:00:00 GMT"
            self.send_response(200)
            self.send_header("Set-Cookie", cookie.output(header="").strip())
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True}).encode())
            return
        if self.path == "/api/tasks":
            user = self.current_user()
            if not user:
                self.send_json({"error": "Não autenticado."}, 401)
                return
            connection = database()
            cursor = connection.execute("INSERT INTO tasks (user_id, title, category, deadline, status) VALUES (?, ?, ?, ?, ?)", (user["id"], data["title"].strip(), data.get("category", "blue"), data.get("deadline", "Hoje"), data.get("status", "todo")))
            connection.commit()
            self.send_json({"id": cursor.lastrowid})
            return
        if self.path == "/api/transactions":
            user = self.current_user()
            if not user:
                self.send_json({"error": "Não autenticado."}, 401)
                return
            description = data.get("description", "").strip()
            transaction_type = data.get("type", "")
            try:
                amount = float(data.get("amount", 0))
            except (TypeError, ValueError):
                amount = 0
            if not description or transaction_type not in ("income", "expense", "investment") or amount <= 0:
                self.send_json({"error": "Informe descrição, tipo e um valor válido."}, 400)
                return
            connection = database()
            cursor = connection.execute(
                "INSERT INTO transactions (user_id, description, type, amount, category, note, transaction_date) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (user["id"], description, transaction_type, amount, data.get("category", "Outros").strip(),
                 data.get("note", "").strip(), data.get("transaction_date") or __import__("datetime").date.today().isoformat()),
            )
            connection.commit()
            self.send_json({"id": cursor.lastrowid}, 201)
            return
        self.send_json({"error": "Rota não encontrada."}, 404)

    def do_PATCH(self):
        user = self.current_user()
        if not user:
            self.send_json({"error": "Não autenticado."}, 401)
            return

        if self.path.startswith("/api/transactions/"):
            transaction_id = self.path.rsplit("/", 1)[-1]
            data = self.read_json()
            description = str(data.get("description", "")).strip()
            transaction_type = data.get("type", "")
            try:
                amount = float(data.get("amount", 0))
            except (TypeError, ValueError):
                amount = 0
            if not description or transaction_type not in ("income", "expense", "investment") or amount <= 0:
                self.send_json({"error": "Informe descrição, tipo e um valor válido."}, 400)
                return
            connection = database()
            connection.execute(
                "UPDATE transactions SET description = ?, type = ?, amount = ?, category = ?, note = ?, transaction_date = ? WHERE id = ? AND user_id = ?",
                (
                    description,
                    transaction_type,
                    amount,
                    data.get("category", "Outros").strip(),
                    data.get("note", "").strip(),
                    data.get("transaction_date") or __import__("datetime").date.today().isoformat(),
                    transaction_id,
                    user["id"],
                ),
            )
            connection.commit()
            self.send_json({"ok": True})
            return

        if not self.path.startswith("/api/tasks/"):
            self.send_json({"error": "Rota não encontrada."}, 404)
            return
        task_id = self.path.rsplit("/", 1)[-1]
        data = self.read_json()
        fields = {key: data[key] for key in ("title", "category", "deadline", "status") if key in data}
        if not fields:
            self.send_json({"error": "Nenhuma alteração informada."}, 400)
            return
        values = list(fields.values()) + [task_id, user["id"]]
        connection = database()
        connection.execute("UPDATE tasks SET " + ", ".join(key + " = ?" for key in fields) + " WHERE id = ? AND user_id = ?", values)
        connection.commit()
        self.send_json({"ok": True})

    def do_DELETE(self):
        if self.path.startswith("/api/transactions/"):
            user = self.current_user()
            if not user:
                self.send_json({"error": "Não autenticado."}, 401)
                return
            transaction_id = self.path.rsplit("/", 1)[-1]
            connection = database()
            connection.execute("DELETE FROM transactions WHERE id = ? AND user_id = ?", (transaction_id, user["id"]))
            connection.commit()
            self.send_json({"ok": True})
            return
        if not self.path.startswith("/api/tasks/"):
            self.send_json({"error": "Rota não encontrada."}, 404)
            return
        user = self.current_user()
        if not user:
            self.send_json({"error": "Não autenticado."}, 401)
            return
        task_id = self.path.rsplit("/", 1)[-1]
        connection = database()
        connection.execute("DELETE FROM tasks WHERE id = ? AND user_id = ?", (task_id, user["id"]))
        connection.commit()
        self.send_json({"ok": True})


if __name__ == "__main__":
    database().close()
    print("Kivo Studio disponível em http://localhost:8000")
    http.server.ThreadingHTTPServer(("localhost", 8000), KivoHandler).serve_forever()
