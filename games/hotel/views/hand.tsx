import './style.css';
import { useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { HotelView } from '../game.js';
import type { RoomKind, SlotKind } from '../sim.js';
import {
  FACILITY_KINDS,
  RATE_MIN,
  ROOM_KINDS,
  SPECS,
  isFacilityKind,
  isRoomKind,
  money,
  rateMax,
} from '../sim.js';
import { ReportCard, Stats, Tower } from './parts.js';

const RATE_STEP = 5;

interface Target {
  floor: number;
  slot: number;
  kind: SlotKind | null;
}

/** Bottom sheet: build into an empty slot, or tear down what stands there. */
function BuildSheet(props: {
  view: HotelView;
  target: Target;
  onBuild: (kind: SlotKind) => void;
  onDemolish: () => void;
  onClose: () => void;
}) {
  const { view, target } = props;
  const floorName = target.floor === 0 ? 'ground floor' : `floor ${target.floor + 1}`;

  if (target.kind) {
    const spec = SPECS[target.kind];
    return (
      <div className="ho-sheet-wrap" onClick={props.onClose}>
        <div className="ho-sheet" onClick={(e) => e.stopPropagation()}>
          <p className="ho-sheet-title">
            {spec.icon} {spec.name} · {floorName}
          </p>
          <p className="ho-sheet-sub">{spec.blurb}</p>
          <button className="ho-danger" onClick={props.onDemolish}>
            Demolish — salvage {money(spec.cost * 0.25)}
          </button>
          <button className="ho-cancel" onClick={props.onClose}>
            Keep it
          </button>
        </div>
      </div>
    );
  }

  const options: SlotKind[] = [...ROOM_KINDS, ...FACILITY_KINDS];
  return (
    <div className="ho-sheet-wrap" onClick={props.onClose}>
      <div className="ho-sheet" onClick={(e) => e.stopPropagation()}>
        <p className="ho-sheet-title">Build · {floorName}</p>
        <div className="ho-options">
          {options.map((kind) => {
            const spec = SPECS[kind];
            const room = isRoomKind(kind);
            const owned = isFacilityKind(kind) && view.facilities.includes(kind);
            const poor = view.cash < spec.cost;
            return (
              <button
                key={kind}
                className={`ho-option${room ? '' : ' fac'}`}
                disabled={owned || poor}
                onClick={() => props.onBuild(kind)}
              >
                <span className="ho-option-icon">{spec.icon}</span>
                <span className="ho-option-text">
                  <strong>{spec.name}</strong>
                  <em>
                    {owned ? 'already built' : spec.blurb}
                    {isRoomKind(kind) ? ` · fair ${money(view.fair[kind])}` : ''}
                  </em>
                </span>
                <span className="ho-option-cost">{money(spec.cost)}</span>
              </button>
            );
          })}
        </div>
        <button className="ho-cancel" onClick={props.onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function RateRow(props: { view: HotelView; kind: RoomKind; move: GameViewProps['move'] }) {
  const { view, kind } = props;
  const rate = view.rates[kind];
  const fair = view.fair[kind];
  const pull = view.pull[kind];
  const mood = pull >= 1.15 ? 'bargain' : pull >= 0.9 ? 'fair' : pull >= 0.5 ? 'pricey' : 'greedy';
  return (
    <div className="ho-rate">
      <span className="ho-rate-name">
        {SPECS[kind].icon} ×{view.rooms[kind]}
      </span>
      <div className="ho-stepper">
        <button
          className="ho-step"
          disabled={rate <= RATE_MIN}
          onClick={() => props.move('setRate', kind, rate - RATE_STEP)}
        >
          −
        </button>
        <span className="ho-step-value">${rate}</span>
        <button
          className="ho-step"
          disabled={rate >= rateMax(kind)}
          onClick={() => props.move('setRate', kind, rate + RATE_STEP)}
        >
          +
        </button>
      </div>
      <span className={`ho-rate-mood ${mood}`}>
        fair ${fair} · {mood}
      </span>
    </div>
  );
}

export default function HandView({ view, over, move }: GameViewProps<HotelView>) {
  const [target, setTarget] = useState<Target | null>(null);

  const openSlot = (floor: number, slot: number): void => {
    if (over) return;
    const kind = view.floors[floor]?.slots[slot] ?? null;
    setTarget({ floor, slot, kind });
  };

  const owned = ROOM_KINDS.filter((kind) => view.rooms[kind] > 0);
  const wages = view.staff * view.staffWage;
  const covered = view.staff * view.roomsPerStaff;

  return (
    <div className="ho-screen ho-phone">
      <p className={over ? 'ho-over' : 'ho-over quiet'}>
        {over ? over.text : `🏨 ${view.relaxed ? 'Relaxed run' : `target ${money(view.goal)}`}`}
      </p>

      <Stats view={view} />
      <ReportCard view={view} />

      <Tower view={view} onSlot={openSlot} />

      <div className="ho-buys">
        <button
          className="ho-buy"
          disabled={!!over || !view.canAddFloor || view.cash < view.nextFloorCost}
          onClick={() => move('addFloor')}
        >
          🏗️ Add floor
          <em>{view.canAddFloor ? money(view.nextFloorCost) : 'max height'}</em>
        </button>
        <button
          className="ho-buy"
          disabled={
            !!over || view.receptionLevel >= view.receptionMax || view.cash < view.receptionCost
          }
          onClick={() => move('upgradeReception')}
        >
          ⭐ Reception
          <em>
            {view.receptionLevel >= view.receptionMax
              ? 'top level'
              : `lv ${view.receptionLevel + 1} · ${money(view.receptionCost)}`}
          </em>
        </button>
        <button
          className="ho-buy"
          disabled={!!over || view.ad || view.cash < view.adCost}
          onClick={() => move('advertise')}
        >
          📣 Advertise
          <em>{view.ad ? 'booked · +20%' : `${money(view.adCost)} · +20%`}</em>
        </button>
      </div>

      <div className="ho-panel">
        <p className="ho-panel-title">nightly rates</p>
        {owned.length === 0 ? (
          <p className="ho-panel-hint">no rooms yet — tap a ＋ slot to build one</p>
        ) : (
          owned.map((kind) => <RateRow key={kind} view={view} kind={kind} move={move} />)
        )}
      </div>

      <div className="ho-panel">
        <p className="ho-panel-title">staff</p>
        <div className="ho-rate">
          <span className="ho-rate-name">🧑‍🍳 team</span>
          <div className="ho-stepper">
            <button
              className="ho-step"
              disabled={!!over || view.staff <= 0}
              onClick={() => move('fire')}
            >
              −
            </button>
            <span className="ho-step-value">{view.staff}</span>
            <button className="ho-step" disabled={!!over} onClick={() => move('hire')}>
              +
            </button>
          </div>
          <span className="ho-rate-mood fair">
            covers {covered} rooms · {money(wages)}/wk
          </span>
        </div>
        <p className={view.understaffed ? 'ho-warn on' : 'ho-warn'}>
          {view.understaffed
            ? `⚠️ ${view.roomsBuilt} rooms need ${view.staffNeeded} staff`
            : 'staffing is fine'}
        </p>
      </div>

      <div className="ho-bottom">
        {over ? (
          <button className="ho-next" onClick={() => move('restart')}>
            ↺ New hotel
          </button>
        ) : (
          <button className="ho-next" onClick={() => move('nextWeek')}>
            ▶ Play week {view.week} {view.season.icon}
          </button>
        )}
      </div>

      {target && !over && (
        <BuildSheet
          view={view}
          target={target}
          onBuild={(kind) => {
            move('build', target.floor, target.slot, kind);
            setTarget(null);
          }}
          onDemolish={() => {
            move('demolish', target.floor, target.slot);
            setTarget(null);
          }}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  );
}
