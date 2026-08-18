import type { GameDef } from '../../src/shared/plugin.js';

export interface LightsOutState {
  size: number;
  grid: boolean[];
  moves: number;
}

const SIZE = 5;

/** Toggle a cell and its orthogonal neighbours. */
function press(grid: boolean[], i: number): boolean[] {
  const next = [...grid];
  const r = Math.floor(i / SIZE);
  const c = i % SIZE;
  for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const rr = r + dr!;
    const cc = c + dc!;
    if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) {
      next[rr * SIZE + cc] = !next[rr * SIZE + cc];
    }
  }
  return next;
}

const game: GameDef<LightsOutState> = {
  setup({ random }) {
    // scramble by pressing — every board reached this way is solvable
    let grid: boolean[] = Array(SIZE * SIZE).fill(false);
    while (grid.every((on) => !on)) {
      for (let n = 0; n < 12; n++) grid = press(grid, Math.floor(random() * SIZE * SIZE));
    }
    return { size: SIZE, grid, moves: 0 };
  },

  moves: {
    press(state, _ctx, i: number) {
      if (!Number.isInteger(i) || i < 0 || i >= SIZE * SIZE) return state;
      return { ...state, grid: press(state.grid, i), moves: state.moves + 1 };
    },
  },

  isOver(state) {
    return state.grid.every((on) => !on) ? { text: `solved in ${state.moves} moves` } : null;
  },
};

export default game;
