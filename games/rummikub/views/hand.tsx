import './style.css';
import { useEffect, useMemo, useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useTurnBuzz } from '../../../src/shared/gameKit.js';
import type { RkView } from '../game.js';
import { canAppend, decode, displayOrder, isValidMeld, meldValue } from '../lib.js';
import { Melds, TileFace } from './parts.js';

type SortBy = 'color' | 'number';
const sortRack = (ids: number[], by: SortBy) =>
  [...ids].sort((a, b) => {
    const ta = decode(a);
    const tb = decode(b);
    return by === 'color' ? ta.c - tb.c || ta.n - tb.n || a - b : ta.n - tb.n || ta.c - tb.c || a - b;
  });

function SortToggle({ sortBy, setSortBy }: { sortBy: SortBy; setSortBy: (s: SortBy) => void }) {
  return (
    <button className="rk-sort" onClick={() => setSortBy(sortBy === 'color' ? 'number' : 'color')}>
      sort: {sortBy === 'color' ? 'colors' : '1→13'}
    </button>
  );
}

/** Free-form table manipulation: select tiles anywhere, move them between sets. */
function Rearrange(props: {
  view: RkView;
  sortBy: SortBy;
  setSortBy: (s: SortBy) => void;
  move: GameViewProps['move'];
  onCancel: () => void;
}) {
  const { view } = props;
  const [work, setWork] = useState<number[][]>(() => view.melds.map((m) => [...m]));
  const [selected, setSelected] = useState<number[]>([]);
  // tiles that were on the table when editing began — they may move, never leave
  const original = useMemo(() => new Set<number>(view.melds.flat()), []);

  const inWork = new Set(work.flat());
  const rack = sortRack(view.rack!.filter((id) => !inWork.has(id)), props.sortBy);

  const toggle = (id: number) =>
    setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));

  const moveSelected = (target: number | 'new') => {
    setWork((w) => {
      const next = w.map((m) => m.filter((id) => !selected.includes(id)));
      if (target === 'new') next.push([...selected]);
      else next[target] = [...next[target]!, ...selected];
      return next.filter((m) => m.length > 0);
    });
    setSelected([]);
  };

  const allValid = work.every((m) => isValidMeld(m));
  const playedFromRack = work.flat().filter((id) => !original.has(id)).length;
  const canDone = allValid && playedFromRack >= 1;

  return (
    <>
      <p className="rk-turn mine">rearranging the table</p>
      <div className="rk-melds">
        {work.map((m, i) => (
          <span key={i} className={isValidMeld(m) ? 'rk-meld work' : 'rk-meld work bad'}>
            {displayOrder(m).map((id) => (
              <TileFace key={id} id={id} selected={selected.includes(id)} onTap={() => toggle(id)} />
            ))}
            {/* always rendered, just disabled: a drop target appearing on
                selection would rewrap the sets and move the rack below */}
            <button className="rk-drop" disabled={selected.length === 0} onClick={() => moveSelected(i)}>
              +
            </button>
          </span>
        ))}
        {work.length === 0 && <p className="rk-empty">no sets on the table yet</p>}
      </div>
      {/* always rendered, just disabled — it sits right above the rack */}
      <button className="rk-append" disabled={selected.length === 0} onClick={() => moveSelected('new')}>
        new set from selected ({selected.length})
      </button>

      <SortToggle sortBy={props.sortBy} setSortBy={props.setSortBy} />
      <div className="rk-rack">
        {rack.map((id) => (
          <TileFace key={id} id={id} selected={selected.includes(id)} onTap={() => toggle(id)} />
        ))}
      </div>

      <div className="rk-actions">
        <button className="primary" disabled={!canDone} onClick={() => props.move('rearrange', { table: work })}>
          Done
        </button>
        <button onClick={props.onCancel}>Cancel</button>
      </div>
      {/* one reserved line for both warnings, so Done/Cancel never move */}
      <p className="rk-hint two">
        {!allValid
          ? "sets in red aren't valid yet — every set must end up valid"
          : playedFromRack === 0
            ? 'play at least one tile from your rack'
            : ' '}
      </p>
    </>
  );
}

export default function HandView({ view, over, move }: GameViewProps<RkView>) {
  const [selected, setSelected] = useState<number[]>([]); // tile ids, in tap order
  const [staged, setStaged] = useState<{ melds: number[][]; appends: { meld: number; tile: number }[] }>({
    melds: [],
    appends: [],
  });
  const [sortBy, setSortBy] = useState<SortBy>('color');
  const [rearranging, setRearranging] = useState(false);

  useEffect(() => {
    setSelected([]);
    setStaged({ melds: [], appends: [] });
    setRearranging(false);
  }, [view.turn]);
  useTurnBuzz(!over && view.rack !== null && view.myIndex === view.turn);

  if (over) {
    return (
      <div className="rk-screen">
        <p className="rk-over">{over.text}</p>
      </div>
    );
  }
  if (view.rack === null) {
    return (
      <div className="rk-screen">
        <p className="rk-turn">Rummikub in progress — you're watching.</p>
      </div>
    );
  }

  const myTurn = view.myIndex === view.turn;
  const iOpened = view.melded[view.myIndex] === true;

  if (rearranging && myTurn && iOpened) {
    return (
      <div className="rk-screen rk-phone">
        <Rearrange view={view} sortBy={sortBy} setSortBy={setSortBy} move={move} onCancel={() => setRearranging(false)} />
      </div>
    );
  }

  const stagedTiles = [...staged.melds.flat(), ...staged.appends.map((a) => a.tile)];
  const rack = sortRack(view.rack.filter((id) => !stagedTiles.includes(id)), sortBy);

  const stagedValue = staged.melds.reduce((sum, m) => sum + meldValue(m), 0);
  const openingOk = iOpened || (staged.appends.length === 0 && stagedValue >= 30);
  const canLay = selected.length >= 3 && isValidMeld(selected);
  const canSubmit = myTurn && stagedTiles.length > 0 && openingOk;

  // simulate appends so canAppend checks against the staged shape of the table
  const meldWithStaged = (i: number) => [
    ...(view.melds[i] ?? []),
    ...staged.appends.filter((a) => a.meld === i).map((a) => a.tile),
  ];

  const toggle = (id: number) =>
    setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));

  return (
    <div className="rk-screen rk-phone">
      <p className={myTurn ? 'rk-turn mine' : 'rk-turn'}>
        {myTurn
          ? iOpened
            ? 'your turn'
            : `your turn — open with 30+ (staged: ${stagedValue})`
          : `${view.names[view.turn]}'s turn…`}
      </p>

      <Melds view={view} />
      {/* append: select exactly one tile, then pick a compatible set below.
          The bar keeps its slot all turn — buttons appearing on a tile tap
          would shove the rack down under the next finger. */}
      {myTurn && iOpened && (
        <div className="rk-appendbar">
          {selected.length === 1
            ? view.melds.map((_, i) =>
                canAppend(meldWithStaged(i), selected[0]!) ? (
                  <button
                    key={i}
                    className="rk-append"
                    onClick={() => {
                      setStaged((s) => ({ ...s, appends: [...s.appends, { meld: i, tile: selected[0]! }] }));
                      setSelected([]);
                    }}
                  >
                    add to set {i + 1}
                  </button>
                ) : null,
              )
            : null}
        </div>
      )}

      {/* same idea: one fixed-height staged strip, scrolled sideways when full */}
      {myTurn && (
        <div className="rk-staged">
          {staged.melds.map((m, i) => (
            <span key={i} className="rk-meld staged">
              {m.map((id) => (
                <TileFace key={id} id={id} />
              ))}
            </span>
          ))}
          {staged.appends.length > 0 && (
            <span className="rk-hint">+{staged.appends.length} onto table sets</span>
          )}
        </div>
      )}

      <SortToggle sortBy={sortBy} setSortBy={setSortBy} />
      <div className="rk-rack">
        {rack.map((id) => (
          <TileFace key={id} id={id} selected={selected.includes(id)} onTap={myTurn ? () => toggle(id) : undefined} />
        ))}
      </div>

      <div className="rk-actions">
        <button
          disabled={!myTurn || !canLay}
          onClick={() => {
            setStaged((s) => ({ ...s, melds: [...s.melds, selected] }));
            setSelected([]);
          }}
        >
          Lay as set
        </button>
        {myTurn && iOpened && view.melds.length > 0 && stagedTiles.length === 0 && (
          <button
            onClick={() => {
              setSelected([]);
              setRearranging(true);
            }}
          >
            Rearrange table
          </button>
        )}
        <button
          disabled={stagedTiles.length === 0}
          onClick={() => {
            setStaged({ melds: [], appends: [] });
            setSelected([]);
          }}
        >
          Undo
        </button>
        {stagedTiles.length > 0 ? (
          <button className="primary" disabled={!canSubmit} onClick={() => move('play', staged)}>
            End turn
          </button>
        ) : (
          <button className="primary" disabled={!myTurn} onClick={() => move('draw')}>
            {view.poolCount > 0 ? 'Draw' : 'Pass'}
          </button>
        )}
      </div>
      {/* reserved for the whole turn: this line grows to two lines, and it
          would drag the buttons above it up as it appeared */}
      {myTurn && !iOpened && (
        <p className="rk-hint two">
          {stagedTiles.length > 0 && stagedValue < 30
            ? `opening needs 30+ points of new sets (you have ${stagedValue})`
            : ' '}
        </p>
      )}
    </div>
  );
}
