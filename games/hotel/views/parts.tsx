import type { CSSProperties } from 'react';
import type { HotelView } from '../game.js';
import type { SlotKind } from '../sim.js';
import { FACILITY_UPKEEP, SPECS, isRoomKind, money } from '../sim.js';

/** Pieces shared by the phone and the table screen. Nothing here acts on its
 *  own: handlers are optional, so the table renders the very same tower. */

export function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Cash · week · reputation · last week's occupancy. Heights are fixed in CSS
 *  so numbers changing never nudges the tower under the player's thumb. */
export function Stats({ view, big }: { view: HotelView; big?: boolean }) {
  const last = view.last;
  const weekText = view.relaxed ? `Week ${view.week}` : `Week ${view.week}/${view.weeks}`;
  return (
    <div className={big ? 'ho-stats big' : 'ho-stats'}>
      <div className="ho-stat">
        <span className="ho-stat-label">cash</span>
        <strong className={view.cash < 0 ? 'ho-stat-value ho-bad' : 'ho-stat-value'}>
          {money(view.cash)}
        </strong>
        <span className="ho-stat-sub">
          {view.ad ? '📣 campaign booked' : `−${money(view.costs.total)}/wk upkeep`}
        </span>
      </div>

      <div className="ho-stat">
        <span className="ho-stat-label">calendar</span>
        <strong className="ho-stat-value">{weekText}</strong>
        <span className="ho-stat-sub">
          {view.season.icon} {view.season.label} ×{view.season.factor.toFixed(2)}
        </span>
      </div>

      <div className="ho-stat">
        <span className="ho-stat-label">reputation</span>
        <strong className="ho-stat-value">{Math.round(view.reputation)}</strong>
        <div className="ho-bar">
          <div
            className="ho-bar-fill"
            style={{ '--ho-fill': pct(view.reputation / 100) } as CSSProperties}
          />
        </div>
      </div>

      <div className="ho-stat">
        <span className="ho-stat-label">last week</span>
        <strong className="ho-stat-value">{last ? pct(last.occupancy) : '–'}</strong>
        <span className="ho-stat-sub">
          {last ? `${last.occupied}/${last.rooms} rooms · ${last.guests} guests` : 'not open yet'}
        </span>
      </div>
    </div>
  );
}

function SlotCell(props: {
  view: HotelView;
  kind: SlotKind | null;
  onTap?: () => void;
}) {
  const { kind, view } = props;
  if (!kind) {
    const body = <span className="ho-plus">＋</span>;
    return props.onTap ? (
      <button className="ho-slot ho-empty" onClick={props.onTap}>
        {body}
      </button>
    ) : (
      <div className="ho-slot ho-empty">{body}</div>
    );
  }
  const spec = SPECS[kind];
  const sub = isRoomKind(kind) ? `$${view.rates[kind]}/night` : `−$${FACILITY_UPKEEP}/wk`;
  const body = (
    <>
      <span className="ho-slot-icon">{spec.icon}</span>
      <span className="ho-slot-name">{spec.name}</span>
      <span className="ho-slot-sub">{sub}</span>
    </>
  );
  const cls = `ho-slot ho-built ${spec.room ? 'ho-room' : 'ho-fac'}`;
  return props.onTap ? (
    <button className={cls} onClick={props.onTap}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** The hotel itself: newest floor on top, ground floor (with the reception)
 *  resting on the street. Pass onSlot to make the slots tappable. */
export function Tower({
  view,
  onSlot,
}: {
  view: HotelView;
  onSlot?: (floor: number, slot: number) => void;
}) {
  const floors = view.floors.map((floor, index) => ({ floor, index })).reverse();
  return (
    <div className="ho-tower">
      <div className="ho-roof">🏨 {view.roomsBuilt} rooms · {view.beds} beds</div>
      {floors.map(({ floor, index }) => (
        <div className="ho-floor" key={index}>
          <span className="ho-floor-no">{index === 0 ? 'G' : index + 1}</span>
          <div className="ho-slots">
            {index === 0 && (
              <div className="ho-slot ho-reception">
                <span className="ho-slot-icon">⭐</span>
                <span className="ho-slot-name">Reception</span>
                <span className="ho-slot-sub">
                  level {view.receptionLevel}/{view.receptionMax}
                </span>
              </div>
            )}
            {floor.slots.map((kind, slot) => (
              <SlotCell
                key={slot}
                view={view}
                kind={kind}
                onTap={onSlot ? () => onSlot(index, slot) : undefined}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="ho-street" />
    </div>
  );
}

/** Last week's numbers. Always rendered at the same height — an empty card
 *  before the first week, the report after it. */
export function ReportCard({ view }: { view: HotelView }) {
  const last = view.last;
  if (!last) {
    return (
      <div className="ho-report empty">
        <p className="ho-report-hint">
          week 1 hasn't been settled yet — build rooms, set your rates, then play the week
        </p>
      </div>
    );
  }
  const note = last.understaffed
    ? '⚠️ understaffed — guests noticed'
    : last.ad
      ? '📣 the campaign paid for itself?'
      : last.repDelta >= 0
        ? '👍 guests left happy'
        : '👎 reputation slipped';
  return (
    <div className="ho-report">
      <div className="ho-report-head">
        <strong>
          Week {last.week} {last.seasonIcon}
        </strong>
        <span className={last.profit >= 0 ? 'ho-profit ho-good' : 'ho-profit ho-bad'}>
          {last.profit >= 0 ? '+' : ''}
          {money(last.profit)}
        </span>
      </div>
      <div className="ho-report-grid">
        <div>
          <span>guests</span>
          <strong>{last.guests}</strong>
        </div>
        <div>
          <span>occupancy</span>
          <strong>{pct(last.occupancy)}</strong>
        </div>
        <div>
          <span>revenue</span>
          <strong>{money(last.revenue)}</strong>
        </div>
        <div>
          <span>costs</span>
          <strong>{money(last.costs)}</strong>
        </div>
      </div>
      <p className="ho-report-note">
        {note} · reputation {last.repDelta >= 0 ? '+' : ''}
        {last.repDelta}
      </p>
    </div>
  );
}

/** The table screen's ledger of the last few weeks. */
export function Ledger({ view }: { view: HotelView }) {
  if (view.log.length === 0) {
    return <p className="ho-ledger-empty">no weeks settled yet</p>;
  }
  return (
    <div className="ho-ledger">
      <div className="ho-ledger-row head">
        <span>wk</span>
        <span>occ</span>
        <span>guests</span>
        <span>revenue</span>
        <span>costs</span>
        <span>profit</span>
      </div>
      {view.log.map((week) => (
        <div className="ho-ledger-row" key={week.week}>
          <span>
            {week.seasonIcon} {week.week}
          </span>
          <span>{pct(week.occupancy)}</span>
          <span>{week.guests}</span>
          <span>{money(week.revenue)}</span>
          <span>{money(week.costs)}</span>
          <span className={week.profit >= 0 ? 'ho-good' : 'ho-bad'}>
            {week.profit >= 0 ? '+' : ''}
            {money(week.profit)}
          </span>
        </div>
      ))}
    </div>
  );
}
