import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { YahtzeeView } from '../game.js';
import { Dice, Scorecard, seatAvatar, seatName } from './parts.js';

// the table is display-only: it shows dice + every scorecard, never acts
export default function TableView({ view, players, over }: GameViewProps<YahtzeeView>) {
  const current = seatName(view, players, view.current);
  return (
    <div className="yz-screen">
      {over ? (
        <p className="yz-over">{over.text}</p>
      ) : (
        <p className="yz-hint">
          <strong>{current}</strong>
          {view.pass ? ' has the phone' : "'s turn"} —{' '}
          {view.rollsLeft === 3
            ? 'rolling…'
            : `${view.rollsLeft} roll${view.rollsLeft === 1 ? '' : 's'} left`}
        </p>
      )}
      <Dice dice={view.dice} held={view.held} big />
      <div className="yz-cards">
        {view.cards.map((card, i) => (
          <Scorecard
            key={i}
            card={card}
            title={seatName(view, players, i)}
            avatar={seatAvatar(view, players, i)}
            seat={i}
            current={!over && i === view.current}
            compact
          />
        ))}
      </div>
    </div>
  );
}
