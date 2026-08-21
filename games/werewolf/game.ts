import type { GameDef } from '../../src/shared/plugin.js';

export type WerewolfRole = 'wolf' | 'seer' | 'villager';
export type WerewolfPhase = 'reveal' | 'night' | 'day' | 'vote' | 'done';

const DAY_MS = 90_000;

export interface Death {
  seat: number;
  name: string;
  role: WerewolfRole;
  how: 'night' | 'lynch';
  night: number;
}

export interface SeerResult {
  target: number;
  isWolf: boolean;
  night: number;
}

export interface WerewolfState {
  phase: WerewolfPhase;
  /** Seat index → secret role. NEVER leaves the server unfiltered. */
  roles: WerewolfRole[];
  alive: boolean[];
  playerIds: string[];
  playerNames: string[];
  /** Reveal phase: who has confirmed seeing their role. */
  ready: boolean[];
  /** 1-based night counter; 0 during reveal. */
  night: number;
  /** Per seat: this wolf's current victim pick (null = not yet). */
  wolfPicks: (number | null)[];
  seerPeeked: boolean;
  seerResults: SeerResult[];
  /** Day discussion deadline (server clock). */
  endsAt: number;
  /** Day phase: alive seats asking to cut discussion short. */
  callers: boolean[];
  /** Per seat: null = not voted, -1 = skip, else target seat. Public. */
  votes: (number | null)[];
  deaths: Death[];
  winner: 'village' | 'wolves' | null;
  winText: string | null;
}

/** Everything here is readable in that device's devtools — public info plus
 *  strictly the viewer's own secrets (own role, wolf-mates for wolves,
 *  peek history for the seer). Dead viewers keep only their own role. */
export interface WerewolfView {
  phase: WerewolfPhase;
  night: number;
  myIndex: number;
  myRole: WerewolfRole | null;
  /** Seat indices of fellow wolves — alive wolves only see this. */
  myWolfMates: number[] | null;
  /** Alive wolf: my current victim pick this night. */
  myPick: number | null;
  /** Alive seer: already peeked this night. */
  myPeeked: boolean;
  /** Alive seer: accumulated peek results. */
  seerResults: SeerResult[] | null;
  alive: boolean[];
  ready: boolean[];
  /** Anonymous night progress: how many alive wolves have picked. */
  wolvesPicked: number;
  wolvesAlive: number;
  /** Public: role counts are fixed by player count, deaths reveal roles. */
  seerAlive: boolean;
  seerDone: boolean;
  endsAt: number;
  dayMs: number;
  /** Day: how many alive players want to vote now, and how many that takes. */
  callers: number;
  callsNeeded: number;
  iCalled: boolean;
  votes: (number | null)[];
  deaths: Death[];
  /** Public role mix — fixed by player count, so no secret to keep. */
  wolfCount: number;
  villagerCount: number;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const aliveWolves = (state: WerewolfState): number[] =>
  state.roles.map((_, i) => i).filter((i) => state.roles[i] === 'wolf' && state.alive[i]);

const seerIsAlive = (state: WerewolfState): boolean => {
  const seat = state.roles.indexOf('seer');
  return seat >= 0 && state.alive[seat] === true;
};

/** Seat of the sender, or -1 when not an alive seated player. */
function aliveSeatOf(state: WerewolfState, ctx: { playerId: string; role: string }): number {
  if (ctx.role !== 'hand') return -1;
  const seat = state.playerIds.indexOf(ctx.playerId);
  return seat >= 0 && state.alive[seat] === true ? seat : -1;
}

/** Fresh night: bump the counter, clear picks/peeks/votes. */
function nextNight(state: WerewolfState): WerewolfState {
  return {
    ...state,
    phase: 'night',
    night: state.night + 1,
    wolfPicks: state.wolfPicks.map(() => null),
    seerPeeked: false,
    votes: state.votes.map(() => null),
    endsAt: 0,
    callers: state.callers.map(() => false),
  };
}

/** Kill a seat, log it publicly (name + role), then win-check and advance. */
function afterDeath(state: WerewolfState, seat: number, how: 'night' | 'lynch', now: number): WerewolfState {
  const alive = state.alive.map((a, s) => a && s !== seat);
  const deaths: Death[] = [
    ...state.deaths,
    { seat, name: state.playerNames[seat] ?? '?', role: state.roles[seat]!, how, night: state.night },
  ];
  const next = { ...state, alive, deaths };
  const wolves = aliveWolves(next);
  const others = alive.filter((a, s) => a && next.roles[s] !== 'wolf').length;
  if (wolves.length === 0) {
    return {
      ...next,
      phase: 'done',
      winner: 'village',
      winText: '🎉 The village wins! Every wolf has been rooted out.',
    };
  }
  if (wolves.length >= others) {
    const names = wolves.map((w) => state.playerNames[w] ?? '?');
    return {
      ...next,
      phase: 'done',
      winner: 'wolves',
      winText: `🐺 The wolves win! ${names.join(' & ')} ${names.length > 1 ? 'were' : 'was'} lurking among you all along.`,
    };
  }
  return how === 'night'
    ? { ...next, phase: 'day', endsAt: now + DAY_MS, callers: next.callers.map(() => false) }
    : nextNight(next);
}

/** Night resolves once every alive wolf has picked and the seer has peeked
 *  (or is dead): victim = most wolf votes, tie → lowest seat. */
function maybeResolveNight(state: WerewolfState, now: number): WerewolfState {
  const wolves = aliveWolves(state);
  if (wolves.length === 0) return state;
  if (wolves.some((w) => state.wolfPicks[w] === null)) return state;
  if (seerIsAlive(state) && !state.seerPeeked) return state;
  const counts = state.roles.map(() => 0);
  for (const w of wolves) {
    const pick = state.wolfPicks[w]!;
    counts[pick] = (counts[pick] ?? 0) + 1;
  }
  let victim = -1;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i]! > 0 && (victim < 0 || counts[i]! > counts[victim]!)) victim = i;
  }
  return victim < 0 ? state : afterDeath(state, victim, 'night', now);
}

const game: GameDef<WerewolfState, WerewolfView> = {
  setup({ players, random }) {
    const n = players.length;
    const wolfCount = n >= 11 ? 3 : n >= 7 ? 2 : 1;
    const bag: WerewolfRole[] = [
      ...Array<WerewolfRole>(wolfCount).fill('wolf'),
      'seer',
      ...Array<WerewolfRole>(Math.max(0, n - wolfCount - 1)).fill('villager'),
    ];
    return {
      phase: 'reveal',
      roles: shuffle(bag, random),
      alive: players.map(() => true),
      playerIds: players.map((p) => p.id),
      playerNames: players.map((p) => p.name),
      ready: players.map(() => false),
      night: 0,
      wolfPicks: players.map(() => null),
      seerPeeked: false,
      seerResults: [],
      endsAt: 0,
      callers: players.map(() => false),
      votes: players.map(() => null),
      deaths: [],
      winner: null,
      winText: null,
    };
  },

  moves: {
    /** Reveal phase: "I've seen my role". Idempotent per player. */
    ready(state, ctx) {
      if (state.phase !== 'reveal') return state;
      const seat = aliveSeatOf(state, ctx);
      if (seat < 0 || state.ready[seat]) return state;
      const ready = state.ready.map((r, s) => r || s === seat);
      const allReady = state.alive.every((a, s) => !a || ready[s]);
      return allReady ? nextNight({ ...state, ready }) : { ...state, ready };
    },

    /** Alive wolf picks (or re-picks) tonight's victim: alive, not a wolf. */
    wolfPick(state, ctx, i: number) {
      if (state.phase !== 'night') return state;
      const seat = aliveSeatOf(state, ctx);
      if (seat < 0 || state.roles[seat] !== 'wolf') return state;
      if (!Number.isInteger(i) || i < 0 || i >= state.roles.length) return state;
      if (!state.alive[i] || state.roles[i] === 'wolf') return state;
      const wolfPicks = state.wolfPicks.map((p, s) => (s === seat ? i : p));
      return maybeResolveNight({ ...state, wolfPicks }, ctx.now);
    },

    /** Alive seer inspects one alive player (not self), once per night. */
    seerPeek(state, ctx, i: number) {
      if (state.phase !== 'night' || state.seerPeeked) return state;
      const seat = aliveSeatOf(state, ctx);
      if (seat < 0 || state.roles[seat] !== 'seer') return state;
      if (!Number.isInteger(i) || i < 0 || i >= state.roles.length) return state;
      if (!state.alive[i] || i === seat) return state;
      const seerResults: SeerResult[] = [
        ...state.seerResults,
        { target: i, isWolf: state.roles[i] === 'wolf', night: state.night },
      ];
      return maybeResolveNight({ ...state, seerPeeked: true, seerResults }, ctx.now);
    },

    /** "Vote now": once a majority of the living ask for it, discussion ends
     *  early. One tap each, and it can be taken back. */
    callVote(state, ctx) {
      if (state.phase !== 'day') return state;
      const seat = aliveSeatOf(state, ctx);
      if (seat < 0) return state;
      const callers = state.callers.map((c, s) => (s === seat ? !c : c));
      const aliveCount = state.alive.filter(Boolean).length;
      const asked = callers.filter((c, s) => c && state.alive[s]).length;
      if (asked >= Math.floor(aliveCount / 2) + 1) {
        return { ...state, callers, phase: 'vote', endsAt: 0 };
      }
      return { ...state, callers };
    },

    /** Day timer ran out (table drives it, phones back it up; idempotent). */
    startVote(state, ctx) {
      if (state.phase !== 'day' || ctx.now < state.endsAt - 250) return state;
      return { ...state, phase: 'vote', endsAt: 0 };
    },

    /** Alive player votes an alive player, or null to skip; changeable until
     *  everyone has voted. Votes are public. Strict majority lynches. */
    vote(state, ctx, target: number | null) {
      if (state.phase !== 'vote') return state;
      const seat = aliveSeatOf(state, ctx);
      if (seat < 0) return state;
      if (target !== null) {
        if (!Number.isInteger(target) || target < 0 || target >= state.roles.length) return state;
        if (!state.alive[target]) return state;
      }
      const votes = state.votes.map((v, s) => (s === seat ? (target ?? -1) : v));
      const aliveSeats = state.alive.map((_, s) => s).filter((s) => state.alive[s]);
      if (aliveSeats.some((s) => votes[s] === null)) return { ...state, votes };
      const counts = state.roles.map(() => 0);
      for (const s of aliveSeats) {
        const v = votes[s]!;
        if (v >= 0) counts[v] = (counts[v] ?? 0) + 1;
      }
      const majority = Math.floor(aliveSeats.length / 2) + 1;
      const lynched = counts.findIndex((c) => c >= majority);
      const next = { ...state, votes };
      // tie or skip-majority → nobody dies, straight into the next night
      return lynched < 0 ? nextNight(next) : afterDeath(next, lynched, 'lynch', ctx.now);
    },
  },

  playerView(state, { playerId, role }) {
    const myIndex = role === 'hand' && playerId !== null ? state.playerIds.indexOf(playerId) : -1;
    const iAmAlive = myIndex >= 0 && state.alive[myIndex] === true;
    const myRole = myIndex >= 0 ? (state.roles[myIndex] ?? null) : null;
    // dead phones drop back to public info + their own role — no spoilers
    const amWolf = iAmAlive && myRole === 'wolf';
    const amSeer = iAmAlive && myRole === 'seer';
    const wolves = state.roles.map((_, i) => i).filter((i) => state.roles[i] === 'wolf');
    const prowling = aliveWolves(state);
    const seerAlive = seerIsAlive(state);
    return {
      phase: state.phase,
      night: state.night,
      myIndex,
      myRole,
      myWolfMates: amWolf ? wolves.filter((w) => w !== myIndex) : null,
      myPick: amWolf ? (state.wolfPicks[myIndex] ?? null) : null,
      myPeeked: amSeer ? state.seerPeeked : false,
      seerResults: amSeer ? state.seerResults : null,
      alive: state.alive,
      ready: state.ready,
      wolvesPicked: prowling.filter((w) => state.wolfPicks[w] !== null).length,
      wolvesAlive: prowling.length,
      seerAlive,
      seerDone: !seerAlive || state.seerPeeked,
      endsAt: state.endsAt,
      dayMs: DAY_MS,
      callers: state.callers.filter((c, s) => c && state.alive[s]).length,
      callsNeeded: Math.floor(state.alive.filter(Boolean).length / 2) + 1,
      iCalled: myIndex >= 0 && state.callers[myIndex] === true,
      votes: state.votes,
      deaths: state.deaths,
      wolfCount: wolves.length,
      villagerCount: state.roles.filter((r) => r === 'villager').length,
    };
  },

  isOver(state) {
    return state.winner ? { text: state.winText ?? 'The game is over.' } : null;
  },
};

export default game;
