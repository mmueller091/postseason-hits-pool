import { assert, type Team, type Player, type Score } from './domain.ts';
// MLB's public Stats API is isolated here so response changes have one integration point.
const BASE = 'https://statsapi.mlb.com/api/v1';
type Split = {
  team?: { id: number };
  sport?: { id: number };
  player?: { id: number };
  stat: Record<string, number | string>;
  gameType?: string;
};
async function get(path: string): Promise<any> {
  const response = await fetch(BASE + path, {
    signal: AbortSignal.timeout(20000),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok)
    throw new Error(
      'MLB data is unavailable (' + response.status + '). Try again shortly.',
    );
  const data: any = await response.json();
  if (
    data.message &&
    !data.teams &&
    !data.stats &&
    !data.records &&
    !data.people &&
    !data.roster &&
    !data.dates
  )
    throw new Error('MLB returned an unexpected response.');
  return data;
}
export function battingLine(splits: Split[]): Record<string, number | string> {
  const mlb = splits.filter((s) => !s.sport || s.sport.id === 1);
  const combined = mlb.find((s) => !s.team);
  if (combined) return combined.stat;
  if (mlb.length <= 1) return mlb[0]?.stat ?? {};
  const total: Record<string, number | string> = {};
  for (const key of [
    'hits',
    'plateAppearances',
    'atBats',
    'homeRuns',
    'rbi',
    'baseOnBalls',
    'hitByPitch',
    'sacFlies',
    'totalBases',
  ])
    total[key] = mlb.reduce((n, s) => n + Number(s.stat[key] ?? 0), 0);
  const h = Number(total.hits),
    ab = Number(total.atBats),
    bb = Number(total.baseOnBalls),
    hbp = Number(total.hitByPitch),
    sf = Number(total.sacFlies);
  total.avg = ab ? (h / ab).toFixed(3).replace(/^0/, '') : '.000';
  total.ops = (
    (ab + bb + hbp + sf ? (h + bb + hbp) / (ab + bb + hbp + sf) : 0) +
    (ab ? Number(total.totalBases) / ab : 0)
  )
    .toFixed(3)
    .replace(/^0/, '');
  return total;
}
export async function teamsFor(season: number): Promise<Team[]> {
  const data = await get('/teams?sportId=1&season=' + season);
  assert(Array.isArray(data.teams), 'MLB team data is unavailable.', 502);
  return data.teams
    .filter((t: any) => [103, 104].includes(t.league?.id))
    .map((t: any) => ({
      id: t.id,
      name: t.name,
      abbreviation: t.abbreviation,
      league: t.league.id === 103 ? 'AL' : 'NL',
    }))
    .sort((a: Team, b: Team) => a.name.localeCompare(b.name));
}
export async function fieldCandidates(season: number): Promise<number[]> {
  const data = await get(
    '/standings?leagueId=103,104&season=' +
      season +
      '&standingsTypes=regularSeason',
  );
  assert(
    Array.isArray(data.records),
    'MLB has not returned standings for this season.',
    502,
  );
  return [
    ...new Set<number>(
      data.records.flatMap((r: any) =>
        (r.teamRecords ?? [])
          .filter((t: any) => t.clinched === true)
          .map((t: any) => t.team.id),
      ),
    ),
  ];
}
export async function loadPlayers(
  teams: Team[],
  season: number,
): Promise<Player[]> {
  const rosters = [];
  // Bounded concurrency avoids excessive upstream connections.
  for (let i = 0; i < teams.length; i += 4)
    rosters.push(
      ...(await Promise.all(
        teams.slice(i, i + 4).map(async (team) => {
          const data = await get(
            '/teams/' + team.id + '/roster?rosterType=active&season=' + season,
          );
          assert(
            Array.isArray(data.roster),
            'MLB roster data is unavailable for ' + team.name + '.',
            502,
          );
          return data.roster
            .filter(
              (r: any) =>
                r.position?.type !== 'Pitcher' && r.status?.code === 'A',
            )
            .map((r: any) => ({
              id: r.person.id,
              name: r.person.fullName,
              position: r.position.abbreviation,
              team,
            }));
        }),
      )),
    );
  const unique = [
    ...new Map<number, any>(rosters.flat().map((p: any) => [p.id, p])).values(),
  ];
  assert(
    unique.length > 0,
    'MLB returned no batters. Check the season and selected teams.',
    502,
  );
  const stats = new Map<number, Record<string, number | string>>();
  for (let i = 0; i < unique.length; i += 50) {
    const ids = unique
      .slice(i, i + 50)
      .map((p) => p.id)
      .join(',');
    const data = await get(
      '/people?personIds=' +
        ids +
        '&hydrate=' +
        encodeURIComponent(
          'stats(group=[hitting],type=[season],season=' +
            season +
            ',gameType=R)',
        ),
    );
    assert(Array.isArray(data.people), 'MLB batting data is unavailable.', 502);
    for (const p of data.people)
      stats.set(
        p.id,
        battingLine(
          (p.stats ?? [])
            .filter((g: any) => g.group?.displayName === 'hitting')
            .flatMap((g: any) => g.splits ?? []),
        ),
      );
    assert(
      unique.slice(i, i + 50).every((p) => stats.has(p.id)),
      'MLB returned an incomplete player list.',
      502,
    );
  }
  return unique
    .map((p) => {
      const s = stats.get(p.id) ?? {};
      return {
        id: p.id,
        name: p.name,
        position: p.position,
        teamId: p.team.id,
        team: p.team.abbreviation,
        league: p.team.league,
        avg: String(s.avg ?? '.000'),
        hits: Number(s.hits ?? 0),
        pa: Number(s.plateAppearances ?? 0),
        ab: Number(s.atBats ?? 0),
        ops: String(s.ops ?? '.000'),
        hr: Number(s.homeRuns ?? 0),
        rbi: Number(s.rbi ?? 0),
      };
    })
    .sort((a, b) => b.hits - a.hits);
}
export async function postseasonScores(
  season: number,
  playerIds: number[],
): Promise<Record<string, Score>> {
  const scores: Record<string, Score> = {};
  for (const id of playerIds) scores[id] = { F: 0, D: 0, L: 0, W: 0, total: 0 };
  // Never combine P (all postseason) with its individual round totals.
  await Promise.all(
    (['F', 'D', 'L', 'W'] as const).map(async (round) => {
      let offset = 0,
        total = 0;
      const splits: Split[] = [];
      do {
        const data = await get(
          '/stats?stats=season&group=hitting&season=' +
            season +
            '&gameType=' +
            round +
            '&sportIds=1&playerPool=ALL&limit=1000&offset=' +
            offset,
        );
        assert(
          Array.isArray(data.stats),
          'MLB postseason data is unavailable.',
          502,
        );
        const group = data.stats.find(
          (g: any) => g.group?.displayName === 'hitting',
        );
        const page = group?.splits ?? [];
        total = group?.totalSplits ?? page.length;
        assert(
          !total || page.length > 0,
          'MLB returned incomplete postseason statistics.',
          502,
        );
        splits.push(...page);
        offset += page.length;
      } while (offset < total);
      for (const id of playerIds) {
        const rows = splits.filter((s) => s.player?.id === id);
        scores[id][round] = Number(battingLine(rows).hits ?? 0);
      }
    }),
  );
  for (const score of Object.values(scores))
    score.total = score.F + score.D + score.L + score.W;
  return scores;
}
