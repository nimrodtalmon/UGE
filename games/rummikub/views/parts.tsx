import { COLOR_HEX, decode } from '../lib.js';
import type { RkView } from '../game.js';

export function TileFace({ id, selected, onTap }: { id: number; selected?: boolean; onTap?: () => void }) {
  const t = decode(id);
  return (
    <button
      className={selected ? 'rk-tile sel' : 'rk-tile'}
      style={{ color: t.joker ? '#a03de4' : COLOR_HEX[t.c] }}
      disabled={!onTap}
      onClick={onTap}
    >
      {t.joker ? '☺' : t.n}
    </button>
  );
}

export function Melds(props: { view: RkView; onTapMeld?: (i: number) => void; big?: boolean }) {
  const { view } = props;
  return (
    <div className={props.big ? 'rk-melds big' : 'rk-melds'}>
      {view.melds.map((meld, i) => (
        <button
          key={i}
          className={props.onTapMeld ? 'rk-meld tappable' : 'rk-meld'}
          disabled={!props.onTapMeld}
          onClick={() => props.onTapMeld?.(i)}
        >
          {meld.map((id) => (
            <TileFace key={id} id={id} />
          ))}
        </button>
      ))}
      {view.melds.length === 0 && <p className="rk-empty">no sets on the table yet</p>}
    </div>
  );
}
