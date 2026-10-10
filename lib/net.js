// HTTP helper. In tests, FIXTURES_DIR points at recorded responses so nothing goes to the network.
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const UA = process.env.USER_AGENT || 'SlabExchange/1.0 (card price tracker)';

export function fixtureName(url) {
  const u = new URL(url);
  u.searchParams.delete('t');
  return (u.hostname + u.pathname + (u.search ? '_' + u.search.slice(1) : ''))
    .replace(/[^a-zA-Z0-9.-]+/g, '_').replace(/_+/g, '_').slice(0, 180) + '.json';
}

export async function getJSON(url, headers = {}) {
  const dir = process.env.FIXTURES_DIR;
  if (dir) {
    const file = path.join(dir, fixtureName(url));
    try { return JSON.parse(await readFile(file, 'utf8')); }
    catch (e) { throw new Error(`no fixture ${path.basename(file)}`); }
  }
  const res = await fetch(url, {
    headers: Object.assign({'User-Agent': UA, 'Accept': 'application/json'}, headers),
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).hostname}`);
  return res.json();
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
