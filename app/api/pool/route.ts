import {
  access,
  clearCookie,
  hash,
  newCode,
  sameOrigin,
  sessionCookie,
} from '@/lib/access';
import {
  assert,
  logEvent,
  makePick,
  PoolError,
  requireReady,
  type Pool,
} from '@/lib/domain';
import {
  fieldCandidates,
  loadPlayers,
  postseasonScores,
  teamsFor,
} from '@/lib/mlb';
import { claimRefresh, loginLimit, readPool, savePool } from '@/lib/store';

export const dynamic = 'force-dynamic';
function json(data: unknown, status = 200, cookie?: string) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...(cookie ? { 'Set-Cookie': cookie } : {}),
    },
  });
}
function failure(error: unknown) {
  return json(
    {
      error:
        error instanceof Error
          ? error.message
          : 'The request could not be completed.',
    },
    error instanceof PoolError ? error.status : 502,
  );
}
function text(value: unknown, max = 60) {
  assert(
    typeof value === 'string' &&
      value.trim().length > 0 &&
      value.trim().length <= max,
    'Enter a value between 1 and ' + max + ' characters.',
  );
  return value.trim();
}
function year(value: unknown) {
  const n = Number(value);
  assert(
    Number.isInteger(n) && n >= 2022 && n <= new Date().getUTCFullYear() + 1,
    'Choose a valid season (2022 onward).',
  );
  return n;
}
async function refreshScores() {
  let { pool } = await readPool();
  if (!pool.picks.length) return;
  if (
    pool.scoresUpdatedAt &&
    Date.now() - Date.parse(pool.scoresUpdatedAt) < 60000
  )
    return;
  if (!(await claimRefresh('scores-' + pool.season, 60))) return;
  const season = pool.season;
  const ids = pool.picks.map((p) => p.player.id);
  let scores: Pool['scores'] | null = null,
    error: string | null = null;
  try {
    scores = await postseasonScores(season, ids);
  } catch (e) {
    error =
      e instanceof Error ? e.message : 'MLB statistics could not be refreshed.';
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await readPool();
    if (current.pool.season !== season) return;
    if (scores) {
      current.pool.scores = { ...current.pool.scores, ...scores };
      current.pool.scoresUpdatedAt = new Date().toISOString();
    }
    current.pool.scoreError = error;
    try {
      await savePool(current.pool, current.revision);
      return;
    } catch (e) {
      if (!(e instanceof PoolError && e.status === 409)) throw e;
    }
  }
}
export async function GET(request: Request) {
  try {
    const url = new URL(request.url),
      kind = url.searchParams.get('kind');
    if (kind === 'teams') {
      const { pool } = await readPool();
      assert(
        (await access(request, pool)).admin,
        'Commissioner access required.',
        401,
      );
      return json({
        teams: await teamsFor(year(url.searchParams.get('season'))),
      });
    }
    if (kind === 'candidates') {
      const { pool } = await readPool();
      assert(
        (await access(request, pool)).admin,
        'Commissioner access required.',
        401,
      );
      return json({
        teamIds: await fieldCandidates(year(url.searchParams.get('season'))),
      });
    }
    if (kind === 'scores') await refreshScores();
    const { pool, revision } = await readPool(),
      auth = await access(request, pool);
    return json({
      pool: {
        ...pool,
        members: pool.members.map(({ codeHash, ...member }) => member),
      },
      revision,
      auth,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    assert(
      Number(request.headers.get('content-length') ?? 0) < 100000,
      'The request is too large.',
      413,
    );
    const body: any = await request.json();
    const { pool, revision } = await readPool();
    const auth = await access(request, pool);
    if (body.action === 'login') {
      const role = 'member';
      const ip = request.headers.get('cf-connecting-ip') ?? 'local';
      await loginLimit(
        'login-' +
          (await hash(ip + '-' + role + ('-' + String(body.memberId ?? '')))),
      );
      const code = text(body.code, 200);
      const member = pool.members.find((m) => m.id === body.memberId);
      assert(
        member && member.codeHash === (await hash(code)),
        'The name or access code is incorrect.',
        401,
      );
      return json(
        { ok: true },
        200,
        await sessionCookie(request, 'member', member),
      );
    }
    if (body.action === 'logout')
      return json(
        { ok: true },
        200,
        clearCookie(request, body.role === 'admin' ? 'admin' : 'member'),
      );
    if (body.action === 'pick') {
      assert(
        auth.memberId,
        'Select your name and enter your access code before drafting.',
        401,
      );
      const pick = makePick(
        pool,
        auth.memberId,
        Number(body.playerId),
        Number(body.expectedPick),
      );
      pool.picks.push(pick);
      if (pool.picks.length === pool.members.length * 3)
        pool.status = 'complete';
      logEvent(
        pool,
        pool.members.find((m) => m.id === pick.memberId)!.name +
          ' drafted ' +
          pick.player.name +
          ' (' +
          pick.slot +
          ').',
      );
      await savePool(pool, revision);
      return json({ ok: true, pick });
    }
    assert(auth.admin, 'Commissioner access required.', 401);
    if (body.action === 'refreshPlayers') {
      assert(
        pool.picks.length === 0,
        'The player list is frozen after the first pick.',
        409,
      );
      assert(
        pool.teams.length === 12 && pool.fieldConfirmed,
        'Confirm the playoff field first.',
      );
      pool.players = await loadPlayers(pool.teams, pool.season);
      pool.statsUpdatedAt = new Date().toISOString();
      logEvent(
        pool,
        'Loaded ' +
          pool.players.length +
          ' batters and regular-season statistics from MLB.',
      );
      await savePool(pool, revision);
      return json({ ok: true, count: pool.players.length });
    }
    if (body.action === 'resetCode') {
      const member = pool.members.find((m) => m.id === body.memberId);
      assert(member, 'Participant not found.');
      const code = newCode();
      member.codeHash = await hash(code);
      await savePool(pool, revision);
      return json({
        ok: true,
        codes: [{ id: member.id, name: member.name, code }],
      });
    }
    assert(
      Number(body.revision) === revision,
      'The pool changed. Refresh and try again.',
      409,
    );
    if (body.action === 'settings') {
      assert(
        pool.picks.length === 0,
        'Draft order, season and teams are locked after the first pick.',
        409,
      );
      assert(
        pool.status !== 'drafting',
        'Pause the draft before changing setup.',
        409,
      );
      const previousSeason = pool.season;
      pool.title = text(body.title, 70);
      pool.season = year(body.season);
      assert(
        body.mode === 'snake' || body.mode === 'straight',
        'Choose snake or straight draft order.',
      );
      pool.mode = body.mode;
      assert(
        Array.isArray(body.members) &&
          body.members.length >= 2 &&
          body.members.length <= 40,
        'Add between 2 and 40 participants.',
      );
      const names = new Set<string>(),
        ids = new Set<string>(),
        codes: { id: string; name: string; code: string }[] = [];
      const members = [];
      for (const entry of body.members) {
        const name = text(entry.name, 40);
        assert(
          !names.has(name.toLowerCase()),
          'Participant names must be unique.',
        );
        names.add(name.toLowerCase());
        const existing = pool.members.find((m) => m.id === entry.id);
        const id = existing?.id ?? crypto.randomUUID();
        assert(!ids.has(id), 'A participant appears twice.');
        ids.add(id);
        let codeHash = existing?.codeHash;
        if (!codeHash) {
          const code = newCode();
          codeHash = await hash(code);
          codes.push({ id, name, code });
        }
        members.push({ id, name, codeHash });
      }
      pool.members = members;
      if (previousSeason !== pool.season) {
        pool.teams = [];
        pool.players = [];
        pool.fieldConfirmed = false;
        pool.statsUpdatedAt = null;
        pool.scores = {};
        pool.scoresUpdatedAt = null;
        pool.scoreError = null;
      }
      logEvent(pool, 'Commissioner saved draft order and pool settings.');
      await savePool(pool, revision);
      return json({ ok: true, codes });
    }
    if (body.action === 'field') {
      assert(
        pool.picks.length === 0 && pool.status !== 'drafting',
        'Pause the draft to edit the field before the first pick.',
        409,
      );
      assert(Array.isArray(body.teamIds), 'Select the playoff teams.');
      const all = await teamsFor(pool.season);
      const selected = all.filter((t) => body.teamIds.includes(t.id));
      assert(
        selected.filter((t) => t.league === 'AL').length === 6 &&
          selected.filter((t) => t.league === 'NL').length === 6,
        'Confirm exactly six AL teams and six NL teams.',
      );
      assert(
        body.confirmed === true,
        'Confirm that the selected teams are the official playoff field.',
      );
      pool.teams = selected;
      pool.fieldConfirmed = true;
      pool.players = [];
      pool.statsUpdatedAt = null;
      logEvent(pool, 'Commissioner confirmed the playoff field.');
      await savePool(pool, revision);
      return json({ ok: true });
    }
    if (body.action === 'start') {
      requireReady(pool);
      assert(
        pool.status !== 'complete',
        'The draft is complete. Undo the last pick to reopen it.',
        409,
      );
      pool.status = 'drafting';
      logEvent(pool, 'Commissioner opened the draft.');
    } else if (body.action === 'pause') {
      assert(pool.status === 'drafting', 'The draft is not running.', 409);
      pool.status = 'paused';
      logEvent(pool, 'Commissioner paused the draft.');
    } else if (body.action === 'undo') {
      assert(pool.picks.length > 0, 'There are no picks to undo.');
      assert(
        pool.status !== 'drafting',
        'Pause the draft before undoing a pick.',
        409,
      );
      const last = pool.picks.pop()!;
      pool.status = 'paused';
      logEvent(
        pool,
        'Commissioner undid pick ' +
          last.number +
          ': ' +
          last.player.name +
          '.',
      );
    } else {
      throw new PoolError('Unknown action.');
    }
    await savePool(pool, revision);
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
