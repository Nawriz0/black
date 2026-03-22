const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { RoomManager } = require('./game/roomManager');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
});

const roomManager = new RoomManager({
  onRoomPhaseChanged: (roomCode) => {
    pushState(roomCode);
  },
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/room.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

function pushState(roomCode) {
  const code = String(roomCode || '').trim().toUpperCase();
  const state = roomManager.getPublicState(code);
  if (state) {
    io.to(code).emit('room-state-update', state);
    io.to(code).emit('update-chips', {
      players: state.players.map((p) => ({ id: p.id, chips: p.chips })),
    });
  }
}

function emitRoundEnd(io, code) {
  const payload = roomManager.getRoundResultPayload(code);
  if (payload) {
    io.to(code).emit('round-result', payload);
  }
}

io.on('connection', (socket) => {
  socket.on('create-room', (payload, ack) => {
    const name = payload && payload.playerName;
    const res = roomManager.createRoom(name, socket.id);
    if (!res.ok) {
      socket.emit('game-error', { message: res.error });
      if (typeof ack === 'function') ack(res);
      return;
    }
    socket.join(res.roomCode);
    pushState(res.roomCode);
    if (typeof ack === 'function') {
      ack({
        ok: true,
        roomCode: res.roomCode,
        playerId: res.playerId,
        hostId: res.hostId,
      });
    }
  });

  socket.on('join-room', (payload, ack) => {
    const roomCode = payload && payload.roomCode;
    const name = payload && payload.playerName;
    const res = roomManager.joinRoom(roomCode, name, socket.id);
    if (!res.ok) {
      socket.emit('game-error', { message: res.error });
      if (typeof ack === 'function') ack(res);
      return;
    }
    socket.join(res.roomCode);
    pushState(res.roomCode);
    if (typeof ack === 'function') {
      ack({
        ok: true,
        roomCode: res.roomCode,
        playerId: res.playerId,
        hostId: roomManager.getPublicState(res.roomCode).hostId,
      });
    }
  });

  socket.on('rejoin-room', (payload, ack) => {
    const roomCode = payload && payload.roomCode;
    const playerId = payload && payload.playerId;
    const name = payload && payload.playerName;
    const res = roomManager.rejoinRoom(roomCode, playerId, name, socket.id);
    if (!res.ok) {
      socket.emit('game-error', { message: res.error });
      if (typeof ack === 'function') ack(res);
      return;
    }
    socket.join(res.roomCode);
    pushState(res.roomCode);
    if (typeof ack === 'function') {
      ack({
        ok: true,
        roomCode: res.roomCode,
        playerId: res.playerId,
        hostId: roomManager.getPublicState(res.roomCode).hostId,
      });
    }
  });

  socket.on('leave-room', () => {
    const res = roomManager.leaveRoom(socket.id);
    if (!res.ok) {
      socket.emit('game-error', { message: res.error });
      return;
    }
    socket.leave(res.roomCode);
    if (res.roomRemoved) {
      return;
    }
    if (res.advance === 'dealer') {
      io.to(res.roomCode).emit('dealer-turn', {});
      emitRoundEnd(io, res.roomCode);
    } else if (res.advance === 'next') {
      const st = roomManager.getPublicState(res.roomCode);
      io.to(res.roomCode).emit('next-turn', { activePlayerId: st.activePlayerId });
    }
    pushState(res.roomCode);
  });

  socket.on('start-betting', (payload) => {
    const roomCode = payload && payload.roomCode;
    const code = String(roomCode || '').trim().toUpperCase();
    const res = roomManager.startBetting(roomCode, socket.id);
    if (!res.ok) {
      socket.emit('game-error', { message: res.error });
      return;
    }
    pushState(code);
  });

  socket.on('place-bet', (payload) => {
    const roomCode = payload && payload.roomCode;
    const amount = payload && payload.amount;
    const code = String(roomCode || '').trim().toUpperCase();
    const res = roomManager.placeBet(roomCode, socket.id, amount);
    if (!res.ok) {
      socket.emit('game-error', { message: res.error });
      return;
    }
    if (res.allBetsPlaced) {
      io.to(code).emit('all-bets-placed', { roomCode: code });
    }
    pushState(code);
  });

  socket.on('start-game', (payload) => {
    const roomCode = payload && payload.roomCode;
    const code = String(roomCode || '').trim().toUpperCase();
    const res = roomManager.startGame(roomCode, socket.id);
    if (!res.ok) {
      socket.emit('game-error', { message: res.error });
      return;
    }
    if (res.dealerTurn) {
      io.to(code).emit('dealer-turn', {});
    }
    if (res.endedImmediately) {
      emitRoundEnd(io, code);
    } else {
      const st = roomManager.getPublicState(code);
      io.to(code).emit('next-turn', { activePlayerId: st.activePlayerId });
    }
    pushState(code);
  });

  socket.on('hit', (payload) => {
    const roomCode = payload && payload.roomCode;
    const code = String(roomCode || '').trim().toUpperCase();
    const res = roomManager.hit(roomCode, socket.id);
    if (!res.ok) {
      socket.emit('game-error', { message: res.error });
      return;
    }
    if (res.advance === 'dealer') {
      io.to(code).emit('dealer-turn', {});
      emitRoundEnd(io, code);
    } else if (res.advance === 'next') {
      const st = roomManager.getPublicState(code);
      io.to(code).emit('next-turn', { activePlayerId: st.activePlayerId });
    }
    pushState(code);
  });

  socket.on('stand', (payload) => {
    const roomCode = payload && payload.roomCode;
    const code = String(roomCode || '').trim().toUpperCase();
    const res = roomManager.stand(roomCode, socket.id);
    if (!res.ok) {
      socket.emit('game-error', { message: res.error });
      return;
    }
    if (res.advance === 'dealer') {
      io.to(code).emit('dealer-turn', {});
      emitRoundEnd(io, code);
    } else if (res.advance === 'next') {
      const st = roomManager.getPublicState(code);
      io.to(code).emit('next-turn', { activePlayerId: st.activePlayerId });
    }
    pushState(code);
  });

  socket.on('restart-round', (payload) => {
    const roomCode = payload && payload.roomCode;
    const code = String(roomCode || '').trim().toUpperCase();
    const res = roomManager.restartRound(roomCode, socket.id);
    if (!res.ok) {
      socket.emit('game-error', { message: res.error });
      return;
    }
    if (res.dealerTurn) {
      io.to(code).emit('dealer-turn', {});
    }
    if (res.endedImmediately) {
      emitRoundEnd(io, code);
    } else {
      const st = roomManager.getPublicState(code);
      io.to(code).emit('next-turn', { activePlayerId: st.activePlayerId });
    }
    pushState(code);
  });

  socket.on('disconnect', () => {
    const res = roomManager.onDisconnect(socket.id);
    if (!res.ok || !res.roomCode) {
      return;
    }
    const code = res.roomCode;
    pushState(code);
  });
});

server.listen(PORT, () => {
  console.log(`Blackjack server listening on http://localhost:${PORT}`);
});
