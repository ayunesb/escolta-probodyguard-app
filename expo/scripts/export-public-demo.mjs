import { spawnSync } from 'node:child_process';
import { mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-demo');
// No .env or payment/server configuration is needed for this static demo.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('EXPO_PUBLIC_')));
Object.assign(env, { EXPO_NO_DOTENV: '1', EXPO_PUBLIC_DEMO_MODE: '1' });
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/expo/bin/cli'), 'export', '--platform', 'web', '--output-dir', dist], { cwd: root, env, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
let html = await readFile(path.join(dist, 'index.html'), 'utf8');
html = html.replace(/<title>.*?<\/title>/, '<title>Escolta Pro | Interactive Demo</title>')
  .replace(/content="Vetted close-protection professionals, booked in minutes and tracked in real time\."/g, 'content="Explore Escolta Pro as a client, protector, company or administrator. Sample data. No account required."')
  .replace('Escolta Pro — Executive protection', 'Escolta Pro | Interactive Demo')
  .replace('</head>', '<meta name="robots" content="noindex, nofollow"></head>');
await writeFile(path.join(dist, 'index.html'), html);
const output = path.join(root, '.vercel/output');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(dist, path.join(output, 'static'), { recursive: true });
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.tile.openstreetmap.org; font-src 'self' data:; media-src 'self' blob:; connect-src 'self' https://*.tile.openstreetmap.org; worker-src 'self' blob:; frame-ancestors 'none'; form-action 'none'; base-uri 'self'";
await writeFile(path.join(output, 'config.json'), JSON.stringify({ version: 3, routes: [
  { src: '/(.*)', headers: { 'Content-Security-Policy': csp, 'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=()', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' }, continue: true },
  { handle: 'filesystem' },
  { src: '/api/(.*)', status: 404, dest: '/index.html' },
  { src: '/(.*)', dest: '/index.html' },
]}, null, 2));
console.log('Public demo ready: static files only; no backend functions or environment files.');
