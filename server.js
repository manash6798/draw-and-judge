
const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 6e6 });

app.use(express.static(path.join(__dirname, "public")));

const MAX_PLAYERS = 30;
const rooms = new Map();

const DEFAULT_ROUNDS = [
  { prompt: "Draw your Valorant main 🎯", duration: 60 },
  { prompt: "Draw another member 👤", duration: 60 },
  { prompt: "Draw Awnezuko 💀", duration: 60 },
  { prompt: "Draw something WITHOUT lifting your mouse 🖱️", duration: 45 },
  { prompt: "Draw a Valorant agent from memory 🧠", duration: 60 }
];

const avatarSet = ["🎨","🦊","🐸","🐼","🐱","🐙","🦄","👽","🤖","🍀","🌙","⭐","🍉","🍩","🧃","🦋","🐨","🐯","🐵","🍓","🌈","⚡","🔥","❄️","🌸","🪐","🎧","🕹️","👾","🥷"];

const WORDS = [
  "cat","dog","dragon","pizza","rocket","wizard","ghost","banana","robot","penguin",
  "castle","volcano","spaceship","unicorn","pirate","ninja","tornado","mermaid","dinosaur","treasure",
  "coffee","headphones","controller","sunglasses","hamburger","ice cream","trophy","guitar","camera","crown",
  "football","basketball","sword","shield","monster","alien","superhero","forest","island","campfire",
  "rainbow","sunset","snowman","octopus","butterfly","shark","elephant","monkey","parrot","koala",
  "school","library","bedroom","birthday","party","roller coaster","train","airplane","bicycle","motorcycle",
  "Valorant agent","game controller","Discord logo","internet meme","angry potato","sleepy cat","flying toaster","tiny house","giant donut","magic wand"
];
function randomWords(count=3){
  const pool=[...WORDS], out=[];
  while(out.length<count && pool.length){ out.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]); }
  return out;
}

function makeCode() {
  let c;
  do c = Math.random().toString(36).slice(2, 7).toUpperCase();
  while (rooms.has(c));
  return c;
}

function cleanName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").slice(0, 20);
}
function nameKey(name) { return cleanName(name).toLowerCase(); }
function randomAvatar(room) {
  const available = avatarSet.filter(a => !room.usedAvatars.has(a));
  const pool = available.length ? available : avatarSet;
  const avatar = pool[Math.floor(Math.random() * pool.length)];
  room.usedAvatars.add(avatar);
  return avatar;
}

function roomJSON(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    roundIndex: room.roundIndex,
    rounds: room.rounds,
    endsAt: room.endsAt,
    users: [...room.users.values()].map(u => ({
      id: u.id, name: u.name, avatar: u.avatar, score: u.score, connected: u.connected
    })),
    drawings: room.drawings,
    submitted: Object.keys(room.drawings),
    votes: room.votes,
    awardTotals: room.awardTotals
  };
}

function emitRoom(room) {
  io.to(room.code).emit("room:update", roomJSON(room));
}

function setNewHost(room) {
  const candidate = [...room.users.values()].find(u => u.connected) || [...room.users.values()][0];
  room.hostId = candidate ? candidate.id : null;
}

function startRound(room, index) {
  room.roundIndex = index;
  room.status = "drawing";
  room.drawings = {};
  room.votes = { best: {}, worst: {}, funniest: {} };
  room.playerWords = new Map();
  for (const u of room.users.values()) { if (u.connected) room.playerWords.set(u.id, randomWords(3)); }
  room.endsAt = Date.now() + room.rounds[index].duration * 1000;
}

function enterVoting(room) {
  if (room.status !== "drawing") return;
  room.status = "voting";
  room.endsAt = null;
  room.votes = { best: {}, worst: {}, funniest: {} };
  emitRoom(room);
}

io.on("connection", socket => {
  socket.on("room:create", ({ name }, cb) => {
    name = cleanName(name);
    if (!name) return cb?.({ ok:false, error:"Choose an anonymous nickname first." });

    const code = makeCode();

    const room = {
      code,
      hostId: socket.id,
      status: "lobby",
      roundIndex: -1,
      rounds: DEFAULT_ROUNDS.map(r => ({...r})),
      endsAt: null,
      users: new Map(),
      drawings: {},
      votes: { best:{}, worst:{}, funniest:{} },
      chat: [],
      usedAvatars: new Set(),
      bannedNames: new Set(),
      challenges: new Map(),
    awardTotals: { best:{}, worst:{}, funniest:{} },
    playerWords: new Map()
    };

    const user = {
      id: socket.id,
      name,
      avatar: randomAvatar(room),
      score: 0,
      connected: true
    };
    room.users.set(socket.id, user);

    rooms.set(code, room);
    socket.join(code);
    socket.data.room = code;
    cb?.({ok:true, code});
    emitRoom(room);
  });

  socket.on("room:join", ({ code, name }, cb) => {
    code = String(code || "").trim().toUpperCase();
    name = cleanName(name);
    const room = rooms.get(code);

    if (!room) return cb?.({ok:false, error:"That room doesn't exist."});
    if (!name) return cb?.({ok:false, error:"Choose an anonymous nickname first."});
    if (room.bannedNames.has(nameKey(name))) return cb?.({ok:false, error:"You are banned from this room."});
    if (room.users.size >= MAX_PLAYERS) return cb?.({ok:false, error:"This room is full (30 players)."});
    if (room.status !== "lobby") return cb?.({ok:false, error:"This event has already started."});

    const user = {
      id: socket.id,
      name,
      avatar: randomAvatar(room),
      score: 0,
      connected: true
    };

    room.users.set(socket.id, user);
    socket.join(code);
    socket.data.room = code;
    cb?.({ok:true, code});
    emitRoom(room);
  });

  socket.on("host:start", ({ rounds }) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.hostId !== socket.id || room.status !== "lobby") return;

    if (Array.isArray(rounds) && rounds.length) {
      room.rounds = rounds.slice(0, 12).map(r => ({
        prompt: String(r.prompt || "Free draw ✨").slice(0, 120),
        duration: Math.max(15, Math.min(180, Number(r.duration) || 60))
      }));
    }

    startRound(room, 0);
    emitRoom(room);
  });

  socket.on("host:endRound", () => {
    const room = rooms.get(socket.data.room);
    if (!room || room.hostId !== socket.id) return;
    enterVoting(room);
  });

  socket.on("host:next", () => {
    const room = rooms.get(socket.data.room);
    if (!room || room.hostId !== socket.id || room.status !== "voting") return;

    const next = room.roundIndex + 1;
    if (next >= room.rounds.length) {
      room.status = "finished";
      room.endsAt = null;
      emitRoom(room);
      return;
    }

    startRound(room, next);
    emitRoom(room);
    for (const u of room.users.values()) {
      if (u.connected) io.to(u.id).emit("words:options", { options: room.playerWords.get(u.id) || randomWords(3) });
    }
  });

  socket.on("words:get", () => {
    const room = rooms.get(socket.data.room);
    if (!room || room.status !== "drawing") return;
    const options = room.playerWords.get(socket.id) || randomWords(3);
    room.playerWords.set(socket.id, options);
    socket.emit("words:options", { options });
  });

  socket.on("word:choose", ({ word }) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.status !== "drawing") return;
    const options = room.playerWords.get(socket.id) || [];
    word = String(word || "").trim();
    if (!options.includes(word)) return;
    socket.data.chosenWord = word;
    socket.emit("word:chosen", { word });
  });

  socket.on("host:setChallenge", ({ targetId, text }) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.hostId !== socket.id || room.status !== "drawing") return;
    text = String(text || "").trim().slice(0, 180);
    if (!text) return;
    const target = room.users.get(targetId);
    if (!target || target.id === socket.id) return;
    room.challenges.set(targetId, text);
    io.to(targetId).emit("challenge:received", { text, fromHost: true });
    socket.emit("host:challengeSent", { targetId, targetName: target.name, text });
  });

  socket.on("host:moderate", ({ targetId, action }) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.hostId !== socket.id) return;
    if (!targetId || targetId === socket.id) return;
    const target = room.users.get(targetId);
    if (!target) return;
    if (action === "ban") room.bannedNames.add(nameKey(target.name));
    if (action !== "kick" && action !== "ban") return;
    io.to(targetId).emit("moderation:removed", { banned: action === "ban" });
    const targetSocket = io.sockets.sockets.get(targetId);
    room.users.delete(targetId);
    room.drawings && delete room.drawings[targetId];
    room.challenges.delete(targetId);
    for (const category of ["best", "worst", "funniest"]) {
      delete room.votes[category][targetId];
      for (const voterId of Object.keys(room.votes[category])) {
        if (room.votes[category][voterId] === targetId) delete room.votes[category][voterId];
      }
    }
    if (targetSocket) targetSocket.disconnect(true);
    emitRoom(room);
  });

  socket.on("drawing:submit", ({ image }) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.status !== "drawing") return;
    if (typeof image !== "string" || image.length > 5e6) return;
    room.drawings[socket.id] = image;
    emitRoom(room);
  });

  socket.on("vote", ({ category, targetId }) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.status !== "voting") return;
    if (!["best","worst","funniest"].includes(category)) return;
    if (!room.users.has(targetId) || targetId === socket.id) return;

    const previous = room.votes[category][socket.id];
    if (previous === targetId) return;
    if (previous) {
      room.awardTotals[category][previous] = Math.max(0, (room.awardTotals[category][previous] || 0) - 1);
    }
    room.votes[category][socket.id] = targetId;
    room.awardTotals[category][targetId] = (room.awardTotals[category][targetId] || 0) + 1;
    socket.emit("vote:accepted", { category, targetId });
    emitRoom(room);
  });

  socket.on("chat", ({ text }) => {
    const room = rooms.get(socket.data.room);
    if (!room) return;
    const user = room.users.get(socket.id);
    if (!user) return;

    text = String(text || "").trim().slice(0, 300);
    if (!text) return;

    const message = { id: Date.now()+Math.random(), name:user.name, avatar:user.avatar, text, time:Date.now() };
    room.chat.push(message);
    if (room.chat.length > 80) room.chat.shift();
    io.to(room.code).emit("chat", message);
  });

  socket.on("chat:history", () => {
    const room = rooms.get(socket.data.room);
    if (room) socket.emit("chat:history", room.chat);
  });

  socket.on("disconnect", () => {
    const room = rooms.get(socket.data.room);
    if (!room) return;

    const user = room.users.get(socket.id);
    if (user) user.connected = false;

    if (room.hostId === socket.id) setNewHost(room);
    emitRoom(room);

    setTimeout(() => {
      const r = rooms.get(room.code);
      if (r && ![...r.users.values()].some(u => u.connected)) rooms.delete(room.code);
    }, 10 * 60 * 1000);
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.status === "drawing" && room.endsAt && Date.now() >= room.endsAt) {
      enterVoting(room);
    }
  }
}, 500);

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`Draw & Judge listening on ${PORT}`));
