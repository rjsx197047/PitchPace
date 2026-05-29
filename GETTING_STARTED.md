# Getting Started — Opening PitchPace in your browser

This is a step-by-step tutorial for running PitchPace on your own computer and
opening it in your web browser. No coding needed — just copy and paste a few
commands.

> **The golden rule:** PitchPace runs a small server on your machine. You must
> **start that server first**, then open the link in your browser. If you open
> the link and the server isn't running, the browser will say
> **"This site can't be reached"** — that just means you need to start (or
> restart) the server. Keep the terminal window open while you use the app.

---

## 1. Check you have the prerequisites

PitchPace needs two free tools. Open a terminal and check:

```bash
python3 --version    # need 3.11 or newer
node --version       # need 20 or newer (22 recommended)
```

If either is missing:

- **macOS** (with [Homebrew](https://brew.sh)): `brew install python@3.12 node@22`
- **Windows:** install from [python.org](https://www.python.org/downloads/) and
  [nodejs.org](https://nodejs.org/). During Python install, tick
  **"Add python.exe to PATH."**
- **Linux (Debian/Ubuntu):** `sudo apt install python3 python3-pip nodejs npm`

## 2. Unzip the download

Unzip `pitchpace.zip`. You'll get a folder named `pitchpace`.

## 3. Open a terminal **inside** the folder

- **macOS:** open the **Terminal** app, type `cd ` (with a space), then drag the
  `pitchpace` folder onto the window and press **Enter**.
- **Windows:** open the `pitchpace` folder in File Explorer, click the address
  bar, type `cmd`, and press **Enter** (or use **Git Bash** / **WSL** — see notes
  below).
- **Linux:** right-click the folder → "Open in Terminal," or `cd /path/to/pitchpace`.

You should now be "inside" the folder. Confirm with:

```bash
ls        # macOS/Linux — you should see: backend  frontend  start.sh  README.md ...
dir       # Windows cmd
```

## 4. Start PitchPace

### macOS / Linux (recommended)

```bash
./start.sh
```

This builds the app once and serves everything on a single address. When you see
a line like `PitchPace is running → http://localhost:8000`, it's ready.

### Windows

The `.sh` scripts need a bash shell. Either install
[**Git for Windows**](https://git-scm.com/download/win) (which includes "Git
Bash") or use **WSL**, then run `./start.sh` there. Or run it manually:

```bat
python -m pip install -r backend\requirements.txt
cd frontend && npm install && npm run build && cd ..
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

## 5. Open it in your browser

Go to:

### 👉 http://localhost:8000

**Type the whole thing, including `:8000`.** Just typing `localhost` (with no
`:8000`) will **not** work.

That's it — PitchPace is running. The first time, everything starts at **zero**;
your stats, charts and history fill in as you log sessions.

## 6. (Optional) Turn on the AI coach

The AI features work two ways — your choice:

- **Use your own Claude key:** click the **gear / Settings** icon, paste your
  Anthropic key (`sk-ant-…`), and save. It's stored **only in your browser** and
  sent only to Anthropic; usage is billed to **your** account.
- **Use a free local model:** install [Ollama](https://ollama.com), run
  `ollama pull llama3.2`, and PitchPace uses it automatically when no Claude key
  is set — fully offline.

## Stopping and restarting

- **Stop:** click the terminal window and press **Ctrl + C**.
- **Restart:** run `./start.sh` again. (Closing the terminal also stops the server.)

---

## Troubleshooting

**"This site can't be reached" / "connection refused"**
The server isn't running. Make sure:
1. The terminal from Step 4 is still open and shows "PitchPace is running."
2. You used the full URL **with the port**: `http://localhost:8000`.
3. If the terminal was closed or you restarted your computer, just run
   `./start.sh` again.

**"Port 8000 is already in use"**
Something else is using that port. Stop it, or run on another port:
```bash
python3 -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8010
# then open http://localhost:8010
```

**`./start.sh: permission denied`**
Make the script executable once: `chmod +x start.sh` then `./start.sh`.

**`command not found: python3` or `node`**
Revisit Step 1 — the tool isn't installed or isn't on your PATH.

**The page loads but the AI coach errors**
Add a Claude key in Settings, or install/run Ollama (Step 6). The rest of the app
(logging, history, dashboard) works without any AI.

---

### Two ways to run, summarised

| Command      | URL to open              | Best for                            |
| ------------ | ------------------------ | ----------------------------------- |
| `./start.sh` | `http://localhost:8000`  | Everyday use — one address, one step |
| `./dev.sh`   | `http://localhost:5181`  | Development — instant hot reload     |

Your data is stored locally in `backend/data/pitchpace.db` and never leaves your
machine. Delete that file to reset PitchPace back to a clean, empty state.
