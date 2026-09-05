# 🎨 Draw & Judge — Final

A polished anonymous multiplayer drawing-event website for **up to 30 players**.

## What is included

- Anonymous nickname login — no account, email, or password
- Random nickname generator
- A **unique random avatar per player** (up to 30 unique avatars)
- Private 5-character room codes
- Responsive mobile / tablet / desktop UI
- Lobby with live player list
- Host-customizable rounds and timers
- Up to 12 rounds
- Touch + mouse drawing canvas
- Pen, eraser, brush size, clear and submit
- Automatic round timer
- Live anonymous room chat
- Host-only controls
- Kick and ban controls
- Ban blocks the banned nickname from rejoining the room
- Private player-specific host challenges
- Best / Worst / Funniest voting
- Final award winners + overall leaderboard
- Room cleanup after everyone disconnects

## Run locally

Requires Node.js 18+.

```bash
npm install
npm start
```

Open:

`http://localhost:3000`

To test multiplayer locally, open several browser tabs/devices and use the same room code.

## Deploy online with Render

Create a GitHub repository and upload the project files. Then create a **Web Service** on Render connected to that repository.

Build command:

```text
npm install
```

Start command:

```text
npm start
```

The server automatically uses Render's `PORT` environment variable and binds to `0.0.0.0`.

## Production note

This app stores active rooms in server memory. It is intentionally simple and well suited to a single-server Discord event with around 20–30 people. If you later need multiple server instances or hundreds/thousands of concurrent players, move room state to Redis/database storage.

Anonymous bans are nickname-based because there are no accounts. A person can bypass a nickname ban by choosing another nickname.
