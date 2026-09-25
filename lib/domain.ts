export type League = 'AL' | 'NL';
export type Mode = 'snake' | 'straight';
export type Slot = League | 'W';
export type Team = {
  id: number;
  name: string;
  abbreviation: string;
  league: League;
};
export type Member = { id: string; name: string; codeHash?: string };
export type Player = {
  id: number;
  name: string;
  teamId: number;
  team: string;
  league: League;
  position: string;
  avg: string;
  hits: number;
  pa: number;
  ab: number;
  ops: string;
  hr: number;
  rbi: number;
};
export type Pick = {
  number: number;
  memberId: string;
  slot: Slot;
  player: Player;
  at: string;
};
export type Score = {
  F: number;
  D: number;
  L: number;
  W: number;
  total: number;
};
export type Pool = {
  title: string;
  season: number;
  mode: Mode;
  status: 'setup' | 'drafting' | 'paused' | 'complete';
  fieldConfirmed: boolean;
  teams: Team[];
  members: Member[];
  players: Player[];
  picks: Pick[];
  scores: Record<string, Score>;
  statsUpdatedAt: string | null;
  scoresUpdatedAt: string | null;
  scoreError: string | null;
  events: { at: string; text: string }[];
};
export function emptyPool(): Pool {
  return {
    title: 'Postseason Hits Pool',
    season: new Date().getUTCFullYear(),
    mode: 'snake',
    status: 'setup',
    fieldConfirmed: false,
    teams: [],
    members: [],
    players: [],
    picks: [],
    scores: {},
    statsUpdatedAt: null,
    scoresUpdatedAt: null,
    scoreError: null,
    events: [],
  };
}
export class PoolError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new PoolError(message, status);
}
export function nextMember(pool: {
  members: Member[];
  picks: Pick[];
  mode: Mode;
}): Member | undefined {
  const n = pool.members.length,
    turn = pool.picks.length;
  if (!n || turn >= n * 3) return;
  const round = Math.floor(turn / n),
    offset = turn % n;
  return pool.members[
    pool.mode === 'snake' && round % 2 === 1 ? n - 1 - offset : offset
  ];
}
export function slotFor(
  picks: Pick[],
  memberId: string,
  league: League,
): Slot | null {
  const mine = picks.filter((p) => p.memberId === memberId);
  if (mine.length >= 3) return null;
  const hasAL = mine.some((p) => p.slot === 'AL'),
    hasNL = mine.some((p) => p.slot === 'NL');
  if (hasAL && hasNL) return 'W';
  return mine.some((p) => p.slot === league) ? null : league;
}
export function makePick(
  pool: Pool,
  memberId: string,
  playerId: number,
  expectedPick: number,
): Pick {
  assert(pool.status === 'drafting', 'The draft is not open.', 409);
  assert(pool.fieldConfirmed, 'The playoff field must be confirmed.', 409);
  assert(
    pool.picks.length === expectedPick,
    'The board changed. Review the current turn and try again.',
    409,
  );
  assert(nextMember(pool)?.id === memberId, 'It is not your turn.', 403);
  const player = pool.players.find((p) => p.id === playerId);
  assert(
    player && pool.teams.some((t) => t.id === player.teamId),
    'Choose a player from the confirmed playoff field.',
  );
  assert(
    !pool.picks.some((p) => p.player.id === playerId),
    'That player has already been drafted.',
    409,
  );
  const slot = slotFor(pool.picks, memberId, player.league);
  assert(slot, 'You must draft one AL and one NL player before your wildcard.');
  return {
    number: pool.picks.length + 1,
    memberId,
    slot,
    player: { ...player },
    at: new Date().toISOString(),
  };
}
export function logEvent(pool: Pool, text: string) {
  pool.events = [{ at: new Date().toISOString(), text }, ...pool.events].slice(
    0,
    100,
  );
}
export function standings(pool: Pool) {
  const rows = pool.members
    .map((member) => {
      const picks = pool.picks.filter((p) => p.memberId === member.id);
      return {
        member,
        picks,
        total: picks.reduce(
          (sum, p) => sum + (pool.scores[p.player.id]?.total ?? 0),
          0,
        ),
      };
    })
    .sort((a, b) => b.total - a.total);
  return rows.map((row, i) => ({
    ...row,
    rank: rows.findIndex((r) => r.total === row.total) + 1,
  }));
}
export function requireReady(pool: Pool) {
  assert(pool.members.length >= 2, 'Add at least two participants.');
  assert(pool.fieldConfirmed, 'Confirm the playoff teams first.');
  assert(
    pool.teams.filter((t) => t.league === 'AL').length === 6 &&
      pool.teams.filter((t) => t.league === 'NL').length === 6,
    'Select six AL teams and six NL teams.',
  );
  assert(
    pool.statsUpdatedAt && pool.players.length > 0,
    'Load the player list before opening the draft.',
  );
  for (const league of ['AL', 'NL'])
    assert(
      pool.players.filter((p) => p.league === league).length >=
        pool.members.length,
      'There are not enough players in each league.',
    );
  assert(
    pool.players.length >= pool.members.length * 3,
    'There are not enough unique players for this pool.',
  );
}
