/**
 * The card face, drawn as real SVG — three shapes, three fills, three colours.
 * Every card uses the same 360×220 viewBox with three 120-wide slots, so a
 * one-symbol card draws exactly the same size symbol as a three-symbol one
 * (the symbols are centred, the card is not).
 */

import type { Card } from '../lib.js';
import { attrsOf } from '../lib.js';

export const COLOURS = ['#e5384c', '#35a75d', '#8f5ce0'];

/** 0..100 wide, 0..200 tall, inset by 4 so an 8-wide stroke stays inside. */
const SHAPES = [
  // diamond
  'M50 4 L96 100 L50 196 L4 100 Z',
  // squiggle — two lobes, top-left and bottom-right
  'M24 14 C 50 2, 84 14, 84 44 C 84 78, 44 96, 44 124 C 44 148, 88 150, 88 176 C 88 194, 52 202, 30 190 C 12 180, 6 160, 16 142 C 26 124, 56 108, 56 84 C 56 60, 12 62, 12 38 C 12 24, 16 17, 24 14 Z',
  // oval (stadium)
  'M4 50 A46 46 0 0 1 96 50 L96 150 A46 46 0 0 1 4 150 Z',
];

const SLOT = 120;

/**
 * The striped fills, once for the whole page. Patterns are referenced by id
 * across SVG elements, so this hidden node has to be in the DOM — both role
 * views render it at the top of their screen.
 */
export function SetDefs() {
  return (
    <svg className="st-defs" aria-hidden="true" focusable="false">
      <defs>
        {COLOURS.map((col, i) => (
          <pattern
            key={i}
            id={`st-stripe-${i}`}
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
          >
            <path d="M4 0 V16" stroke={col} strokeWidth="7" fill="none" />
          </pattern>
        ))}
      </defs>
    </svg>
  );
}

export function CardFace({ card }: { card: Card }) {
  const { n, c, s, f } = attrsOf(card);
  const colour = COLOURS[c]!;
  const fill = f === 0 ? colour : f === 1 ? `url(#st-stripe-${c})` : 'none';
  const count = n + 1;
  const start = (3 - count) * (SLOT / 2);

  return (
    <svg className="st-face" viewBox="0 0 360 220" preserveAspectRatio="xMidYMid meet">
      {Array.from({ length: count }, (_, i) => (
        <path
          key={i}
          d={SHAPES[s]}
          transform={`translate(${start + i * SLOT + 10} 10)`}
          fill={fill}
          stroke={colour}
          strokeWidth="8"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
