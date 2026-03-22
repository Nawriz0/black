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
  const elSpectator = document.getElementById('spectatorBadge');
  const elErr = document.getElementById('roomError');
  const elStatus = document.getElementById('gameStatus');
  const elTurn = document.getElementById('turnHint');
  const elAutoRound = document.getElementById('autoRoundHint');
  const elUxBanner = document.getElementById('uxBanner');
  const elDealerCards = document.getElementById('dealerCards');
  const elDealerScore = document.getElementById('dealerScore');
  const elPlayersGrid = document.getElementById('playersGrid');
  const elList = document.getElementById('playerList');
  const elHostControls = document.getElementById('hostControls');
  const elPlayerControls = document.getElementById('playerControls');
  const elBettingPanel = document.getElementById('bettingPanel');
  const elBettingHint = document.getElementById('bettingHint');
  const elMyChips = document.getElementById('myChipsDisplay');
  const elBetInput = document.getElementById('betInput');
  const elBetStatus = document.getElementById('betStatus');
  const btnCopy = document.getElementById('btnCopyCode');
  const btnLeave = document.getElementById('btnLeave');
  const btnStartBetting = document.getElementById('btnStartBetting');
  const btnStartGame = document.getElementById('btnStartGame');
  const btnNew = document.getElementById('btnNewRound');
  const btnPlaceBet = document.getElementById('btnPlaceBet');
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
  let prevMyChips = null;
  let autoRoundInterval = null;
  let amISpectator = false;

  function clearAutoRoundCountdown() {
    if (autoRoundInterval) {
      clearInterval(autoRoundInterval);
      autoRoundInterval = null;
    }
    if (elAutoRound) {
      elAutoRound.hidden = true;
      elAutoRound.textContent = '';
    }
  }

  function updateAutoRoundCountdown(state) {
    clearAutoRoundCountdown();
    if (!elAutoRound || !state || state.phase !== 'round_end' || !state.autoNextRoundAt) {
      return;
    }
    const tick = function () {
      const st = lastState;
      if (!st || st.phase !== 'round_end' || !st.autoNextRoundAt) {
        clearAutoRoundCountdown();
        return;
      }
      const sec = Math.max(0, Math.ceil((st.autoNextRoundAt - Date.now()) / 1000));
      elAutoRound.textContent = 'Следующий раунд (ставки) через ' + sec + ' с';
      elAutoRound.hidden = false;
    };
    tick();
    autoRoundInterval = setInterval(tick, 400);
  }

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

  function cardHtml(card, small, index) {
    const i = typeof index === 'number' ? index : 0;
    const delay = (i * 0.055).toFixed(3);
    const sm = small ? ' card--small' : '';
    const style = ' style="--deal-delay:' + delay + 's"';
    if (card && card.hidden) {
      return (
        '<div class="playing-card"><div class="card card--back' +
        sm +
        ' card--deal"' +
        style +
        ' aria-label="Скрытая карта"></div></div>'
      );
    }
    const rank = String(card.rank);
    const suit = String(card.suit);
    return (
      '<div class="playing-card"><div class="card ' +
      suitClass(suit) +
      sm +
      ' card--deal"' +
      style +
      '"><div class="card__inner"><div class="card__rank">' +
      rank +
      '</div><div class="card__suit">' +
      suit +
      '</div><div class="card__rank">' +
      rank +
      '</div></div></div></div>'
    );
  }

  function renderDealer(state) {
    const d = state.dealer;
    elDealerCards.innerHTML = (d.cards || []).map((c, i) => cardHtml(c, false, i)).join('');
    if (state.phase === 'round_end' && d.fullValue != null) {
      elDealerScore.textContent = 'Очки: ' + d.fullValue;
    } else {
      elDealerScore.textContent = d.valueShown != null ? 'Видно: ' + d.valueShown : '';
    }
  }

  function renderPlayers(state) {
    elPlayersGrid.innerHTML = '';
    const activeId = state.activePlayerId;
    const phase = state.phase;
    (state.players || []).forEach((p) => {
      const isMe = p.id === playerId;
      const isActive = p.id === activeId && phase === 'playing';
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
      if (p.isSpectator) bits.push('наблюдатель');
      if (p.online === false) bits.push('офлайн');
      bits.push('фишки: ' + p.chips);
      if (phase === 'betting') {
        bits.push('ставка: ' + p.roundBet + (p.betReady ? ' ✓' : ''));
      } else if (phase === 'playing' || phase === 'round_end') {
        if (p.inRound) {
          bits.push('в игре: ' + p.roundStake);
        } else {
          bits.push('вне раунда');
        }
      }
      meta.textContent = bits.join(' • ');
      left.appendChild(name);
      left.appendChild(meta);
      const right = document.createElement('div');
      right.className = 'player-panel__meta';
      if (p.inRound || (phase !== 'playing' && phase !== 'round_end')) {
        right.textContent = 'Очки: ' + String(p.value);
      } else {
        right.textContent = '—';
      }
      head.appendChild(left);
      head.appendChild(right);
      const row = document.createElement('div');
      row.className = 'cards-row';
      if (phase === 'playing' || phase === 'round_end') {
        if (!p.inRound) {
          row.innerHTML =
            '<div class="player-panel__skip">Нет карт (не участвуете в раунде)</div>';
        } else {
          row.innerHTML = (p.hand || []).map((c, i) => cardHtml(c, true, i)).join('');
        }
      } else {
        row.innerHTML = (p.hand || []).map((c, i) => cardHtml(c, true, i)).join('');
      }
      const foot = document.createElement('div');
      foot.className = 'player-panel__foot';
      if (p.bust && p.inRound) {
        const t = document.createElement('span');
        t.className = 'tag tag--bad';
        t.textContent = 'Перебор';
        foot.appendChild(t);
      }
      if (phase === 'round_end' && p.roundResult && p.inRound) {
        const t = document.createElement('span');
        const r = p.roundResult;
        t.className =
          r === 'lose' || r === 'bust' ? 'tag tag--bad' : r === 'push' ? 'tag' : 'tag tag--good';
        t.textContent = OUTCOME_RU[r] || r;
        foot.appendChild(t);
      }
      if (phase === 'round_end' && p.inRound && p.lastRoundDelta != null) {
        const d = document.createElement('span');
        d.className = 'tag';
        const v = p.lastRoundDelta;
        d.textContent = (v >= 0 ? '+' : '') + v + ' фишек';
        if (v > 0) d.classList.add('tag--good');
        if (v < 0) d.classList.add('tag--bad');
        foot.appendChild(d);
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
      if (p.isSpectator) bits.push('наблюдатель');
      if (p.online === false) bits.push('офлайн');
      s.textContent = bits.join(' • ');
      a.appendChild(n);
      a.appendChild(s);
      const chips = document.createElement('span');
      chips.className = 'player-list__chips';
      chips.textContent = String(p.chips);
      li.appendChild(a);
      li.appendChild(chips);
      elList.appendChild(li);
    });
  }

  function statusText(state) {
    if (state.phase === 'lobby') {
      return 'Лобби';
    }
    if (state.phase === 'betting') {
      return 'Приём ставок';
    }
    if (state.phase === 'playing') {
      return 'Раунд идёт';
    }
    if (state.phase === 'round_end') {
      return 'Раунд завершён';
    }
    return '—';
  }

  function syncBetChipButtons(state) {
    const me = (state.players || []).find((x) => x.id === playerId);
    if (!me || state.phase !== 'betting') {
      document.querySelectorAll('[data-bet]').forEach((btn) => {
        btn.classList.remove('is-selected');
      });
      return;
    }
    const raw = String(elBetInput.value || '').trim();
    document.querySelectorAll('[data-bet]').forEach((btn) => {
      const d = btn.getAttribute('data-bet');
      const matchPreset = me.betReady && String(me.roundBet) === d;
      const matchInput = raw !== '' && raw === d;
      btn.classList.toggle('is-selected', matchPreset || matchInput);
    });
  }

  function syncBettingPanel(state) {
    const me = (state.players || []).find((x) => x.id === playerId);
    if (!me) {
      return;
    }
    if (prevMyChips !== null && me.chips !== prevMyChips) {
      elMyChips.classList.remove('flash-up', 'flash-down');
      void elMyChips.offsetWidth;
      elMyChips.classList.add(me.chips > prevMyChips ? 'flash-up' : 'flash-down');
    }
    prevMyChips = me.chips;

    elMyChips.textContent = String(me.chips);
    elBetInput.max = String(me.chips);
    if (state.phase === 'betting') {
      elBetInput.value = me.roundBet > 0 ? String(me.roundBet) : '';
      if (me.betReady) {
        elBetStatus.hidden = false;
        elBetStatus.textContent =
          'Ваша ставка зафиксирована (' + me.roundBet + '). Можно изменить до старта.';
      } else {
        elBetStatus.hidden = true;
        elBetStatus.textContent = '';
      }
    }
    syncBetChipButtons(state);
  }

  function updateUxBanner(state) {
    if (!elUxBanner) return;
    const me = (state.players || []).find((x) => x.id === playerId);
    if (state.phase === 'round_end' && me && me.inRound && me.roundResult) {
      elUxBanner.hidden = false;
      const r = me.roundResult;
      elUxBanner.className = 'ux-banner';
      if (r === 'win') {
        elUxBanner.textContent = 'Вы выиграли!';
      } else if (r === 'blackjack') {
        elUxBanner.textContent = 'Блэкджек! Отличная рука.';
      } else if (r === 'lose') {
        elUxBanner.textContent = 'Вы проиграли.';
        elUxBanner.classList.add('ux-banner--lose');
      } else if (r === 'bust') {
        elUxBanner.textContent = 'Перебор. Ставка сгорела.';
        elUxBanner.classList.add('ux-banner--lose');
      } else if (r === 'push') {
        elUxBanner.textContent = 'Ничья. Ставка возвращена.';
        elUxBanner.classList.add('ux-banner--push');
      } else {
        elUxBanner.hidden = true;
      }
    } else {
      elUxBanner.hidden = true;
      elUxBanner.textContent = '';
    }
  }

  function updateTurnHint(state) {
    const phase = state.phase;
    const me = (state.players || []).find((x) => x.id === playerId);
    if (phase === 'round_end') {
      elTurn.hidden = true;
      return;
    }
    if (phase === 'playing' && state.activePlayerId) {
      const ap = (state.players || []).find((x) => x.id === state.activePlayerId);
      elTurn.hidden = false;
      if (ap && ap.id === playerId) {
        elTurn.textContent = 'Ваш ход — Hit или Stand';
        elTurn.className = 'pill pill--turn pill--turn-me';
      } else {
        elTurn.textContent = ap ? 'Ожидание: ход ' + ap.name : 'Ожидание хода';
        elTurn.className = 'pill pill--turn';
      }
      return;
    }
    if (phase === 'betting') {
      elTurn.hidden = false;
      if (me && me.betReady) {
        elTurn.textContent = 'Ставка принята. Ожидайте других игроков.';
      } else {
        elTurn.textContent = 'Сделайте ставку';
      }
      elTurn.className = 'pill pill--turn';
      return;
    }
    if (phase === 'lobby') {
      elTurn.hidden = false;
      elTurn.textContent = 'Ожидание приёма ставок';
      elTurn.className = 'pill pill--turn';
      return;
    }
    elTurn.hidden = true;
  }

  function applyUi(state) {
    lastState = state;
    elStatus.textContent = statusText(state);
    elStatus.className = 'pill pill--status';

    // Обновляем статус spectator из state
    const me = (state.players || []).find((x) => x.id === playerId);
    if (me) {
      amISpectator = me.isSpectator || false;
    }

    const isHost = state.hostId === playerId;
    elHost.hidden = !isHost;
    elSpectator.hidden = !amISpectator;

    const inRound = state.phase === 'playing';
    const ended = state.phase === 'round_end';
    const lobby = state.phase === 'lobby';
    const betting = state.phase === 'betting';

    elHostControls.hidden = !isHost;
    btnStartBetting.hidden = !(isHost && lobby);
    btnStartGame.hidden = !(isHost && betting);
    btnNew.hidden = !(isHost && ended);

    if (isHost && betting) {
      btnStartGame.disabled = !state.canStartDeal;
    } else {
      btnStartGame.disabled = false;
    }

    // Скрываем панель ставок для spectators
    elBettingPanel.hidden = !betting || amISpectator;
    if (betting && !amISpectator) {
      elBettingHint.textContent = state.allBetsPlaced
        ? 'Все игроки сделали ставку. Хост может начать игру.'
        : 'Выберите сумму или введите свою, затем нажмите «Поставить». Ставка 0 — пропуск раунда.';
    } else if (betting && amISpectator) {
      elBettingHint.textContent = 'Вы наблюдаете за игрой и не можете делать ставки';
    }

    const myTurn = inRound && state.activePlayerId === playerId;
    const canHitStand = myTurn && me && me.inRound && !amISpectator;
    elPlayerControls.hidden = !canHitStand;
    btnHit.disabled = !canHitStand;
    btnStand.disabled = !canHitStand;

    // Показываем подсказку для spectators
    if (amISpectator) {
      elTurn.hidden = false;
      elTurn.textContent = 'Вы наблюдаете за игрой';
      elTurn.className = 'pill pill--turn';
    } else {
      updateTurnHint(state);
    }

    updateUxBanner(state);
    syncBettingPanel(state);
    updateAutoRoundCountdown(state);
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

  socket.on('update-chips', () => {});

  socket.on('all-bets-placed', () => {
    if (lastState) {
      elStatus.textContent = 'Все ставки приняты';
      elStatus.className = 'pill pill--status';
    }
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
    elStatus.textContent = 'Ход дилера';
    elStatus.className = 'pill pill--status';
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
        } else {
          // Сохраняем статус spectator
          if (res.isSpectator) {
            amISpectator = res.isSpectator;
          }
        }
      }
    );
  });

  document.querySelectorAll('[data-bet]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('data-bet');
      elBetInput.value = v || '';
      if (lastState) {
        syncBetChipButtons(lastState);
      }
    });
  });

  elBetInput.addEventListener('input', () => {
    if (lastState) {
      syncBetChipButtons(lastState);
    }
  });

  btnPlaceBet.addEventListener('click', () => {
    showError('');
    const raw = String(elBetInput.value || '').trim();
    let amount = raw === '' ? 0 : parseInt(raw, 10);
    if (raw !== '' && !Number.isFinite(amount)) {
      showError('Введите целое число');
      return;
    }
    if (amount < 0) {
      showError('Ставка не может быть отрицательной');
      return;
    }
    socket.emit('place-bet', { roomCode: roomCode, amount: amount });
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
    clearAutoRoundCountdown();
    socket.emit('leave-room');
    localStorage.removeItem(LS_ID);
    localStorage.removeItem(LS_ROOM);
    window.location.href = '/';
  });

  btnStartBetting.addEventListener('click', () => {
    showError('');
    socket.emit('start-betting', { roomCode: roomCode });
  });

  btnStartGame.addEventListener('click', () => {
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
