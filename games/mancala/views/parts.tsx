import type { MnView } from '../game.js';
import type { Side } from '../rules.js';
import { firstPit, oppositeOf, storeOf } from '../rules.js';

const DOT_CAP = 12;

function Seeds({ n }: { n: number }) {
  return (
    <>
      <span className="mn-dots">
        {Array.from({ length: Math.min(n, DOT_CAP) }, (_, k) => (
          <i key={k} className="mn-dot" />
        ))}
      </span>
      <span className="mn-count">{n}</span>
    </>
  );
}

/**
 * The classic board: two rows of six pits with a store at each end, always
 * drawn from `perspective`'s side — your row is the near one and your store
 * is on the right, so sowing runs left to right along your row and on round.
 */
export function Board(props: {
  view: MnView;
  perspective: Side;
  onTap?: (pit: number) => void;
  big?: boolean;
}) {
  const { view } = props;
  const me = props.perspective;
  const opp: Side = me === 0 ? 1 : 0;
  const mine = Array.from({ length: 6 }, (_, k) => firstPit(me) + k);
  // The opponent's row runs the other way on screen, so their sowing order
  // continues anticlockwise out of my store and back to my first pit.
  const theirs = Array.from({ length: 6 }, (_, k) => firstPit(opp) + 5 - k);
  const last = view.last;

  const marks = (pit: number): string => {
    const out: string[] = [];
    if (last) {
      if (last.path.includes(pit)) out.push('lit');
      if (last.land === pit) out.push('land');
      if (last.captured > 0 && (pit === last.land || pit === oppositeOf(last.land))) out.push('cap');
    }
    return out.join(' ');
  };

  const pit = (p: number, col: number, row: number, own: boolean) => {
    const n = view.pits[p] ?? 0;
    const live = own && !!props.onTap && n > 0;
    return (
      <button
        key={p}
        data-pit={p}
        className={`mn-pit ${own ? 'own' : 'far'} ${live ? 'live' : ''} ${marks(p)}`}
        style={{ gridColumn: col, gridRow: row }}
        disabled={!live}
        onClick={() => props.onTap?.(p)}
        aria-label={`pit with ${n} seeds`}
      >
        <Seeds n={n} />
      </button>
    );
  };

  const store = (side: Side, col: number, which: string) => (
    <div className={`mn-store ${which} ${marks(storeOf(side))}`} style={{ gridColumn: col, gridRow: '1 / 3' }}>
      <span className="mn-store-name">{view.names[side]}</span>
      <Seeds n={view.pits[storeOf(side)] ?? 0} />
    </div>
  );

  return (
    <div className={props.big ? 'mn-board big' : 'mn-board'}>
      {store(opp, 1, 'far')}
      {theirs.map((p, i) => pit(p, i + 2, 1, false))}
      {store(me, 8, 'own')}
      {mine.map((p, i) => pit(p, i + 2, 2, true))}
    </div>
  );
}
