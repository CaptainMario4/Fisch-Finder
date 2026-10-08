// The workflow token is scoped to this repository and never sent to a wiki.
import fs from 'node:fs/promises';
const repository = process.env.GITHUB_REPOSITORY;
const branch = process.env.FANDOM_TARGET_BRANCH;
if (repository !== 'CaptainMario4/Fisch-Finder' || !['main','secondary/fandom'].includes(branch)) throw new Error('Unexpected publication target');
const path = 'src/data/fandom-secondary.json';
const endpoint = 'https://api.github.com/repos/' + repository + '/contents/' + path;
const headers = { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
const before = await fetch(endpoint + '?ref=' + encodeURIComponent(branch), { headers });
if (!before.ok && before.status !== 404) throw new Error('Cannot read current secondary cache: ' + before.status);
const existing = before.ok ? await before.json() : undefined;
const bytes = await fs.readFile(path), next = JSON.parse(bytes.toString('utf8'));
if (existing?.content) {
  const previous = JSON.parse(Buffer.from(existing.content, 'base64').toString('utf8'));
  if (Date.parse(previous.checkedAt) > Date.parse(next.checkedAt)) throw new Error('Refusing to publish an older secondary check');
}
const content = bytes.toString('base64');
const result = await fetch(endpoint, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ branch, message: 'Refresh validated Fandom secondary cache', content, ...(existing ? { sha: existing.sha } : {}) }) });
if (!result.ok) throw new Error('Secondary cache publication failed: ' + result.status);
console.log('Published validated secondary cache only.');
