import { LastCellView, MinesView, DoorsView, UniqueFieldView } from './field.js';
import { TimeView, MemoryView, CenterView } from './flat.js';
import { ShootView, BombView, CardsView, RouletteView } from './extra.js';

export const VIEWS = { lastcell: LastCellView, doors: DoorsView, time: TimeView, mines: MinesView, memory: MemoryView, center: CenterView, unique: UniqueFieldView, shoot: ShootView, bomb: BombView, cards: CardsView, roulette: RouletteView };
