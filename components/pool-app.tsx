'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Download,
  ListOrdered,
  LockKeyhole,
  LogOut,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trophy,
  Undo2,
  UserRound,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  emptyPool,
  nextMember,
  slotFor,
  standings,
  type Member,
  type Player,
  type Pool,
  type Team,
} from '@/lib/domain';

type View = 'draft' | 'standings' | 'commissioner';
type Snapshot = {
  pool: Pool;
  revision: number;
  auth: { admin: boolean; memberId: string | null };
};
type Code = { id: string; name: string; code: string };
type Act = (action: string, body?: Record<string, unknown>) => Promise<any>;
async function read(url = '/api/pool'): Promise<any> {
  const response = await fetch(url, { cache: 'no-store' });
  const data: any = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Unable to load the pool.');
  return data;
}
function stamp(value: string | null) {
  return value
    ? new Date(value).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Not updated yet';
}
function saveFile(name: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function LeagueBadge({ league }: { league: string }) {
  return (
    <span className={'league-badge ' + league.toLowerCase()}>
      {league === 'W' ? 'WC' : league}
    </span>
  );
}
function Heading({ pool, view }: { pool: Pool; view: View }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{pool.season} postseason</p>
        <h1>
          {view === 'draft'
            ? 'Draft board'
            : view === 'standings'
              ? 'Standings'
              : 'Commissioner'}
        </h1>
        <p>
          {view === 'draft'
            ? 'One AL player. One NL player. Then one from either league.'
            : view === 'standings'
              ? 'Combined hits from every postseason round.'
              : 'Manage the playoff field, participants and draft.'}
        </p>
      </div>
      <span className="status">
        <span />
        {pool.status === 'complete'
          ? 'Draft complete'
          : pool.status === 'drafting'
            ? 'Draft open'
            : pool.status}
      </span>
    </div>
  );
}
export default function PoolApp({ view }: { view: View }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <App view={view} />
    </QueryClientProvider>
  );
}

function App({ view }: { view: View }) {
  const client = useQueryClient();
  const query = useQuery<Snapshot>({
    queryKey: ['pool'],
    queryFn: () => read(),
    refetchInterval: 8000,
  });
  const pool = query.data?.pool ?? emptyPool(),
    auth = query.data?.auth ?? { admin: false, memberId: null };
  const [pending, setPending] = useState(false),
    [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(
      null,
    ),
    [identity, setIdentity] = useState(false);
  useEffect(() => {
    if (view !== 'standings') return;
    const run = () => {
      read('/api/pool?kind=scores')
        .then((data) => client.setQueryData(['pool'], data))
        .catch(() => {});
    };
    run();
    const timer = setInterval(run, 60000);
    return () => clearInterval(timer);
  }, [view, client]);
  async function act(action: string, body: Record<string, unknown> = {}) {
    setPending(true);
    setNotice(null);
    try {
      const response = await fetch('/api/pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          revision: query.data?.revision,
          ...body,
        }),
      });
      const data: any = await response.json();
      if (!response.ok) throw new Error(data.error);
      await client.invalidateQueries({ queryKey: ['pool'] });
      return data;
    } catch (error) {
      setNotice({
        text:
          error instanceof Error
            ? error.message
            : 'The action could not be completed.',
        error: true,
      });
      throw error;
    } finally {
      setPending(false);
    }
  }
  const selectedMember = pool.members.find((m) => m.id === auth.memberId);
  return (
    <>
      <header className="site-header">
        <a className="brand" href="/">
          <span className="brand-mark">H</span>
          <span>
            Postseason <strong>Hits Pool</strong>
          </span>
        </a>
        <span className="season-label">MLB · {pool.season}</span>
      </header>
      <nav className="site-nav" aria-label="Main navigation">
        {[
          ['draft', '/', 'Draft board', ListOrdered],
          ['standings', '/standings', 'Standings', Trophy],
        ].map(([id, href, label, Icon]: any) => (
          <a
            key={id}
            href={href}
            className={view === id ? 'active' : ''}
            aria-current={view === id ? 'page' : undefined}
          >
            <Icon size={17} />
            {label}
          </a>
        ))}
        <div className="nav-person">
          <Button variant="ghost" onClick={() => setIdentity(true)}>
            <UserRound />
            {selectedMember?.name ?? 'Select your name'}
          </Button>
        </div>
      </nav>
      <main className="shell">
        <Heading pool={pool} view={view} />
        {query.error && (
          <div className="notice error" role="alert">
            The pool could not be refreshed. {query.error.message}{' '}
            <Button variant="outline" onClick={() => query.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {notice && (
          <div
            className={'notice ' + (notice.error ? 'error' : 'success')}
            role={notice.error ? 'alert' : 'status'}
          >
            {notice.text}
            <button
              aria-label="Dismiss message"
              onClick={() => setNotice(null)}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {!query.data ? (
          <section className="panel empty-state">
            <RefreshCw className="spin" />
            <h3>Loading the shared pool</h3>
            <p>Retrieving draft settings, players and picks.</p>
          </section>
        ) : view === 'draft' ? (
          <Draft
            pool={pool}
            memberId={auth.memberId}
            act={act}
            pending={pending}
            selectIdentity={() => setIdentity(true)}
          />
        ) : view === 'standings' ? (
          <Standings
            pool={pool}
            onRefresh={async () => {
              setPending(true);
              try {
                client.setQueryData(
                  ['pool'],
                  await read('/api/pool?kind=scores'),
                );
                setNotice({ text: 'Checked postseason statistics.' });
              } catch (e) {
                setNotice({ text: String(e), error: true });
              } finally {
                setPending(false);
              }
            }}
            pending={pending}
          />
        ) : (
          <Commissioner
            pool={pool}
            act={act}
            pending={pending}
            notify={(text) => setNotice({ text })}
          />
        )}
        <footer className="page-footer">
          <span>Postseason hits only · Ties share the same rank</span>
          <a href="https://statsapi.mlb.com" target="_blank" rel="noreferrer">
            Stats: MLB
          </a>
          <details>
            <summary>Pool rules</summary>
            <p>
              Each participant drafts three unique players. The first two must
              include one from the American League and one from the National
              League, in either order. The third is a wildcard from either
              league. No player may be selected twice. Hits from the Wild Card,
              Division Series, League Championship Series and World Series are
              added together. Eliminated players keep their hits. Equal totals
              remain tied.
            </p>
          </details>
        </footer>
      </main>
      <Dialog open={identity} onOpenChange={setIdentity}>
        <DialogContent>
          <DialogTitle>
            {selectedMember
              ? 'Drafting as ' + selectedMember.name
              : 'Select your name'}
          </DialogTitle>
          <DialogDescription>
            Use the personal access code provided by the commissioner.
          </DialogDescription>
          {selectedMember ? (
            <>
              <p>Your AL, NL and wildcard picks are saved to this name.</p>
              <Button
                variant="outline"
                onClick={async () => {
                  await act('logout', { role: 'member' }).catch(() => {});
                }}
              >
                <LogOut />
                Switch participant
              </Button>
            </>
          ) : (
            <MemberLogin
              members={pool.members}
              act={act}
              pending={pending}
              close={() => setIdentity(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function MemberLogin({
  members,
  act,
  pending,
  close,
}: {
  members: Member[];
  act: Act;
  pending: boolean;
  close: () => void;
}) {
  const [memberId, setMemberId] = useState(''),
    [code, setCode] = useState(''),
    [error, setError] = useState('');
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        try {
          await act('login', { role: 'member', memberId, code });
          close();
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <label>
        Your name
        <NativeSelect
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          required
        >
          <option value="">Choose a participant</option>
          {members.map((m) => (
            <option value={m.id} key={m.id}>
              {m.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label>
        Access code
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="one-time-code"
          required
          placeholder="Your 8-character code"
        />
      </label>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending || !members.length}>
        Join draft
        <ChevronRight />
      </Button>
      {!members.length && (
        <p className="muted">
          The commissioner has not added participants yet.
        </p>
      )}
    </form>
  );
}

function Draft({
  pool,
  memberId,
  act,
  pending,
  selectIdentity,
}: {
  pool: Pool;
  memberId: string | null;
  act: Act;
  pending: boolean;
  selectIdentity: () => void;
}) {
  const [search, setSearch] = useState(''),
    [league, setLeague] = useState('all'),
    [team, setTeam] = useState('all'),
    [availableOnly, setAvailableOnly] = useState(true),
    [tab, setTab] = useState('players'),
    [selected, setSelected] = useState<{
      player: Player;
      expected: number;
    } | null>(null);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'hits', desc: true },
  ]);
  const [dialogError, setDialogError] = useState('');
  const next = nextMember(pool),
    mine = pool.picks.filter((p) => p.memberId === memberId),
    myTurn = pool.status === 'drafting' && next?.id === memberId;
  const drafted = useMemo(
    () => new Map(pool.picks.map((p) => [p.player.id, p])),
    [pool.picks],
  );
  const data = useMemo(
    () =>
      pool.players.filter(
        (p) =>
          (!search || p.name.toLowerCase().includes(search.toLowerCase())) &&
          (league === 'all' || p.league === league) &&
          (team === 'all' || p.teamId === Number(team)) &&
          (!availableOnly || !drafted.has(p.id)),
      ),
    [pool.players, search, league, team, availableOnly, drafted],
  );
  function reason(p: Player) {
    const pick = drafted.get(p.id);
    if (pick)
      return (
        'Taken by ' + pool.members.find((m) => m.id === pick.memberId)?.name
      );
    if (!memberId) return 'Select your name';
    if (pool.status !== 'drafting')
      return pool.status === 'complete' ? 'Draft complete' : 'Draft not open';
    if (!myTurn) return 'Waiting for turn';
    if (!slotFor(pool.picks, memberId, p.league))
      return 'Need ' + (p.league === 'AL' ? 'NL' : 'AL') + ' first';
    return '';
  }
  const columns: ColumnDef<Player>[] = [
    {
      accessorKey: 'name',
      header: 'Player',
      cell: ({ row }) => (
        <div className="player-name">
          <span className="team-code">{row.original.team}</span>
          <div>
            <strong>{row.original.name}</strong>
            <small>{row.original.position}</small>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'league',
      header: 'LG',
      cell: ({ getValue }) => <LeagueBadge league={String(getValue())} />,
    },
    ...[
      ['avg', 'AVG'],
      ['hits', 'H'],
      ['pa', 'PA'],
      ['ab', 'AB'],
      ['ops', 'OPS'],
      ['hr', 'HR'],
      ['rbi', 'RBI'],
    ].map(([accessorKey, header]) => ({
      accessorKey,
      header,
      sortingFn: (a: any, b: any, id: string) =>
        Number(a.getValue(id)) - Number(b.getValue(id)),
      cell: ({ getValue }: any) => <span className="stat">{getValue()}</span>,
    })),
    {
      id: 'draft',
      header: '',
      enableSorting: false,
      cell: ({ row }) => {
        const why = reason(row.original);
        return (
          <Button
            size="sm"
            variant={why ? 'ghost' : 'default'}
            disabled={!!why || pending}
            title={why || 'Draft ' + row.original.name}
            onClick={() => {
              setDialogError('');
              setSelected({
                player: row.original,
                expected: pool.picks.length,
              });
            }}
          >
            {why || 'Draft'}
            {!why && <Plus size={13} />}
          </Button>
        );
      },
    },
  ];
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  return (
    <>
      <div className={'turn-strip ' + (myTurn ? 'your-turn' : '')}>
        <div className="turn-icon">
          <ListOrdered />
        </div>
        <div>
          <p className="eyebrow">
            {pool.status === 'drafting'
              ? 'Pick ' +
                (pool.picks.length + 1) +
                ' of ' +
                pool.members.length * 3 +
                ' · Round ' +
                (Math.floor(
                  pool.picks.length / Math.max(pool.members.length, 1),
                ) +
                  1)
              : pool.status === 'complete'
                ? 'All picks are in'
                : pool.status === 'paused'
                  ? 'Draft paused'
                  : 'Before the draft'}
          </p>
          <strong>
            {myTurn
              ? 'Your turn to draft'
              : pool.status === 'drafting'
                ? next?.name + ' is on the clock'
                : pool.status === 'complete'
                  ? 'Follow your players on the standings page'
                  : pool.status === 'paused'
                    ? 'The commissioner will resume the draft'
                    : 'Waiting for commissioner setup'}
          </strong>
        </div>
        <div className="turn-meta">
          {pool.members.length > 0 && (
            <span>
              {pool.members.length} participants ·{' '}
              {pool.mode === 'snake' ? 'Snake' : 'Straight'} draft
            </span>
          )}
          {!memberId && (
            <Button variant="outline" onClick={selectIdentity}>
              <UserRound />
              Select your name
            </Button>
          )}
        </div>
      </div>
      <div className="draft-layout">
        <div className="stack">
          <section className="panel">
            <div className="panel-heading">
              <div className="panel-tabs">
                <button
                  className={tab === 'players' ? 'active' : ''}
                  onClick={() => setTab('players')}
                >
                  Available players{' '}
                  <span>{pool.players.length - pool.picks.length}</span>
                </button>
                <button
                  className={tab === 'results' ? 'active' : ''}
                  onClick={() => setTab('results')}
                >
                  Draft results
                </button>
              </div>
              <span className="muted">
                {pool.picks.length} / {pool.members.length * 3} picks
              </span>
            </div>
            {tab === 'results' ? (
              <RosterBoard pool={pool} />
            ) : !pool.players.length ? (
              <div className="empty-state">
                <LockKeyhole size={30} />
                <h3>
                  {pool.fieldConfirmed
                    ? 'Player list not loaded yet'
                    : 'Waiting for the playoff field'}
                </h3>
                <p>
                  {pool.fieldConfirmed
                    ? 'The commissioner can now load batters and their regular-season statistics.'
                    : 'The commissioner will confirm the playoff teams before players become available.'}
                </p>
              </div>
            ) : (
              <>
                <div className="filters">
                  <div className="search-field">
                    <Search size={16} />
                    <Input
                      aria-label="Search players"
                      placeholder="Search players"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <NativeSelect
                    aria-label="Filter by league"
                    value={league}
                    onChange={(e) => setLeague(e.target.value)}
                  >
                    <option value="all">Both leagues</option>
                    <option value="AL">American League</option>
                    <option value="NL">National League</option>
                  </NativeSelect>
                  <NativeSelect
                    aria-label="Filter by team"
                    value={team}
                    onChange={(e) => setTeam(e.target.value)}
                  >
                    <option value="all">All playoff teams</option>
                    {pool.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.abbreviation}
                      </option>
                    ))}
                  </NativeSelect>
                  <label className="check-label">
                    <Checkbox
                      checked={availableOnly}
                      onCheckedChange={(v) => setAvailableOnly(!!v)}
                    />
                    Available only
                  </label>
                </div>
                <div className="table-note">
                  Regular season {pool.season} · Updated{' '}
                  {stamp(pool.statsUpdatedAt)} · {data.length} players
                </div>
                <Table className="player-table">
                  <TableHeader>
                    {table.getHeaderGroups().map((group) => (
                      <TableRow key={group.id}>
                        {group.headers.map((header) => (
                          <TableHead
                            key={header.id}
                            aria-sort={
                              header.column.getIsSorted() === 'asc'
                                ? 'ascending'
                                : header.column.getIsSorted() === 'desc'
                                  ? 'descending'
                                  : undefined
                            }
                          >
                            {header.column.getCanSort() ? (
                              <button
                                className="sort-button"
                                onClick={header.column.getToggleSortingHandler()}
                              >
                                {flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                                {header.column.getIsSorted() && (
                                  <span>
                                    {header.column.getIsSorted() === 'desc'
                                      ? '↓'
                                      : '↑'}
                                  </span>
                                )}
                              </button>
                            ) : (
                              flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )
                            )}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!data.length && (
                  <div className="empty-state">
                    <h3>No players match these filters</h3>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearch('');
                        setLeague('all');
                        setTeam('all');
                        setAvailableOnly(false);
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                )}
                <div className="table-note">
                  AVG: batting average · H: hits · PA: plate appearances · AB:
                  at bats · OPS: on-base plus slugging · HR: home runs · RBI:
                  runs batted in
                </div>
              </>
            )}
          </section>
          {pool.teams.length > 0 && (
            <section className="field-strip">
              <p className="eyebrow">Confirmed playoff field</p>
              <div>
                {pool.teams.map((t) => (
                  <span key={t.id} title={t.name}>
                    <LeagueBadge league={t.league} />
                    {t.abbreviation}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
        <aside className="stack">
          <section className="panel pad">
            <p className="eyebrow">Your roster</p>
            <h2>
              {pool.members.find((m) => m.id === memberId)?.name ??
                'Select your name'}
            </h2>
            {(['AL', 'NL', 'W'] as const).map((slot, i) => {
              const pick = mine.find((p) => p.slot === slot);
              return (
                <div
                  className={'roster-slot ' + (pick ? 'filled' : '')}
                  key={slot}
                >
                  <LeagueBadge league={slot} />
                  <div>
                    <strong>
                      {pick?.player.name ??
                        (slot === 'AL'
                          ? 'American League'
                          : slot === 'NL'
                            ? 'National League'
                            : 'Wildcard')}
                    </strong>
                    <p>
                      {pick
                        ? pick.player.team + ' · Pick ' + pick.number
                        : slot === 'W' && mine.length < 2
                          ? 'Unlocks after AL + NL'
                          : 'Not drafted'}
                    </p>
                  </div>
                  {pick && <Check size={14} />}
                </div>
              );
            })}
            <div className="roster-progress">
              {mine.length} of 3 drafted
              <div>
                <span style={{ width: (mine.length / 3) * 100 + '%' }} />
              </div>
            </div>
          </section>
          <section className="panel pad">
            <p className="eyebrow">Draft order</p>
            <h2>
              {pool.mode === 'snake'
                ? 'Reverses each round'
                : 'Same order each round'}
            </h2>
            <ol className="order-list">
              {pool.members.map((m, i) => (
                <li
                  className={
                    next?.id === m.id && pool.status === 'drafting'
                      ? 'current'
                      : ''
                  }
                  key={m.id}
                >
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <strong>{m.name}</strong>
                  <small>
                    {pool.picks.filter((p) => p.memberId === m.id).length}/3
                  </small>
                </li>
              ))}
            </ol>
            {!pool.members.length && (
              <p className="muted">No participants added yet.</p>
            )}
          </section>
          {pool.picks.length > 0 && (
            <section className="recent-picks">
              <p className="eyebrow">Recent picks</p>
              {pool.picks
                .slice(-4)
                .reverse()
                .map((p) => (
                  <div key={p.number}>
                    <span>#{p.number}</span>
                    <p>
                      <strong>{p.player.name}</strong>
                      <small>
                        {pool.members.find((m) => m.id === p.memberId)?.name} ·{' '}
                        {p.slot === 'W' ? 'Wildcard' : p.slot}
                      </small>
                    </p>
                  </div>
                ))}
            </section>
          )}
        </aside>
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Draft {selected?.player.name}?</DialogTitle>
          <DialogDescription>
            {selected?.player.team} · {selected?.player.league} ·{' '}
            {memberId && selected
              ? slotFor(pool.picks, memberId, selected.player.league) === 'W'
                ? 'Wildcard pick'
                : 'League pick'
              : ''}
          </DialogDescription>
          <p>
            This player will be added to your roster and removed from everyone
            else’s available players.
          </p>
          {dialogError && (
            <p className="inline-error" role="alert">
              {dialogError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={async () => {
                if (!selected) return;
                try {
                  await act('pick', {
                    playerId: selected.player.id,
                    expectedPick: selected.expected,
                  });
                  setSelected(null);
                } catch (e) {
                  setDialogError((e as Error).message);
                }
              }}
            >
              {pending ? 'Saving pick…' : 'Confirm pick'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
function RosterBoard({ pool }: { pool: Pool }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Participant</TableHead>
          <TableHead>AL</TableHead>
          <TableHead>NL</TableHead>
          <TableHead>Wildcard</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pool.members.map((m) => (
          <TableRow key={m.id}>
            <TableCell>
              <strong>{m.name}</strong>
            </TableCell>
            {['AL', 'NL', 'W'].map((slot) => {
              const p = pool.picks.find(
                (p) => p.memberId === m.id && p.slot === slot,
              );
              return (
                <TableCell key={slot}>
                  {p ? (
                    <div className="compact-player">
                      <strong>{p.player.name}</strong>
                      <small>
                        {p.player.team} · #{p.number}
                      </small>
                    </div>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
function Standings({
  pool,
  onRefresh,
  pending,
}: {
  pool: Pool;
  onRefresh: () => void;
  pending: boolean;
}) {
  const rows = standings(pool),
    top = rows[0]?.total ?? 0;
  return (
    <>
      <div className="summary-grid">
        <div>
          <p className="eyebrow">Leading total</p>
          <strong>
            {pool.scoresUpdatedAt ? top : '—'}
            <small> hits</small>
          </strong>
        </div>
        <div>
          <p className="eyebrow">Players drafted</p>
          <strong>
            {pool.picks.length}
            <small> / {pool.members.length * 3}</small>
          </strong>
        </div>
        <div className="sync-summary">
          <p className="eyebrow">MLB postseason stats</p>
          <p>{stamp(pool.scoresUpdatedAt)}</p>
          <Button variant="outline" onClick={onRefresh} disabled={pending}>
            <RefreshCw className={pending ? 'spin' : ''} />
            Check for updates
          </Button>
        </div>
      </div>
      {pool.scoreError && (
        <div className="notice error" role="alert">
          MLB’s feed could not be refreshed. Showing the last successful totals.{' '}
          {pool.scoreError}
        </div>
      )}
      {!pool.scoresUpdatedAt && (
        <div className="notice">
          Postseason totals have not been checked yet. Regular-season hits never
          count toward this pool.
        </div>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Pool standings</h2>
          <span className="muted">
            Updates every minute while this page is open
          </span>
        </div>
        <Table className="standings-table">
          <TableHeader>
            <TableRow>
              <TableHead>Rank</TableHead>
              <TableHead>Participant</TableHead>
              <TableHead>AL</TableHead>
              <TableHead>NL</TableHead>
              <TableHead>Wildcard</TableHead>
              <TableHead>Total H</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                className={row.rank === 1 && row.total > 0 ? 'leader' : ''}
                key={row.member.id}
              >
                <TableCell>
                  <span className="rank">{row.rank}</span>
                </TableCell>
                <TableCell>
                  <strong>{row.member.name}</strong>
                  <small className="block muted">
                    {row.picks.length} / 3 players
                  </small>
                </TableCell>
                {['AL', 'NL', 'W'].map((slot) => {
                  const pick = row.picks.find((p) => p.slot === slot);
                  return (
                    <TableCell key={slot}>
                      {pick ? (
                        <div className="score-player">
                          <strong>
                            {pool.scores[pick.player.id]?.total ??
                              (pool.scoresUpdatedAt ? '0' : '—')}
                          </strong>
                          <span>
                            {pick.player.name}
                            <small>{pick.player.team}</small>
                          </span>
                        </div>
                      ) : (
                        <span className="muted">Not drafted</span>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell>
                  <strong className="total-hits">
                    {pool.scoresUpdatedAt ? row.total : '—'}
                  </strong>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!rows.length && (
          <div className="empty-state">
            <Trophy size={30} />
            <h3>No participants yet</h3>
            <p>
              Standings will appear when the commissioner adds your family to
              the pool.
            </p>
          </div>
        )}
      </section>
      {pool.picks.length > 0 && (
        <section className="panel round-panel">
          <div className="panel-heading">
            <h2>Hits by postseason round</h2>
            <span className="muted">
              Official cumulative totals · subject to MLB scoring corrections
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  'Player',
                  'Drafted by',
                  'WC',
                  'DS',
                  'LCS',
                  'WS',
                  'Total H',
                ].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...pool.picks]
                .sort(
                  (a, b) =>
                    (pool.scores[b.player.id]?.total ?? 0) -
                    (pool.scores[a.player.id]?.total ?? 0),
                )
                .map((p) => (
                  <TableRow key={p.number}>
                    <TableCell>
                      <div className="compact-player">
                        <strong>{p.player.name}</strong>
                        <small>
                          {p.player.team} ·{' '}
                          {p.slot === 'W' ? 'Wildcard' : p.slot}
                        </small>
                      </div>
                    </TableCell>
                    <TableCell>
                      {pool.members.find((m) => m.id === p.memberId)?.name}
                    </TableCell>
                    {(['F', 'D', 'L', 'W', 'total'] as const).map((key) => (
                      <TableCell key={key}>
                        <span className="stat">
                          {pool.scores[p.player.id]?.[key] ?? '—'}
                        </span>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          <p className="table-note">
            WC: Wild Card · DS: Division Series · LCS: League Championship
            Series · WS: World Series. Hits remain counted after a team is
            eliminated.
          </p>
        </section>
      )}
    </>
  );
}

function Commissioner({
  pool,
  act,
  pending,
  notify,
}: {
  pool: Pool;
  act: Act;
  pending: boolean;
  notify: (text: string) => void;
}) {
  const [codes, setCodes] = useState<Code[]>([]),
    [undo, setUndo] = useState(false);
  const ready =
    pool.fieldConfirmed && pool.players.length > 0 && pool.members.length >= 2;
  return (
    <>
      <div className="commissioner-toolbar">
        <div className="access-note">
          <Check size={16} />
          Commissioner controls
        </div>
        <div className="button-row">
          <Button
            variant="outline"
            onClick={() =>
              saveFile(
                'playoff-pool-' + pool.season + '.json',
                JSON.stringify(pool, null, 2),
                'application/json',
              )
            }
          >
            <Download />
            Export pool
          </Button>
        </div>
      </div>
      <section className="panel draft-controls">
        <div>
          <p className="eyebrow">Draft controls</p>
          <h2>
            {pool.picks.length} of {pool.members.length * 3} picks made
          </h2>
          <p>
            {pool.status === 'complete'
              ? 'All rosters are complete. Standings are ready.'
              : pool.picks.length
                ? 'Setup is locked while picks exist. Pause to undo the latest pick.'
                : 'Save participants, confirm teams and load players before opening.'}
          </p>
        </div>
        <div className="button-row">
          {pool.status === 'drafting' ? (
            <Button
              onClick={() => void act('pause').catch(() => {})}
              disabled={pending}
            >
              <Pause />
              Pause draft
            </Button>
          ) : (
            <Button
              onClick={() => void act('start').catch(() => {})}
              disabled={pending || !ready || pool.status === 'complete'}
            >
              <Play />
              {pool.status === 'paused' ? 'Resume draft' : 'Open draft'}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setUndo(true)}
            disabled={
              pending || !pool.picks.length || pool.status === 'drafting'
            }
          >
            <Undo2 />
            Undo last pick
          </Button>
        </div>
      </section>
      <div className="commissioner-grid">
        <div className="stack">
          <SettingsForm
            pool={pool}
            act={act}
            pending={pending}
            onCodes={(newCodes) => {
              setCodes(newCodes);
              notify('Pool settings saved.');
            }}
          />
          <section className="panel pad">
            <p className="eyebrow">Participant access</p>
            <h2>Personal draft codes</h2>
            <p className="muted">
              Each person selects their name and uses their own code. New codes
              are shown once when you save participants.
            </p>
            <div className="access-list">
              {pool.members.map((m) => (
                <div key={m.id}>
                  <strong>{m.name}</strong>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={async () => {
                      try {
                        const result = await act('resetCode', {
                          memberId: m.id,
                        });
                        setCodes(result.codes);
                      } catch {}
                    }}
                  >
                    Create replacement code
                  </Button>
                </div>
              ))}
            </div>
          </section>
        </div>
        <div className="stack">
          <FieldSetup pool={pool} act={act} pending={pending} notify={notify} />
          <section className="panel pad">
            <p className="eyebrow">Player list</p>
            <h2>{pool.players.length} available batters</h2>
            <p className="muted">
              Import batters from the selected teams’ MLB active rosters,
              including two-way players. This is a roster snapshot; postseason
              rosters may change by series.
            </p>
            <p className="muted">
              Regular-season stats updated: {stamp(pool.statsUpdatedAt)}
            </p>
            <Button
              variant="outline"
              disabled={pending || !pool.fieldConfirmed || !!pool.picks.length}
              onClick={async () => {
                try {
                  const result = await act('refreshPlayers');
                  notify(
                    'Loaded ' + result.count + ' batters and their statistics.',
                  );
                } catch {}
              }}
            >
              <RefreshCw className={pending ? 'spin' : ''} />
              {pool.players.length
                ? 'Refresh player list'
                : 'Load players & stats'}
            </Button>
          </section>
        </div>
      </div>
      <section className="panel round-panel">
        <div className="panel-heading">
          <h2>Pool activity</h2>
          <span className="muted">Most recent first</span>
        </div>
        <div className="activity-list">
          {pool.events.length ? (
            pool.events.map((event, i) => (
              <div key={i}>
                <time>{stamp(event.at)}</time>
                <span>{event.text}</span>
              </div>
            ))
          ) : (
            <p className="muted">No changes yet.</p>
          )}
        </div>
      </section>
      <Dialog
        open={codes.length > 0}
        onOpenChange={(open) => {
          if (!open) setCodes([]);
        }}
      >
        <DialogContent className="codes-dialog">
          <DialogTitle>Participant access codes</DialogTitle>
          <DialogDescription>
            Save these now, then give each person their code. Only the
            commissioner can create replacements.
          </DialogDescription>
          <div className="code-list">
            {codes.map((c) => (
              <div key={c.id}>
                <strong>{c.name}</strong>
                <code>{c.code}</code>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                saveFile(
                  'participant-access-codes.txt',
                  codes.map((c) => c.name + ': ' + c.code).join('\n'),
                )
              }
            >
              <Download />
              Save codes
            </Button>
            <Button onClick={() => setCodes([])}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={undo} onOpenChange={setUndo}>
        <DialogContent>
          <DialogTitle>Undo the last pick?</DialogTitle>
          <DialogDescription>
            {pool.picks.at(-1)?.player.name} will become available again. The
            draft will remain paused.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUndo(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={async () => {
                try {
                  await act('undo');
                  setUndo(false);
                } catch {}
              }}
            >
              Undo pick
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
function SettingsForm({
  pool,
  act,
  pending,
  onCodes,
}: {
  pool: Pool;
  act: Act;
  pending: boolean;
  onCodes: (codes: Code[]) => void;
}) {
  const [title, setTitle] = useState(pool.title),
    [season, setSeason] = useState(pool.season),
    [mode, setMode] = useState(pool.mode),
    [members, setMembers] = useState(
      pool.members.length
        ? pool.members
        : [
            { id: 'new-1', name: '' },
            { id: 'new-2', name: '' },
          ],
    ),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (dirty) return;
    setTitle(pool.title);
    setSeason(pool.season);
    setMode(pool.mode);
    setMembers(
      pool.members.length
        ? pool.members
        : [
            { id: 'new-1', name: '' },
            { id: 'new-2', name: '' },
          ],
    );
  }, [pool, dirty]);
  const locked = !!pool.picks.length || pool.status === 'drafting';
  function move(i: number, d: number) {
    setDirty(true);
    setMembers((old) => {
      const next = [...old];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>1. Participants & order</h2>
        {locked && <LockKeyhole size={16} />}
      </div>
      <form
        className="pad form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const result = await act('settings', {
              title,
              season,
              mode,
              members,
            });
            setDirty(false);
            onCodes(result.codes ?? []);
          } catch {}
        }}
      >
        <fieldset disabled={locked || pending} className="form-stack">
          <label>
            Pool name
            <Input
              value={title}
              maxLength={70}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
              required
            />
          </label>
          <div className="form-pair">
            <label>
              Season
              <Input
                type="number"
                min={2022}
                max={new Date().getFullYear() + 1}
                value={season}
                onChange={(e) => {
                  setSeason(Number(e.target.value));
                  setDirty(true);
                }}
                required
              />
            </label>
            <label>
              Draft format
              <NativeSelect
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as Pool['mode']);
                  setDirty(true);
                }}
              >
                <option value="snake">Snake draft</option>
                <option value="straight">Straight draft</option>
              </NativeSelect>
            </label>
          </div>
          <p className="muted">
            {mode === 'snake'
              ? 'Round 2 reverses the order. Round 3 returns to the original order.'
              : 'All three rounds use the order below.'}
          </p>
          <div className="edit-members">
            {members.map((m, i) => (
              <div key={m.id}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <Input
                  value={m.name}
                  aria-label={'Participant ' + (i + 1) + ' name'}
                  placeholder={'Participant ' + (i + 1)}
                  maxLength={40}
                  required
                  onChange={(e) => {
                    setDirty(true);
                    setMembers((old) =>
                      old.map((v) =>
                        v.id === m.id ? { ...v, name: e.target.value } : v,
                      ),
                    );
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={'Move ' + (m.name || 'participant') + ' up'}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={'Move ' + (m.name || 'participant') + ' down'}
                  disabled={i === members.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={'Remove ' + (m.name || 'participant')}
                  disabled={members.length <= 2}
                  onClick={() => {
                    setDirty(true);
                    setMembers((old) => old.filter((v) => v.id !== m.id));
                  }}
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={members.length >= 40}
            onClick={() => {
              setDirty(true);
              setMembers((old) => [
                ...old,
                { id: crypto.randomUUID(), name: '' },
              ]);
            }}
          >
            <Plus />
            Add participant
          </Button>
          <Button type="submit">Save participants & order</Button>
        </fieldset>
        {locked && (
          <p className="muted">
            Setup is locked after drafting begins. Pause and undo all picks to
            change it.
          </p>
        )}
      </form>
    </section>
  );
}
function FieldSetup({
  pool,
  act,
  pending,
  notify,
}: {
  pool: Pool;
  act: Act;
  pending: boolean;
  notify: (text: string) => void;
}) {
  const teamsQuery = useQuery<{ teams: Team[] }>({
    queryKey: ['teams', pool.season],
    queryFn: () => read('/api/pool?kind=teams&season=' + pool.season),
    staleTime: 3600000,
  });
  const [selected, setSelected] = useState(pool.teams.map((t) => t.id)),
    [confirmed, setConfirmed] = useState(false),
    [dirty, setDirty] = useState(false),
    [finding, setFinding] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (!dirty) {
      setSelected(pool.teams.map((t) => t.id));
      setConfirmed(false);
    }
  }, [pool.teams, dirty]);
  useEffect(() => {
    setSelected(pool.teams.map((t) => t.id));
    setDirty(false);
    setConfirmed(false);
  }, [pool.season]);
  const all = teamsQuery.data?.teams ?? [],
    locked = !!pool.picks.length || pool.status === 'drafting';
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>2. Playoff teams</h2>
        {pool.fieldConfirmed && (
          <span className="saved-label">
            <Check size={14} />
            Confirmed
          </span>
        )}
      </div>
      <div className="pad">
        <p className="muted">
          Select the six playoff teams in each league once the field is set.
          Current standings are not automatically treated as the final field.
        </p>
        <Button
          variant="outline"
          disabled={pending || locked || finding}
          onClick={async () => {
            setFinding(true);
            setError('');
            try {
              const data = await read(
                '/api/pool?kind=candidates&season=' + pool.season,
              );
              setSelected(data.teamIds);
              setDirty(true);
              setConfirmed(false);
              notify(
                data.teamIds.length +
                  ' clinched teams found. Review and confirm the final field.',
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setFinding(false);
            }
          }}
        >
          <RefreshCw className={finding ? 'spin' : ''} />
          {finding ? 'Checking MLB…' : 'Find clinched teams'}
        </Button>
        {(teamsQuery.error || error) && (
          <p className="inline-error" role="alert">
            {error || teamsQuery.error?.message}{' '}
            <Button variant="ghost" onClick={() => teamsQuery.refetch()}>
              Retry
            </Button>
          </p>
        )}
        <div className="league-grid">
          {(['AL', 'NL'] as const).map((league) => (
            <fieldset disabled={locked || pending} key={league}>
              <legend>
                <LeagueBadge league={league} />
                <strong>
                  {
                    selected.filter(
                      (id) => all.find((t) => t.id === id)?.league === league,
                    ).length
                  }{' '}
                  / 6
                </strong>
              </legend>
              {all
                .filter((t) => t.league === league)
                .map((t) => (
                  <label className="team-choice" key={t.id}>
                    <Checkbox
                      checked={selected.includes(t.id)}
                      onCheckedChange={(v) => {
                        setDirty(true);
                        setConfirmed(false);
                        setSelected((old) =>
                          v ? [...old, t.id] : old.filter((id) => id !== t.id),
                        );
                      }}
                    />
                    <span title={t.name}>{t.name}</span>
                  </label>
                ))}
            </fieldset>
          ))}
        </div>
        <label className="check-label confirm-field">
          <Checkbox
            checked={confirmed}
            disabled={locked || pending}
            onCheckedChange={(v) => {
              setDirty(true);
              setConfirmed(!!v);
            }}
          />
          <span>
            I confirm these are the official playoff teams for {pool.season}.
          </span>
        </label>
        <Button
          disabled={pending || locked || !confirmed || selected.length !== 12}
          onClick={async () => {
            try {
              await act('field', { teamIds: selected, confirmed });
              setDirty(false);
              notify('Playoff field confirmed. Load players and stats next.');
            } catch {}
          }}
        >
          Confirm playoff field
        </Button>
        <p className="muted">
          Changing the field clears the player list so it can be reloaded.
        </p>
      </div>
    </section>
  );
}
