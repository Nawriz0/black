const crypto = require('crypto');
const { Deck } = require('./deck');
const {
  handValue,
  isNaturalBlackjack,
  isBust,
  dealerMustHit,
  comparePlayerVsDealer,
} = require('./blackjack');

const MAX_PLAYERS = 6;
const STARTING_CHIPS = 1000;

function generatePlayerId() {
  return crypto.randomBytes(16).toString('hex');
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function drawCard(room) {
  if (!room.deck || room.deck.remaining() === 0) {
    room.deck = new Deck();
  }
  return room.deck.draw();
}

function makePlayer(name, socketId, isHost) {
  return {
    id: generatePlayerId(),
    name: String(name || '').trim(),
    socketId: socketId || null,
    isHost: !!isHost,
    chips: STARTING_CHIPS,
    roundBet: 0,
    betReady: false,
    roundStake: 0,
    lastRoundDelta: null,
    hand: [],
    bust: false,
    naturalBlackjack: false,
    roundResult: null,
  };
}

function allPlayersBetReady(room) {
  return room.players.length > 0 && room.players.every((p) => p.betReady);
}

function atLeastOneBet(room) {
  return room.players.some((p) => p.roundBet > 0);
}

function applyChipPayouts(room) {
  for (const p of room.players) {
    if (p.roundStake === 0) {
      p.lastRoundDelta = null;
      continue;
    }
    const bet = p.roundStake;
    const before = p.chips;
    const r = p.roundResult;
    if (r === 'blackjack') {
      p.chips += Math.floor(bet * 2.5);
    } else if (r === 'win') {
      p.chips += bet * 2;
    } else if (r === 'push') {
      p.chips += bet;
    }
    p.lastRoundDelta = p.chips - before;
    p.roundStake = 0;
  }
}

function settleDealerBlackjackRound(room) {
  room.dealerHoleRevealed = true;
  for (const p of room.players) {
    if (p.roundStake === 0) {
      continue;
    }
    if (isNaturalBlackjack(p.hand)) {
      p.roundResult = 'push';
    } else {
      p.roundResult = 'lose';
    }
  }
  applyChipPayouts(room);
}

function dealerPlayAndSettle(room) {
  room.dealerHoleRevealed = true;
  while (dealerMustHit(room.dealerHand)) {
    room.dealerHand.push(drawCard(room));
  }
  for (const p of room.players) {
    if (p.roundStake === 0) {
      continue;
    }
    if (p.naturalBlackjack) {
      if (isNaturalBlackjack(room.dealerHand)) {
        p.roundResult = 'push';
      } else {
        p.roundResult = 'blackjack';
      }
      continue;
    }
    if (p.bust) {
      p.roundResult = 'bust';
      continue;
    }
    const cmp = comparePlayerVsDealer(p.hand, room.dealerHand, false);
    if (cmp === 'blackjack') {
      p.roundResult = 'win';
    } else {
      p.roundResult = cmp;
    }
  }
  applyChipPayouts(room);
}

function startRound(room) {
  const participants = room.players.filter((p) => p.roundStake > 0);
  if (participants.length === 0) {
    room.phase = 'round_end';
    return { dealerTurn: false };
  }

  room.deck = new Deck();
  room.dealerHand = [];
  room.dealerHoleRevealed = false;
  room.turnQueue = [];
  room.turnIndex = 0;
  room.activePlayerId = null;

  for (const p of room.players) {
    p.hand = [];
    p.bust = false;
    p.naturalBlackjack = false;
    p.roundResult = null;
  }

  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < participants.length; i++) {
      participants[i].hand.push(drawCard(room));
    }
    room.dealerHand.push(drawCard(room));
  }

  if (isNaturalBlackjack(room.dealerHand)) {
    settleDealerBlackjackRound(room);
    room.phase = 'round_end';
    return { dealerTurn: true };
  }

  for (const p of participants) {
    if (isNaturalBlackjack(p.hand)) {
      p.naturalBlackjack = true;
    }
  }

  const needAction = participants.filter((p) => !p.naturalBlackjack);
  if (needAction.length === 0) {
    dealerPlayAndSettle(room);
    room.phase = 'round_end';
    return { dealerTurn: true };
  }

  room.turnQueue = needAction.map((p) => p.id);
  room.turnIndex = 0;
  room.activePlayerId = room.turnQueue[0];
  room.phase = 'playing';
  return { dealerTurn: false };
}

function advanceAfterPlayerTurn(room) {
  room.turnIndex += 1;
  if (room.turnIndex >= room.turnQueue.length) {
    room.activePlayerId = null;
    dealerPlayAndSettle(room);
    room.phase = 'round_end';
    return 'dealer';
  }
  room.activePlayerId = room.turnQueue[room.turnIndex];
  return 'next';
}

function removePlayerFromTurnQueue(room, playerId) {
  if (room.phase !== 'playing') {
    return null;
  }
  const wasActive = room.activePlayerId === playerId;
  const removedIdx = room.turnQueue.indexOf(playerId);
  room.turnQueue = room.turnQueue.filter((id) => id !== playerId);
  if (room.turnQueue.length === 0) {
    room.activePlayerId = null;
    dealerPlayAndSettle(room);
    room.phase = 'round_end';
    return 'dealer';
  }
  if (wasActive) {
    if (room.turnIndex >= room.turnQueue.length) {
      room.turnIndex = room.turnQueue.length - 1;
    }
    room.activePlayerId = room.turnQueue[room.turnIndex];
    return 'next';
  }
  if (removedIdx !== -1 && removedIdx < room.turnIndex) {
    room.turnIndex -= 1;
  }
  return null;
}

function enterBettingPhase(room) {
  room.phase = 'betting';
  room.deck = null;
  room.dealerHand = [];
  room.dealerHoleRevealed = false;
  room.turnQueue = [];
  room.turnIndex = 0;
  room.activePlayerId = null;
  for (const p of room.players) {
    p.roundBet = 0;
    p.betReady = false;
    p.roundStake = 0;
    p.hand = [];
    p.bust = false;
    p.naturalBlackjack = false;
    p.roundResult = null;
    p.lastRoundDelta = null;
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.socketToRoom = new Map();
  }

  _newRoomCode() {
    let code = generateRoomCode();
    let guard = 0;
    while (this.rooms.has(code) && guard < 100) {
      code = generateRoomCode();
      guard += 1;
    }
    return code;
  }

  getRoom(code) {
    return this.rooms.get(String(code).toUpperCase()) || null;
  }

  _unlinkSocket(socketId) {
    this.socketToRoom.delete(socketId);
  }

  _linkSocket(socketId, roomCode) {
    this.socketToRoom.set(socketId, String(roomCode).toUpperCase());
  }

  createRoom(hostName, socketId) {
    const trimmed = String(hostName || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'Имя не введено' };
    }
    const code = this._newRoomCode();
    const host = makePlayer(trimmed, socketId, true);
    const room = {
      code,
      players: [host],
      deck: null,
      dealerHand: [],
      phase: 'lobby',
      turnQueue: [],
      turnIndex: 0,
      activePlayerId: null,
      dealerHoleRevealed: false,
    };
    this.rooms.set(code, room);
    this._linkSocket(socketId, code);
    return { ok: true, roomCode: code, playerId: host.id, hostId: host.id };
  }

  joinRoom(roomCode, playerName, socketId) {
    const code = String(roomCode || '').trim().toUpperCase();
    const trimmed = String(playerName || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'Имя не введено' };
    }
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: 'Комната не найдена' };
    }
    if (room.phase !== 'lobby') {
      return { ok: false, error: 'Игра уже началась' };
    }
    if (room.players.length >= MAX_PLAYERS) {
      return { ok: false, error: 'Комната заполнена' };
    }
    const p = makePlayer(trimmed, socketId, false);
    room.players.push(p);
    this._linkSocket(socketId, code);
    return { ok: true, roomCode: code, playerId: p.id };
  }

  rejoinRoom(roomCode, playerId, playerName, socketId) {
    const code = String(roomCode || '').trim().toUpperCase();
    const trimmed = String(playerName || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'Имя не введено' };
    }
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: 'Комната не найдена' };
    }
    const player = room.players.find((x) => x.id === playerId);
    if (!player) {
      return { ok: false, error: 'Игрок не найден в комнате' };
    }
    if (player.name !== trimmed) {
      player.name = trimmed;
    }
    const oldSocket = player.socketId;
    if (oldSocket && oldSocket !== socketId) {
      this.socketToRoom.delete(oldSocket);
    }
    player.socketId = socketId;
    this._linkSocket(socketId, code);
    return { ok: true, roomCode: code, playerId: player.id, hostId: room.players[0].id };
  }

  onDisconnect(socketId) {
    const code = this.socketToRoom.get(socketId);
    if (!code) {
      return { ok: false };
    }
    const room = this.rooms.get(code);
    if (!room) {
      this._unlinkSocket(socketId);
      return { ok: false };
    }
    const player = room.players.find((p) => p.socketId === socketId);
    if (player) {
      player.socketId = null;
    }
    this._unlinkSocket(socketId);
    return { ok: true, roomCode: code };
  }

  leaveRoom(socketId) {
    const code = this.socketToRoom.get(socketId);
    if (!code) {
      return { ok: false, error: 'Нет активной комнаты' };
    }
    const room = this.rooms.get(code);
    if (!room) {
      this._unlinkSocket(socketId);
      return { ok: false, error: 'Комната не найдена' };
    }
    const idx = room.players.findIndex((p) => p.socketId === socketId);
    if (idx === -1) {
      this._unlinkSocket(socketId);
      return { ok: false, error: 'Игрок не найден' };
    }
    const leaving = room.players[idx];
    const wasHost = idx === 0;
    const pid = leaving.id;
    const adv = removePlayerFromTurnQueue(room, pid);
    room.players.splice(idx, 1);
    this._unlinkSocket(socketId);
    if (room.players.length === 0) {
      this.rooms.delete(code);
      return { ok: true, roomRemoved: true, roomCode: code };
    }
    if (wasHost) {
      room.players[0].isHost = true;
    }
    return { ok: true, roomRemoved: false, roomCode: code, advance: adv };
  }

  startBetting(roomCode, socketId) {
    const code = String(roomCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: 'Комната не найдена' };
    }
    const player = room.players.find((p) => p.socketId === socketId);
    if (!player) {
      return { ok: false, error: 'Игрок не найден' };
    }
    if (!player.isHost) {
      return { ok: false, error: 'Только хост может начать приём ставок' };
    }
    if (room.phase !== 'lobby' && room.phase !== 'round_end') {
      return { ok: false, error: 'Сейчас нельзя начать ставки' };
    }
    enterBettingPhase(room);
    return { ok: true };
  }

  placeBet(roomCode, socketId, rawAmount) {
    const code = String(roomCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: 'Комната не найдена' };
    }
    if (room.phase !== 'betting') {
      return { ok: false, error: 'Сейчас не фаза ставок' };
    }
    const player = room.players.find((p) => p.socketId === socketId);
    if (!player) {
      return { ok: false, error: 'Игрок не найден' };
    }
    const n = Number(rawAmount);
    if (!Number.isFinite(n)) {
      return { ok: false, error: 'Некорректная ставка' };
    }
    const amount = Math.floor(n);
    if (amount < 0) {
      return { ok: false, error: 'Некорректная ставка' };
    }
    if (amount > player.chips) {
      return { ok: false, error: 'Недостаточно фишек' };
    }
    player.roundBet = amount;
    player.betReady = true;
    const allReady = allPlayersBetReady(room);
    return { ok: true, allBetsPlaced: allReady };
  }

  startGame(roomCode, socketId) {
    const code = String(roomCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: 'Комната не найдена' };
    }
    const player = room.players.find((p) => p.socketId === socketId);
    if (!player) {
      return { ok: false, error: 'Игрок не найден' };
    }
    if (!player.isHost) {
      return { ok: false, error: 'Только хост может начать игру' };
    }
    if (room.phase !== 'betting') {
      return { ok: false, error: 'Сначала нужна фаза ставок' };
    }
    if (!allPlayersBetReady(room)) {
      return { ok: false, error: 'Не все игроки сделали ставку' };
    }
    if (!atLeastOneBet(room)) {
      return { ok: false, error: 'Нужна хотя бы одна ставка больше 0' };
    }
    for (const p of room.players) {
      if (p.roundBet > 0) {
        p.chips -= p.roundBet;
        p.roundStake = p.roundBet;
      } else {
        p.roundStake = 0;
      }
      p.roundBet = 0;
      p.betReady = false;
    }
    const sr = startRound(room);
    return {
      ok: true,
      endedImmediately: room.phase === 'round_end',
      dealerTurn: !!sr.dealerTurn,
    };
  }

  hit(roomCode, socketId) {
    const code = String(roomCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: 'Комната не найдена' };
    }
    if (room.phase !== 'playing') {
      return { ok: false, error: 'Сейчас не ваш ход' };
    }
    const player = room.players.find((p) => p.socketId === socketId);
    if (!player) {
      return { ok: false, error: 'Игрок не найден' };
    }
    if (player.roundStake === 0) {
      return { ok: false, error: 'Вы не в этом раунде' };
    }
    if (room.activePlayerId !== player.id) {
      return { ok: false, error: 'Сейчас не ваш ход' };
    }
    player.hand.push(drawCard(room));
    if (isBust(player.hand)) {
      player.bust = true;
      const adv = advanceAfterPlayerTurn(room);
      return { ok: true, advance: adv };
    }
    const v = handValue(player.hand).total;
    if (v === 21) {
      const adv = advanceAfterPlayerTurn(room);
      return { ok: true, advance: adv };
    }
    return { ok: true, advance: null };
  }

  stand(roomCode, socketId) {
    const code = String(roomCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: 'Комната не найдена' };
    }
    if (room.phase !== 'playing') {
      return { ok: false, error: 'Сейчас не ваш ход' };
    }
    const player = room.players.find((p) => p.socketId === socketId);
    if (!player) {
      return { ok: false, error: 'Игрок не найден' };
    }
    if (player.roundStake === 0) {
      return { ok: false, error: 'Вы не в этом раунде' };
    }
    if (room.activePlayerId !== player.id) {
      return { ok: false, error: 'Сейчас не ваш ход' };
    }
    const adv = advanceAfterPlayerTurn(room);
    return { ok: true, advance: adv };
  }

  restartRound(roomCode, socketId) {
    const code = String(roomCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: 'Комната не найдена' };
    }
    const player = room.players.find((p) => p.socketId === socketId);
    if (!player) {
      return { ok: false, error: 'Игрок не найден' };
    }
    if (!player.isHost) {
      return { ok: false, error: 'Только хост может начать новый раунд' };
    }
    if (room.phase !== 'round_end') {
      return { ok: false, error: 'Раунд ещё не завершён' };
    }
    enterBettingPhase(room);
    return { ok: true };
  }

  getPublicState(roomCode) {
    const code = String(roomCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return null;
    }

    const dealerCards = [];
    for (let i = 0; i < room.dealerHand.length; i++) {
      const hide =
        !room.dealerHoleRevealed && room.phase !== 'round_end' && i === 1;
      if (hide) {
        dealerCards.push({ hidden: true });
      } else {
        dealerCards.push({ suit: room.dealerHand[i].suit, rank: room.dealerHand[i].rank });
      }
    }

    const dealerValueShown =
      room.dealerHoleRevealed || room.phase === 'round_end'
        ? handValue(room.dealerHand).total
        : room.dealerHand.length > 0
          ? handValue([room.dealerHand[0]]).total
          : 0;

    const players = room.players.map((p) => {
      const hv = handValue(p.hand);
      const inRound =
        p.roundStake > 0 ||
        (room.phase === 'round_end' && p.roundResult != null);
      return {
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        online: p.socketId != null,
        chips: p.chips,
        roundBet: p.roundBet,
        betReady: p.betReady,
        roundStake: p.roundStake,
        inRound,
        lastRoundDelta: p.lastRoundDelta,
        hand: p.hand.map((c) => ({ suit: c.suit, rank: c.rank })),
        value: hv.total,
        bust: p.bust,
        naturalBlackjack: p.naturalBlackjack,
        roundResult: p.roundResult,
      };
    });

    return {
      code: room.code,
      phase: room.phase,
      hostId: room.players[0] ? room.players[0].id : null,
      bettingPhase: room.phase === 'betting',
      allBetsPlaced: room.phase === 'betting' ? allPlayersBetReady(room) : false,
      canStartDeal:
        room.phase === 'betting' && allPlayersBetReady(room) && atLeastOneBet(room),
      startingChips: STARTING_CHIPS,
      players,
      dealer: {
        cards: dealerCards,
        valueShown: dealerValueShown,
        fullValue:
          room.dealerHoleRevealed || room.phase === 'round_end'
            ? handValue(room.dealerHand).total
            : null,
      },
      activePlayerId: room.activePlayerId,
      maxPlayers: MAX_PLAYERS,
    };
  }

  getRoundResultPayload(roomCode) {
    const room = this.rooms.get(String(roomCode || '').trim().toUpperCase());
    if (!room) return null;
    return {
      results: room.players.map((p) => ({
        playerId: p.id,
        outcome: p.roundResult,
        chipsDelta: p.lastRoundDelta,
      })),
    };
  }
}

module.exports = {
  RoomManager,
  MAX_PLAYERS,
  STARTING_CHIPS,
};
