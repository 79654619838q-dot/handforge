// Командная игра — этапы 11–12 ТЗ. Не начата намеренно: сначала стабильный одиночный режим (п.36).
// Состояния комнаты зафиксированы заранее, чтобы RoundManager и HUD уже знали о них.
export const ROOM = { WAITING: 'WAITING', READY: 'READY', PLAYING: 'PLAYING', FINISHED: 'FINISHED' };

export class LobbyManager {
  constructor(game) { this.game = game; }
}
