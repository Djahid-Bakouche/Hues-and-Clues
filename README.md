# Hues & Clues — Online Multiplayer

A real-time multiplayer color guessing game built with Node.js + WebSockets.

## Quick Start (2 minutes)

### Requirements
- [Node.js](https://nodejs.org) installed (v16+)

### Run locally

```bash
cd hues-and-clues
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

Share the room code with friends on the **same network** and they open the same URL.

---

## Play online (free hosting on Railway)

1. Push this folder to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repo — Railway auto-detects Node.js and runs `npm start`
4. Get your public URL (e.g. `https://hues-and-clues.up.railway.app`)
5. Share that URL with anyone in the world!

### Other free options
- **Render**: render.com → New Web Service → connect GitHub repo
- **Fly.io**: `fly launch` then `fly deploy`

---

## How to Play

1. One player creates a room, shares the code
2. Everyone joins with the code
3. Host clicks **Start Game**
4. Each round, the **clue giver** secretly clicks a color on the 16×30 grid
5. They type **two word clues** to describe it
6. All other players click their best guess
7. Scoring:
   - **3 pts** — exact match
   - **2 pts** — 1 square away
   - **1 pt** — 2 squares away
   - **0 pts** — further
   - Clue giver earns **1 pt per exact guesser**
8. Most points after all rounds wins!

## Tech Stack
- **Backend**: Node.js + `ws` (WebSockets) — zero framework
- **Frontend**: Vanilla HTML/CSS/JS — no build step needed
