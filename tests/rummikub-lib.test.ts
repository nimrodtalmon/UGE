// Unit tests for the rummikub meld validation. Run with: npx tsx tests/rummikub-lib.test.ts
import { decode, isValidMeld, meldValue, rackValue } from '../games/rummikub/lib.js';

const t = (name: string, cond: boolean) => {
  if (!cond) {
    console.error('FAIL:', name);
    process.exit(1);
  }
  console.log('ok:', name);
};
const id = (n: number, c: number, copy = 0) => copy * 52 + c * 13 + (n - 1);
const J1 = 104;
const J2 = 105;

t('decode 7 red', JSON.stringify(decode(id(7, 0))) === JSON.stringify({ n: 7, c: 0, joker: false }));
t('decode joker', decode(J1).joker);
t('group of 3', isValidMeld([id(7, 0), id(7, 1), id(7, 2)]));
t('group of 4', isValidMeld([id(7, 0), id(7, 1), id(7, 2), id(7, 3)]));
t('group dup color invalid', !isValidMeld([id(7, 0), id(7, 0, 1), id(7, 2)]));
t('group of 5 invalid', !isValidMeld([id(7, 0), id(7, 1), id(7, 2), id(7, 3), J1]));
t('run of 3', isValidMeld([id(3, 2), id(4, 2), id(5, 2)]));
t('run unordered input', isValidMeld([id(5, 2), id(3, 2), id(4, 2)]));
t('run mixed colors invalid', !isValidMeld([id(3, 2), id(4, 1), id(5, 2)]));
t('run with gap invalid', !isValidMeld([id(3, 2), id(4, 2), id(6, 2)]));
t('run gap filled by joker', isValidMeld([id(3, 2), J1, id(5, 2)]));
t('run joker extends end', isValidMeld([id(12, 2), id(13, 2), J1]));
t('two jokers fill two gaps', isValidMeld([id(3, 2), J1, id(5, 2), J2, id(7, 2)]));
t('pair invalid', !isValidMeld([id(7, 0), id(7, 1)]));
t('dup tile id invalid', !isValidMeld([id(7, 0), id(7, 0), id(7, 1)]));
t('group with joker', isValidMeld([id(11, 0), id(11, 1), J1]));
t('group value', meldValue([id(10, 0), id(10, 1), id(10, 2)]) === 30);
t('group joker value', meldValue([id(11, 0), id(11, 1), J1]) === 33);
t('run value 3+4+5', meldValue([id(3, 2), id(4, 2), id(5, 2)]) === 12);
t('run 12,13 + joker valued as 11+12+13', meldValue([id(12, 2), id(13, 2), J1]) === 36);
t('rack value with joker', rackValue([id(5, 0), J1]) === 35);
console.log('ALL RUMMIKUB LIB TESTS PASSED');
