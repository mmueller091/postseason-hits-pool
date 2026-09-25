# Postseason Hits Pool

A shared MLB playoff draft and hit standings app. No advertising or promotional copy.

## Pool rules

- Each participant drafts one AL player, one NL player, and a wildcard from either league.
- The AL and NL picks must both be complete before the wildcard.
- Each MLB player can be drafted only once in the entire pool.
- The commissioner chooses snake or straight order.
- Only players imported from the commissioner-confirmed playoff teams are available.
- Most combined postseason hits wins; ties share rank.
- Hits include the Wild Card, Division Series, League Championship Series and World Series. Eliminated players keep their hits.

## Pages and access

- `/`: draft board with search, team and league filters, sortable AVG, H, PA, AB, OPS, HR and RBI.
- `/standings`: participant totals and each player's hits by round.
- `/commissioner`: public commissioner controls with no sign-in. It is intentionally absent from public navigation and the draft board.

Commissioner controls are intentionally public. Anyone who knows or discovers `/commissioner` or its API can change settings, control the draft and replace participant codes. Omitting the page from navigation does not restrict access. Participants still select their name and use a personal code for normal drafting.

No commissioner key is needed to open the page. A private server session secret is still used to sign participant sessions. Only a non-secret example environment file belongs in GitHub. Local secrets and database files are excluded by `.gitignore`.

## Start locally

Requires Node.js 22.13 or later and npm.

1. Run `npm ci`.
2. Copy `.env.example` to `.dev.vars`.
3. Generate a key with `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`.
4. Paste it after `SESSION_SECRET=` in `.dev.vars`. Use `SITE_URL=http://localhost:3000`.
5. Run `npm run dev`.
6. Open the URL printed by the server. Open `/commissioner` directly; it opens without signing in.

Local shared state is saved in the ignored `.wrangler` folder. All participants need to use the same hosted app for shared play across their own devices.

## Commissioner setup

1. Save the pool season, participant names, order and snake/straight setting.
2. Save the personal codes shown after creating participants. Give each person only their own code.
3. When the playoff field is final, select six AL teams and six NL teams. “Find clinched teams” helps fill the list, but you must review and confirm it.
4. Load players and stats. The app imports active batters and two-way players from those teams.
5. Open the draft.
6. Pause to correct a mistake. “Undo last pick” makes that player available again and leaves the draft paused.

After the first pick, the season, field, player list and participant order are frozen. Codes can still be replaced. Export the pool from the commissioner page for a readable record of participants, picks and scores.

## GitHub

Upload the contents of this source folder to a repository, including hidden `.github` and `.openai` folders. Do not upload `.dev.vars`, `.env`, `node_modules`, `.wrangler`, private access-code files or your server session secret.

The included check workflow runs type checks, rule tests and a production build on pushes and pull requests. The deployment workflow runs only when manually selected in GitHub Actions.

**GitHub Pages alone cannot run this app.** Shared picks, participant sessions and statistics updates require a server and a database. The included deployment workflow targets Cloudflare Workers with D1, while the source lives on GitHub.

### Deploy from GitHub to Cloudflare

1. Create a Cloudflare account, enable Workers, and create a D1 database for the pool.
2. Create a Cloudflare API token with permissions for Workers scripts and D1 for that account.
3. In the GitHub repository, create a `production` environment.
4. Add these environment secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `SESSION_SECRET`: your own random value of at least 24 characters.
5. Add these environment variables:
   - `CLOUDFLARE_D1_DATABASE_ID`: the database ID.
   - `POOL_WORKER_NAME`: a lowercase Worker name, such as `postseason-hits-pool`.
   - `SITE_URL`: the Worker's complete HTTPS address or configured custom domain.
6. Run **Deploy pool** under GitHub Actions. The workflow builds the app, configures the Worker, applies the database migration, stores the participant session secret and deploys.
7. Open `/commissioner` on that address and set up the pool.

Changing `SESSION_SECRET` signs out existing participant sessions. Existing local setups may still use the legacy `COMMISSIONER_KEY` variable as a fallback for session signing; it no longer protects the commissioner page. GitHub storage does not itself publish the app or transfer the local database. A new hosted database starts empty.

## MLB data and update behavior

MLB's public Stats API supplies team, roster and batting data at [statsapi.mlb.com](https://statsapi.mlb.com).

- The draft board shows the selected season's **regular-season** batting statistics.
- Standings count **postseason** hits only, using game types F, D, L and W separately.
- Standings refresh when opened and once per minute while open. There is no background scheduler while all pages are closed.
- Cumulative totals are replaced on refresh so repeat requests do not add the same hits twice and official scoring corrections can reduce totals.
- If any round fails to load, the last successful totals are preserved and the app reports the feed error.
- Imported active rosters are a snapshot, not a guarantee of a player's inclusion on a later postseason series roster.
- Do not confirm a projected playoff field before it is official.

The current team-count validation supports the 12-team format used from 2022 onward. For another year, use a fresh database/deployment and retain the previous pool's export or deployment for its history.

## Validation and implementation

Commands:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run db:generate` after schema changes

Stack: React, TypeScript, Vinext/Vite, Cloudflare Workers, D1, shadcn controls, TanStack Query and Table.

Draft validation runs on the server. Database writes use a revision compare-and-swap, and draft requests carry the expected pick number. Competing or stale requests cannot consume two picks, including consecutive snake turns. Session cookies are signed, HttpOnly, SameSite, and Secure on HTTPS. Participant codes are hashed; code hashes are excluded from public responses.

Rule tests cover turn order, AL/NL/wildcard restrictions, duplicate picks, stale submissions, undo, ties, traded-player stat totals and postseason aggregation. A local integration run also verified real MLB imports, a complete three-person draft, concurrent picks, stored reloads, score refreshes and code revocation.

Dependency note: the inherited Vinext dependency includes image-size 2.0.2, which npm audit flags for malformed ICNS/JXL/HEIF image parsing. This app does not accept image uploads or use those formats. Review dependency advisories before public deployment; no claim of a clean dependency audit is made.

