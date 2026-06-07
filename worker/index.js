// ============================================================
// game.in-9.com — Worker entry + GameRoom Durable Object
//
// 정적 자산(보드/포털)은 그대로 ASSETS 바인딩이 서빙하고,
// /api/room/:code 경로만 워커가 가로채 WebSocket 으로 방(Durable Object)에 연결한다.
// 방은 친구끼리 코드로 들어오는 1:1 장기 대전용. 서버는 "심판"이 아니라
// "중계 + 기록"만 한다(수 검증은 클라가 이미 가진 규칙 엔진에 맡김).
//   - 첫 입장 = cho(초, 선공/방장), 둘째 = han(한)
//   - playerId(localStorage)로 재접속 시 같은 편 복구
//   - 모든 수(move)를 저장 → 재접속/새로고침 시 전체 리플레이로 동기화
// SQLite 기반 DO(new_sqlite_classes) 라 Workers 무료 플랜에서 과금 없음.
// ============================================================

const ROOM_PATH = /^\/api\/room\/([A-Za-z0-9]{1,12})$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(ROOM_PATH);
    if (m) {
      const code = m[1].toUpperCase();
      const id = env.ROOMS.idFromName(code);
      const stub = env.ROOMS.get(id);
      return stub.fetch(request);
    }
    // 그 외 모든 경로는 정적 자산(또는 자산의 404)으로 위임
    return env.ASSETS.fetch(request);
  },
};

const OTHER = (side) => (side === 'cho' ? 'han' : 'cho');

export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  // --- storage helpers -------------------------------------------------
  async loadPlayers() {
    return (await this.ctx.storage.get('players')) || { cho: null, han: null };
  }
  async loadMoves() {
    return (await this.ctx.storage.get('moves')) || [];
  }

  attach(ws) {
    try {
      return ws.deserializeAttachment() || {};
    } catch {
      return {};
    }
  }
  socketsForSide(side, except) {
    return this.ctx.getWebSockets().filter(
      (s) => s !== except && this.attach(s).side === side
    );
  }
  broadcast(obj, except) {
    const data = JSON.stringify(obj);
    for (const s of this.ctx.getWebSockets()) {
      if (s === except) continue;
      try {
        s.send(data);
      } catch {
        /* socket gone */
      }
    }
  }
  sendTo(side, obj, except) {
    const data = JSON.stringify(obj);
    for (const s of this.socketsForSide(side, except)) {
      try {
        s.send(data);
      } catch {
        /* ignore */
      }
    }
  }

  // --- WebSocket upgrade ----------------------------------------------
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const url = new URL(request.url);
    let playerId = url.searchParams.get('playerId') || '';
    if (!playerId) playerId = 'anon-' + Math.floor(Math.random() * 1e9).toString(36);

    const players = await this.loadPlayers();

    // 편 배정: 재접속(같은 playerId) 우선, 그다음 빈 자리, 둘 다 차면 만석
    let side = null;
    if (players.cho === playerId) side = 'cho';
    else if (players.han === playerId) side = 'han';
    else if (!players.cho) side = 'cho';
    else if (!players.han) side = 'han';

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    if (!side) {
      // 만석 — 소켓을 받아 알림만 주고 닫는다
      this.ctx.acceptWebSocket(server);
      try {
        server.send(JSON.stringify({ type: 'full' }));
        server.close(4001, 'room full');
      } catch {
        /* ignore */
      }
      return new Response(null, { status: 101, webSocket: client });
    }

    // 자리 확정 후 저장
    if (players[side] !== playerId) {
      players[side] = playerId;
      await this.ctx.storage.put('players', players);
    }

    server.serializeAttachment({ playerId, side });
    this.ctx.acceptWebSocket(server, [side]);

    // 같은 playerId 의 옛 소켓(새로고침 잔여)은 정리 — 새 소켓을 받은 뒤라 'left' 오인 없음
    for (const s of this.ctx.getWebSockets()) {
      if (s === server) continue;
      if (this.attach(s).playerId === playerId) {
        try {
          s.close(4002, 'replaced');
        } catch {
          /* ignore */
        }
      }
    }

    const moves = await this.loadMoves();
    const opponentConnected = this.socketsForSide(OTHER(side), server).length > 0;

    server.send(
      JSON.stringify({ type: 'welcome', side, moves, opponentConnected })
    );
    // 상대에게 입장 알림
    this.sendTo(OTHER(side), { type: 'opponentJoined' }, null);

    return new Response(null, { status: 101, webSocket: client });
  }

  // --- hibernation handlers -------------------------------------------
  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const { side } = this.attach(ws);
    if (!side) return;

    switch (msg.type) {
      case 'move': {
        if (
          !Array.isArray(msg.from) ||
          !Array.isArray(msg.to) ||
          msg.from.length !== 2 ||
          msg.to.length !== 2
        )
          return;
        const moves = await this.loadMoves();
        // 차례 검증: cho 선공 → 짝수번째는 cho, 홀수번째는 han
        const turnSide = moves.length % 2 === 0 ? 'cho' : 'han';
        if (side !== turnSide) return; // 차례 아닌 쪽의 수는 무시(데싱크 방지)
        moves.push({ from: msg.from, to: msg.to });
        await this.ctx.storage.put('moves', moves);
        this.sendTo(OTHER(side), { type: 'move', from: msg.from, to: msg.to }, null);
        break;
      }
      case 'reset': {
        await this.ctx.storage.put('moves', []);
        this.broadcast({ type: 'reset' }, ws); // 상대만(보낸 쪽은 이미 로컬 리셋)
        break;
      }
      case 'resign': {
        this.sendTo(OTHER(side), { type: 'resign', side }, null);
        break;
      }
      case 'leave': {
        // 자리 비움 — 상대가 재입장 가능하도록 해당 편 해제
        const players = await this.loadPlayers();
        if (players[side] === this.attach(ws).playerId) {
          players[side] = null;
          await this.ctx.storage.put('players', players);
        }
        try {
          ws.close(1000, 'left');
        } catch {
          /* ignore */
        }
        break;
      }
      case 'ping':
        try {
          ws.send(JSON.stringify({ type: 'pong' }));
        } catch {
          /* ignore */
        }
        break;
    }
  }

  async webSocketClose(ws) {
    const { side } = this.attach(ws);
    if (!side) return;
    // 해당 편에 남은 소켓이 없을 때만 '상대 나감' 알림(새로고침/중복접속은 제외)
    if (this.socketsForSide(side, ws).length === 0) {
      this.sendTo(OTHER(side), { type: 'opponentLeft' }, null);
    }
  }

  async webSocketError(ws) {
    // close 와 동일 처리
    try {
      await this.webSocketClose(ws);
    } catch {
      /* ignore */
    }
  }
}
