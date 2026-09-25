import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyPool,
  makePick,
  nextMember,
  slotFor,
  standings,
  requireReady,
  type Pool,
  type Player,
} from '../lib/domain.ts';
import { battingLine, postseasonScores } from '../lib/mlb.ts';
function fixture(mode: 'snake' | 'straight' = 'snake'): Pool {
  const pool = emptyPool();
  pool.mode = mode;
  pool.status = 'drafting';
  pool.fieldConfirmed = true;
  pool.members = ['A', 'B', 'C'].map((id) => ({ id, name: id }));
  pool.teams = [
    { id: 1, name: 'AL test team', abbreviation: 'AL', league: 'AL' },
    { id: 2, name: 'NL test team', abbreviation: 'NL', league: 'NL' },
  ];
  pool.players = Array.from(
    { length: 24 },
    (_, i) =>
      ({
        id: i + 1,
        name: 'Test player ' + (i + 1),
        teamId: i % 2 ? 2 : 1,
        team: i % 2 ? 'NL' : 'AL',
        league: i % 2 ? 'NL' : 'AL',
        position: 'OF',
        avg: '.300',
        hits: 100,
        pa: 350,
        ab: 330,
        ops: '.900',
        hr: 15,
        rbi: 60,
      }) as Player,
  );
  return pool;
}
function choose(pool: Pool, id: number) {
  const pick = makePick(pool, nextMember(pool)!.id, id, pool.picks.length);
  pool.picks.push(pick);
  return pick;
}
test('snake and straight produce the complete three-round turn order', () => {
  for (const [mode, expected] of [
    ['snake', 'ABCCBAABC'],
    ['straight', 'ABCABCABC'],
  ] as const) {
    const pool = fixture(mode);
    let order = '';
    for (let i = 0; i < 9; i++) {
      const member = nextMember(pool)!;
      order += member.id;
      const player = pool.players.find(
        (p) =>
          !pool.picks.some((x) => x.player.id === p.id) &&
          slotFor(pool.picks, member.id, p.league),
      )!;
      choose(pool, player.id);
    }
    assert.equal(order, expected);
    assert.equal(nextMember(pool), undefined);
    for (const m of pool.members)
      assert.deepEqual(
        pool.picks
          .filter((p) => p.memberId === m.id)
          .map((p) => p.slot)
          .sort(),
        ['AL', 'NL', 'W'],
      );
  }
});
test('AL first requires NL; NL first requires AL; wildcard only after both', () => {
  for (const id of [1, 2]) {
    const pool = fixture();
    choose(pool, id);
    const original = pool.players.find((p) => p.id === id)!;
    assert.equal(slotFor(pool.picks, 'A', original.league), null);
    assert.equal(
      slotFor(pool.picks, 'A', original.league === 'AL' ? 'NL' : 'AL'),
      original.league === 'AL' ? 'NL' : 'AL',
    );
    pool.picks.push({
      number: 4,
      memberId: 'A',
      slot: original.league === 'AL' ? 'NL' : 'AL',
      player: pool.players.find((p) => p.league !== original.league)!,
      at: '',
    });
    assert.equal(slotFor(pool.picks, 'A', 'AL'), 'W');
    assert.equal(slotFor(pool.picks, 'A', 'NL'), 'W');
  }
});
test('server rejects missing field, paused draft, wrong identity and outside-field players', () => {
  const pool = fixture();
  assert.throws(() => makePick(pool, 'B', 1, 0), /not your turn/);
  pool.status = 'paused';
  assert.throws(() => makePick(pool, 'A', 1, 0), /not open/);
  pool.status = 'drafting';
  pool.fieldConfirmed = false;
  assert.throws(() => makePick(pool, 'A', 1, 0), /confirmed/);
  pool.fieldConfirmed = true;
  assert.throws(() => makePick(pool, 'A', 99999, 0), /confirmed playoff field/);
});
test('a drafted player cannot be selected again', () => {
  const pool = fixture();
  choose(pool, 1);
  assert.throws(() => makePick(pool, 'B', 1, 1), /already been drafted/);
});
test('a stale submission cannot consume the next consecutive snake turn', () => {
  const pool = fixture();
  choose(pool, 1);
  choose(pool, 3);
  choose(pool, 5);
  assert.equal(nextMember(pool)!.id, 'C');
  assert.throws(() => makePick(pool, 'C', 2, 2), /board changed/);
  assert.throws(() => makePick(pool, 'C', 7, 3), /one AL and one NL/);
  assert.equal(makePick(pool, 'C', 2, 3).slot, 'NL');
});
test('undo restores availability and required slot', () => {
  const pool = fixture();
  choose(pool, 1);
  choose(pool, 3);
  pool.picks.pop();
  assert.equal(nextMember(pool)!.id, 'B');
  assert.equal(makePick(pool, 'B', 3, 1).slot, 'AL');
});
test('ties share rank and eliminated players keep cumulative hits', () => {
  const pool = fixture();
  choose(pool, 1);
  choose(pool, 3);
  choose(pool, 5);
  pool.scores = {
    1: { F: 2, D: 4, L: 0, W: 0, total: 6 },
    3: { F: 2, D: 4, L: 0, W: 0, total: 6 },
    5: { F: 1, D: 0, L: 0, W: 0, total: 1 },
  };
  pool.players = [];
  const rows = standings(pool);
  assert.deepEqual(
    rows.map((r) => r.rank),
    [1, 1, 3],
  );
  assert.deepEqual(
    rows.map((r) => r.total),
    [6, 6, 1],
  );
});
test('unconfirmed pool cannot open', () =>
  assert.throws(() => requireReady(emptyPool()), /at least two/));
test('traded-player aggregate is not double counted', () => {
  assert.equal(
    battingLine([
      { stat: { hits: 153, avg: '.252' } },
      { team: { id: 1 }, stat: { hits: 74 } },
      { team: { id: 2 }, stat: { hits: 79 } },
    ]).hits,
    153,
  );
  const combined = battingLine([
    { team: { id: 1 }, stat: { hits: 1, atBats: 2, plateAppearances: 2 } },
    { team: { id: 2 }, stat: { hits: 2, atBats: 4, plateAppearances: 4 } },
  ]);
  assert.equal(combined.hits, 3);
  assert.equal(combined.avg, '.500');
});
test('all postseason rounds are added once and repeat refresh is idempotent', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input: any) => {
    const u = new URL(String(input));
    const round = u.searchParams.get('gameType')!;
    assert.ok(['F', 'D', 'L', 'W'].includes(round));
    return Response.json({
      stats: [
        {
          group: { displayName: 'hitting' },
          totalSplits: 1,
          splits: [
            {
              player: { id: 660271 },
              stat: { hits: ({ F: 3, D: 1, L: 5, W: 9 } as any)[round] },
            },
          ],
        },
      ],
    });
  };
  try {
    const scores = await postseasonScores(2025, [660271, 999]);
    assert.equal(scores[660271].total, 18);
    assert.equal(scores[999].total, 0);
    assert.deepEqual(await postseasonScores(2025, [660271, 999]), scores);
  } finally {
    globalThis.fetch = original;
  }
});
test('upstream failure rejects entire refresh instead of replacing missing data with zero', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('Unavailable', { status: 503 });
  try {
    await assert.rejects(() => postseasonScores(2025, [1]), /unavailable/);
  } finally {
    globalThis.fetch = original;
  }
});
