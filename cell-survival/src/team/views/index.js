import { LastCellView, MinesView, DoorsView } from './field.js';
import { TimeView, MemoryView, CenterView, UniqueView } from './flat.js';
import { ShootView, BombView, CardsView, RouletteView } from './extra.js';

export const VIEWS = { lastcell: LastCellView, doors: DoorsView, time: TimeView, mines: MinesView, memory: MemoryView, center: CenterView, unique: UniqueView, shoot: ShootView, bomb: BombView, cards: CardsView, roulette: RouletteView };
