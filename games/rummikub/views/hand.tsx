import './style.css';
import { useEffect, useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { RkView } from '../game.js';
import { canAppend, decode, isValidMeld, meldValue } from '../lib.js';
import { Melds, TileFace } from './parts.js';

export default function HandView({ view, over, move }: GameViewProps<RkView>) {
  const [selected, setSelected] = useState<number[]>([]); // tile ids, in tap order
  const [staged, setStaged] = useState<{ melds: number[][]; appends: { meld: number; tile: number }[] }>({
    melds: [],
    appends: [],
  });

  useEffect(() => {
    setSelected([]);
    setStaged({ melds: [], appends: [] });
  }, [view.turn]);

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
  const stagedTiles = [...staged.melds.flat(), ...staged.appends.map((a) => a.tile)];
  const rack = [...view.rack]
    .filter((id) => !stagedTiles.includes(id))
    .sort((a, b) => {
      const ta = decode(a);
      const tb = decode(b);
      return ta.c - tb.c || ta.n - tb.n || a - b;
    });

  const iOpened = view.melded[view.myIndex] === true;
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
      {/* append: select exactly one tile, then pick a compatible set below */}
      {myTurn && iOpened && selected.length === 1 && (
        <div className="rk-appendbar">
          {view.melds.map((_, i) =>
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
          )}
        </div>
      )}

      {staged.melds.length > 0 && (
        <div className="rk-staged">
          {staged.melds.map((m, i) => (
            <span key={i} className="rk-meld staged">
              {m.map((id) => (
                <TileFace key={id} id={id} />
              ))}
            </span>
          ))}
        </div>
      )}
      {staged.appends.length > 0 && (
        <p className="rk-hint">{staged.appends.length} tile(s) staged onto table sets</p>
      )}

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
      {myTurn && !iOpened && stagedTiles.length > 0 && stagedValue < 30 && (
        <p className="rk-hint">opening needs 30+ points of new sets (you have {stagedValue})</p>
      )}
    </div>
  );
}
