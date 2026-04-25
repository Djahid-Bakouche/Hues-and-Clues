const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

const rooms = {};

function broadcast(roomId, msg, excludeWs = null) {
  const room = rooms[roomId];
  if (!room) return;
  const data = JSON.stringify(msg);
  room.clients.forEach(client => {
    if (client !== excludeWs && client.readyState === 1) client.send(data);
  });
}

function broadcastAll(roomId, msg) {
  broadcast(roomId, msg, null);
}

function getRoomState(roomId) {
  const room = rooms[roomId];
  if (!room) return null;
  return {
    type: 'state',
    players: room.players,
    phase: room.phase,
    round: room.round,
    totalRounds: room.totalRounds,
    giverIndex: room.giverIndex,
    clue1: room.clue1,
    clue2: room.clue2,
    guesses: room.phase === 'scoring' ? room.guesses : {},
    targetCell: room.phase === 'scoring' ? room.targetCell : null,
    revealTarget: room.phase === 'scoring',
  };
}

wss.on('connection', (ws) => {
  let playerRoomId = null;
  let playerIndex = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      const roomId = msg.roomId.toUpperCase().trim();
      const name = msg.name.trim().slice(0, 20) || 'Player';

      if (!rooms[roomId]) {
        rooms[roomId] = {
          clients: [],
          players: [],
          phase: 'lobby',
          round: 0,
          totalRounds: 0,
          giverIndex: 0,
          targetCell: null,
          clue1: '', clue2: '',
          guesses: {},
        };
      }

      const room = rooms[roomId];
      if (room.phase !== 'lobby') {
        ws.send(JSON.stringify({ type: 'error', msg: 'Game already started.' }));
        return;
      }
      if (room.players.length >= 6) {
        ws.send(JSON.stringify({ type: 'error', msg: 'Room is full (max 6).' }));
        return;
      }

      const colors = ['#E24B4A','#378ADD','#f0c040','#1D9E75','#D4537E','#EF9F27'];
      playerIndex = room.players.length;
      playerRoomId = roomId;
      room.players.push({ name, color: colors[playerIndex], score: 0 });
      room.clients.push(ws);

      ws.send(JSON.stringify({ type: 'joined', playerIndex, roomId }));
      broadcastAll(roomId, { type: 'players', players: room.players });
    }

    else if (msg.type === 'start') {
      const room = rooms[playerRoomId];
      if (!room || playerIndex !== 0) return;
      if (room.players.length < 2) {
        ws.send(JSON.stringify({ type: 'error', msg: 'Need at least 2 players.' }));
        return;
      }
      room.phase = 'picking';
      room.round = 0;
      room.totalRounds = room.players.length * 2;
      room.giverIndex = 0;
      room.targetCell = null;
      room.guesses = {};
      room.clue1 = ''; room.clue2 = '';
      broadcastAll(playerRoomId, getRoomState(playerRoomId));
    }

    else if (msg.type === 'pickTarget') {
      const room = rooms[playerRoomId];
      if (!room || room.phase !== 'picking' || playerIndex !== room.giverIndex) return;
      room.targetCell = msg.cell;
      broadcastAll(playerRoomId, { type: 'targetPicked' });
    }

    else if (msg.type === 'submitClues') {
      const room = rooms[playerRoomId];
      if (!room || room.phase !== 'picking' || playerIndex !== room.giverIndex) return;
      if (!msg.clue1 || !msg.clue2) return;
      room.clue1 = msg.clue1.trim().slice(0, 30);
      room.clue2 = msg.clue2.trim().slice(0, 30);
      room.phase = 'guessing';
      room.guesses = {};
      broadcastAll(playerRoomId, getRoomState(playerRoomId));
    }

    else if (msg.type === 'guess') {
      const room = rooms[playerRoomId];
      if (!room || room.phase !== 'guessing' || playerIndex === room.giverIndex) return;
      if (room.guesses[playerIndex] !== undefined) return;
      room.guesses[playerIndex] = msg.cell;

      const guessers = room.players.map((_,i)=>i).filter(i=>i!==room.giverIndex);
      const allDone = guessers.every(i => room.guesses[i] !== undefined);

      broadcastAll(playerRoomId, { type: 'guessUpdate', guesses: room.guesses, allDone });

      if (allDone) {
        room.phase = 'scoring';
        calcScores(room);
        broadcastAll(playerRoomId, getRoomState(playerRoomId));
      }
    }

    else if (msg.type === 'nextRound') {
      const room = rooms[playerRoomId];
      if (!room || room.phase !== 'scoring' || playerIndex !== room.giverIndex) return;
      room.round++;
      if (room.round >= room.totalRounds) {
        room.phase = 'ended';
        broadcastAll(playerRoomId, { type: 'ended', players: room.players });
      } else {
        room.giverIndex = (room.giverIndex + 1) % room.players.length;
        room.phase = 'picking';
        room.targetCell = null;
        room.guesses = {};
        room.clue1 = ''; room.clue2 = '';
        broadcastAll(playerRoomId, getRoomState(playerRoomId));
      }
    }
  });

  ws.on('close', () => {
    if (playerRoomId && rooms[playerRoomId]) {
      const room = rooms[playerRoomId];
      const idx = room.clients.indexOf(ws);
      if (idx !== -1) room.clients.splice(idx, 1);
      if (room.clients.length === 0) delete rooms[playerRoomId];
      else broadcastAll(playerRoomId, { type: 'players', players: room.players });
    }
  });
});

function cellDist(a, b) {
  const ROWS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P'];
  const rDiff = Math.abs(ROWS.indexOf(a.row) - ROWS.indexOf(b.row));
  const cDiff = Math.abs(a.col - b.col);
  return Math.max(rDiff, cDiff);
}

function calcScores(room) {
  const target = room.targetCell;
  let giverBonus = 0;
  Object.entries(room.guesses).forEach(([i, g]) => {
    const d = cellDist(g, target);
    const pts = d === 0 ? 3 : d === 1 ? 2 : d === 2 ? 1 : 0;
    room.players[parseInt(i)].score += pts;
    if (d === 0) giverBonus++;
  });
  room.players[room.giverIndex].score += giverBonus;
}

server.listen(PORT, () => console.log(`Hues & Clues running at http://localhost:${PORT}`));
