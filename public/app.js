(function () {
  const LS_NAME = 'bj_player_name';
  const LS_ID = 'bj_player_id';
  const LS_ROOM = 'bj_room_code';

  const nameInput = document.getElementById('playerName');
  const roomInput = document.getElementById('roomCode');
  const btnCreate = document.getElementById('btnCreate');
  const btnJoin = document.getElementById('btnJoin');
  const errBox = document.getElementById('homeError');

  const params = new URLSearchParams(window.location.search);
  const joinPrefill = (params.get('join') || '').trim().toUpperCase();
  if (joinPrefill) {
    roomInput.value = joinPrefill;
  }

  const savedName = localStorage.getItem(LS_NAME) || '';
  if (savedName) {
    nameInput.value = savedName;
  }

  function showError(text) {
    if (!text) {
      errBox.hidden = true;
      errBox.textContent = '';
      return;
    }
    errBox.hidden = false;
    errBox.textContent = text;
  }

  const socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
  });

  socket.on('connect_error', () => {
    showError('Не удалось подключиться к серверу. Проверьте, что backend запущен.');
  });

  function goToRoom(roomCode, playerId) {
    localStorage.setItem(LS_ROOM, roomCode);
    localStorage.setItem(LS_ID, playerId);
    const name = String(nameInput.value || '').trim();
    localStorage.setItem(LS_NAME, name);
    window.location.href = '/room.html?code=' + encodeURIComponent(roomCode);
  }

  btnCreate.addEventListener('click', () => {
    showError('');
    const playerName = String(nameInput.value || '').trim();
    if (!playerName) {
      showError('Имя не введено');
      return;
    }
    btnCreate.disabled = true;
    btnJoin.disabled = true;
    socket.emit('create-room', { playerName }, (res) => {
      btnCreate.disabled = false;
      btnJoin.disabled = false;
      if (!res || !res.ok) {
        showError((res && res.error) || 'Не удалось создать комнату');
        return;
      }
      goToRoom(res.roomCode, res.playerId);
    });
  });

  btnJoin.addEventListener('click', () => {
    showError('');
    const playerName = String(nameInput.value || '').trim();
    const roomCode = String(roomInput.value || '').trim().toUpperCase();
    if (!playerName) {
      showError('Имя не введено');
      return;
    }
    if (!roomCode) {
      showError('Введите код комнаты');
      return;
    }
    btnCreate.disabled = true;
    btnJoin.disabled = true;
    socket.emit('join-room', { roomCode, playerName }, (res) => {
      btnCreate.disabled = false;
      btnJoin.disabled = false;
      if (!res || !res.ok) {
        showError((res && res.error) || 'Не удалось войти в комнату');
        return;
      }
      goToRoom(res.roomCode, res.playerId);
    });
  });
})();
