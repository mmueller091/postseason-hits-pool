import fs from 'node:fs';
const { POOL_WORKER_NAME, CLOUDFLARE_D1_DATABASE_ID, SITE_URL } = process.env;
if (!POOL_WORKER_NAME || !/^[a-z0-9-]+$/.test(POOL_WORKER_NAME))
  throw new Error('Set POOL_WORKER_NAME to a lowercase Worker name.');
if (!CLOUDFLARE_D1_DATABASE_ID)
  throw new Error('Set CLOUDFLARE_D1_DATABASE_ID to your database ID.');
if (!SITE_URL || !SITE_URL.startsWith('https://'))
  throw new Error('Set SITE_URL to your public HTTPS Worker URL.');
const file = 'dist/server/wrangler.json';
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
config.name = POOL_WORKER_NAME;
config.d1_databases = [
  {
    binding: 'DB',
    database_id: CLOUDFLARE_D1_DATABASE_ID,
    database_name: POOL_WORKER_NAME,
    migrations_dir: '../../drizzle',
  },
];
config.vars = { ...(config.vars || {}), SITE_URL };
delete config.route;
delete config.routes;
fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
console.log('Prepared Cloudflare Worker settings.');
