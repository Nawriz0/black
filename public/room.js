(function () {
  const LS_NAME = 'bj_player_name';
  const LS_ID = 'bj_player_id';
  const LS_ROOM = 'bj_room_code';

  const OUTCOME_RU = {
    win: 'Победа',
    lose: 'Поражение',
    push: 'Ничья',
    bust: 'Перебор',
    blackjack: 'Блэкджек',
  };

  const elCode = document.getElementById('displayRoomCode');
  const elPname = document.getElementById('displayPlayerName');
  const elHost = document.getElementById('hostBadge');
  const elErr = document.getElementById('roomError');
  const elStatus = document.getElementById('gameStatus');
  const elTurn = document.getElementById('turnHint');
  const elDealerCards = document.getElementById('dealerCards');
  const elDealerScore = document.getElementById('dealerScore');
  const elPlayersGrid = document.getElementById('playersGrid');
  const elList = document.getElementById('playerList');
  const elHostControls = document.getElementById('hostControls');
  const elPlayerControls = document.getElementById('playerControls');
  const btnCopy = document.getElementById('btnCopyCode');
  const btnLeave = document.getElementById('btnLeave');
  const btnStart = document.getElementById('btnStart');
  const btnNew = document.getElementById('btnNewRound');
  const btnHit = document.getElementById('btnHit');
  const btnStand = document.getElementById('btnStand');

  const params = new URLSearchParams(window.location.search);
  const codeFromUrl = (params.get('code') || '').trim().toUpperCase();
  const storedRoom = (localStorage.getItem(LS_ROOM) || '').trim().toUpperCase();
  const roomCode = codeFromUrl || storedRoom;

  const playerName = String(localStorage.getItem(LS_NAME) || '').trim();
  const playerId = String(localStorage.getItem(LS_ID) || '').trim();

  if (!roomCode) {
    window.location.href = '/';
    return;
  }

  if (!playerName) {
    window.location.href = '/?join=' + encodeURIComponent(roomCode);
    return;
  }

  if (!playerId || storedRoom !== roomCode) {
    window.location.href = '/?join=' + encodeURIComponent(roomCode);
    return;
  }

  elCode.textContent = roomCode;
  elPname.textContent = playerName;

  let lastState = null;

  function showError(text) {
    if (!text) {
      elErr.hidden = true;
      elErr.textContent = '';
      return;
    }
    elErr.hidden = false;
    elErr.textContent = text;
  }

  function suitClass(suit) {
    return suit === '♥' || suit === '♦' ? 'card--red' : '';
  }

  function cardHtml(card, small) {
    if (card && card.hidden) {
      return (
        '<div class="card card--back' +
        (small ? ' card--small' : '') +
        '" aria-label="Скрытая карта"></div>'
      );
    }
    const rank = String(card.rank);
    const suit = String(card.suit);
    const sm = small ? ' card--small' : '';
    return (
      '<div class="card ' +
      suitClass(suit) +
      sm +
      '"><div class="card__inner"><div class="card__rank">' +
      rank +
      '</div><div class="card__suit">' +
      suit +
      '</div><div class="card__rank">' +
      rank +
      '</div></div></div>'
    );
  }

  function renderDealer(state) {
    const d = state.dealer;
    elDealerCards.innerHTML = (d.cards || []).map((c) => cardHtml(c, false)).join('');
    if (state.phase === 'round_end' && d.fullValue != null) {
      elDealerScore.textContent = 'Очки: ' + d.fullValue;
    } else {
      elDealerScore.textContent = d.valueShown != null ? 'Видно: ' + d.valueShown : '';
    }
  }

  function renderPlayers(state) {
    elPlayersGrid.innerHTML = '';
    const activeId = state.activePlayerId;
    (state.players || []).forEach((p) => {
      const isMe = p.id === playerId;
      const isActive = p.id === activeId && state.phase === 'playing';
      const wrap = document.createElement('div');
      wrap.className = 'player-panel' + (isActive ? ' player-panel--active' : '');
      const head = document.createElement('div');
      head.className = 'player-panel__head';
      const left = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'player-panel__name';
      name.textContent = p.name + (isMe ? ' (вы)' : '');
      const meta = document.createElement('div');
      meta.className = 'player-panel__meta';
      const bits = [];
      if (p.isHost) bits.push('хост');
      if (p.online === false) bits.push('офлайн');
      meta.textContent = bits.join(' • ');
      left.appendChild(name);
      left.appendChild(meta);
      const right = document.createElement('div');
      right.className = 'player-panel__meta';
      right.textContent = 'Очки: ' + String(p.value);
      head.appendChild(left);
      head.appendChild(right);
      const row = document.createElement('div');
      row.className = 'cards-row';
      row.innerHTML = (p.hand || []).map((c) => cardHtml(c, true)).join('');
      const foot = document.createElement('div');
      foot.style.marginTop = '10px';
      foot.style.display = 'flex';
      foot.style.gap = '8px';
      foot.style.flexWrap = 'wrap';
      if (p.bust) {
        const t = document.createElement('span');
        t.className = 'tag tag--bad';
        t.textContent = 'Перебор';
        foot.appendChild(t);
      }
      if (state.phase === 'round_end' && p.roundResult) {
        const t = document.createElement('span');
        const r = p.roundResult;
        t.className =
          r === 'lose' || r === 'bust' ? 'tag tag--bad' : r === 'push' ? 'tag' : 'tag tag--good';
        t.textContent = OUTCOME_RU[r] || r;
        foot.appendChild(t);
      }
      wrap.appendChild(head);
      wrap.appendChild(row);
      wrap.appendChild(foot);
      elPlayersGrid.appendChild(wrap);
    });
  }

  function renderList(state) {
    elList.innerHTML = '';
    (state.players || []).forEach((p) => {
      const li = document.createElement('li');
      li.className = 'player-list__item';
      const a = document.createElement('div');
      const n = document.createElement('div');
      n.className = 'player-list__name';
      n.textContent = p.name;
      const s = document.createElement('div');
      s.className = 'player-list__sub';
      const bits = [];
      if (p.isHost) bits.push('хост');
      if (p.online === false) bits.push('офлайн');
      s.textContent = bits.join(' • ') || 'онлайн';
      a.appendChild(n);
      a.appendChild(s);
      li.appendChild(a);
      elList.appendChild(li);
    });
  }

  function statusText(state) {
    if (state.phase === 'lobby') {
      return 'Лобби: ожидание старта';
    }
    if (state.phase === 'playing') {
      return 'Идёт раунд: ход игроков';
    }
    if (state.phase === 'round_end') {
      return 'Раунд завершён';
    }
    return '—';
  }

  function applyUi(state) {
    lastState = state;
    elStatus.textContent = statusText(state);

    const isHost = state.hostId === playerId;
    elHost.hidden = !isHost;

    const inRound = state.phase === 'playing';
    const ended = state.phase === 'round_end';
    const lobby = state.phase === 'lobby';

    elHostControls.hidden = !isHost;
    btnStart.hidden = !(isHost && lobby);
    btnNew.hidden = !(isHost && ended);

    const myTurn = inRound && state.activePlayerId === playerId;
    elPlayerControls.hidden = !myTurn;
    btnHit.disabled = !myTurn;
    btnStand.disabled = !myTurn;

    if (inRound && state.activePlayerId) {
      const ap = (state.players || []).find((x) => x.id === state.activePlayerId);
      elTurn.hidden = false;
      elTurn.textContent = ap
        ? 'Сейчас ход: ' + ap.name + (ap.id === playerId ? ' (вы)' : '')
        : 'Сейчас ход';
    } else {
      elTurn.hidden = true;
      elTurn.textContent = '';
    }

    renderDealer(state);
    renderPlayers(state);
    renderList(state);
  }

  const socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
  });

  socket.on('connect_error', () => {
    showError('Нет соединения с сервером.');
  });

  socket.on('game-error', (payload) => {
    showError((payload && payload.message) || 'Ошибка');
  });

  socket.on('room-state-update', (state) => {
    if (!state) {
      showError('Комната закрыта');
      setTimeout(() => {
        window.location.href = '/';
      }, 900);
      return;
    }
    showError('');
    applyUi(state);
  });

  socket.on('next-turn', (payload) => {
    if (lastState && payload && 'activePlayerId' in payload) {
      lastState.activePlayerId = payload.activePlayerId;
      applyUi(lastState);
    }
  });

  socket.on('dealer-turn', () => {
    elStatus.textContent = 'Ход дилера…';
  });

  socket.on('connect', () => {
    showError('');
    socket.emit(
      'rejoin-room',
      { roomCode: roomCode, playerId: playerId, playerName: playerName },
      (res) => {
        if (!res || !res.ok) {
          showError((res && res.error) || 'Не удалось войти в комнату');
          setTimeout(() => {
            window.location.href = '/?join=' + encodeURIComponent(roomCode);
          }, 1200);
        }
      }
    );
  });

  btnCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      btnCopy.textContent = 'Скопировано';
      setTimeout(() => {
        btnCopy.textContent = 'Копировать код';
      }, 900);
    } catch {
      btnCopy.textContent = 'Код: ' + roomCode;
    }
  });

  btnLeave.addEventListener('click', () => {
    socket.emit('leave-room');
    localStorage.removeItem(LS_ID);
    localStorage.removeItem(LS_ROOM);
    window.location.href = '/';
  });

  btnStart.addEventListener('click', () => {
    showError('');
    socket.emit('start-game', { roomCode: roomCode });
  });

  btnNew.addEventListener('click', () => {
    showError('');
    socket.emit('restart-round', { roomCode: roomCode });
  });

  btnHit.addEventListener('click', () => {
    showError('');
    socket.emit('hit', { roomCode: roomCode });
  });

  btnStand.addEventListener('click', () => {
    showError('');
    socket.emit('stand', { roomCode: roomCode });
  });
})();
