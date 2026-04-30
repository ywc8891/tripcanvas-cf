import * as migration_20260417_064855 from './20260417_064855';
import * as migration_20260423_044329 from './20260423_044329';
import * as migration_20260424_080945 from './20260424_080945';

export const migrations = [
  {
    up: migration_20260417_064855.up,
    down: migration_20260417_064855.down,
    name: '20260417_064855',
  },
  {
    up: migration_20260423_044329.up,
    down: migration_20260423_044329.down,
    name: '20260423_044329',
  },
  {
    up: migration_20260424_080945.up,
    down: migration_20260424_080945.down,
    name: '20260424_080945'
  },
];
