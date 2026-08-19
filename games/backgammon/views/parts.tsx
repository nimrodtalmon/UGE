import type { BgView, Seat } from '../game.js';

/** Point order per row, from seat 0's perspective (home board bottom-right). */
const TOP_HALF = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const BOTTOM_HALF = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

const DIE_GLYPH = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/** The dice this turn: remaining ones while moving, the greyed pair otherwise. */
export function Dice({ view }: { view: BgView }) {
  if (!view.rolled) return <div className="bg-dice" />;
  const moving = view.phase === 'move' && view.dice.length > 0;
  const shown: number[] = moving ? view.dice : [view.rolled[0], view.rolled[1]];
  return (
    <div className="bg-dice">
      {shown.map((d, i) => (
        <span key={i} className={moving ? 'bg-die' : 'bg-die spent'}>
          {DIE_GLYPH[d - 1] ?? String(d)}
        </span>
      ))}
    </div>
  );
}

/** A stack of checkers; sign of `count` picks the owner. Capped at 5 discs,
 *  the innermost one carrying the true count beyond that. */
function Stack({ count, dir }: { count: number; dir: 'down' | 'up' }) {
  if (count === 0) return null;
  const owner: Seat = count > 0 ? 0 : 1;
  const n = Math.abs(count);
  const discs = Math.min(n, 5);
  return (
    <span className={`bg-stack ${dir}`}>
      {Array.from({ length: discs }, (_, i) => (
        <span key={i} className={owner === 0 ? 'bg-ck w' : 'bg-ck b'}>
          {i === discs - 1 && n > 5 ? n : ''}
        </span>
      ))}
    </span>
  );
}

function Point(props: {
  index: number;
  count: number;
  dir: 'down' | 'up';
  odd: boolean;
  mark: '' | 'sel' | 'src' | 'tgt';
  onTap?: (p: number) => void;
}) {
  const cls = ['bg-point', props.dir, props.odd ? 'odd' : 'even'];
  if (props.mark) cls.push(props.mark);
  return (
    <button
      className={cls.join(' ')}
      disabled={!props.onTap}
      onClick={() => props.onTap?.(props.index)}
    >
      <span className="bg-tri" />
      <Stack count={props.count} dir={props.dir} />
    </button>
  );
}

/**
 * The board, shared by table (big, display-only) and hand (interactive).
 * `perspective` puts that seat's home board bottom-right; `onTap` receives a
 * point index or -1 for the viewer's bar; `onOff` fires on the bear-off tray.
 */
export function Board(props: {
  view: BgView;
  perspective: Seat;
  big?: boolean;
  selected?: number | null;
  sources?: readonly number[];
  targets?: ReadonlyMap<number, number>;
  canOff?: boolean;
  onTap?: (from: number) => void;
  onOff?: () => void;
}) {
  const { view, perspective: me } = props;
  const opp = me === 0 ? 1 : 0;
  const top = me === 0 ? TOP_HALF : BOTTOM_HALF;
  const bottom = me === 0 ? BOTTOM_HALF : TOP_HALF;

  const markOf = (p: number): '' | 'sel' | 'src' | 'tgt' => {
    if (props.targets?.has(p)) return 'tgt';
    if (props.selected === p) return 'sel';
    if (props.sources?.includes(p)) return 'src';
    return '';
  };

  const cell = (p: number, dir: 'down' | 'up') => (
    <Point
      key={p}
      index={p}
      count={view.points[p] ?? 0}
      dir={dir}
      odd={p % 2 === 1}
      mark={markOf(p)}
      onTap={props.onTap}
    />
  );

  const barMark = props.selected === -1 ? ' sel' : props.sources?.includes(-1) ? ' src' : '';

  return (
    <div className={props.big ? 'bg-board big' : 'bg-board'}>
      <div className="bg-points">
        <div className="bg-row">
          {top.slice(0, 6).map((p) => cell(p, 'down'))}
          <div className="bg-bar-cell">
            <Stack count={view.bar[opp] * (opp === 0 ? 1 : -1)} dir="down" />
          </div>
          {top.slice(6).map((p) => cell(p, 'down'))}
        </div>
        <div className="bg-row">
          {bottom.slice(0, 6).map((p) => cell(p, 'up'))}
          <button
            className={`bg-bar-cell${barMark}`}
            disabled={!props.onTap}
            onClick={() => props.onTap?.(-1)}
          >
            <Stack count={view.bar[me] * (me === 0 ? 1 : -1)} dir="up" />
          </button>
          {bottom.slice(6).map((p) => cell(p, 'up'))}
        </div>
      </div>
      <div className="bg-trays">
        <div className="bg-tray">
          <span className={opp === 0 ? 'bg-ck w mini' : 'bg-ck b mini'} />
          <span>{view.borneOff[opp]}</span>
        </div>
        <button
          className={props.canOff ? 'bg-tray tgt' : 'bg-tray'}
          disabled={!(props.canOff && props.onOff)}
          onClick={() => props.onOff?.()}
        >
          <span className={me === 0 ? 'bg-ck w mini' : 'bg-ck b mini'} />
          <span>{view.borneOff[me]}</span>
        </button>
      </div>
    </div>
  );
}
