import * as migration_20250415_init from './20250415_init'

export const migrations = [
  {
    up: migration_20250415_init.up,
    down: migration_20250415_init.down,
    name: '20250415_init',
  },
]
