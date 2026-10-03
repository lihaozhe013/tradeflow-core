import { createHash } from 'node:crypto';
import { appendFile, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.github.com';
const TAG = 'desktop-latest';
const BRANCH = 'build-mcp-app';
const ARTIFACTS = [
  'tradeflow-connect-windows-x64.exe',
  'tradeflow-connect-windows-arm64.exe',
  'tradeflow-connect-macos-arm64.dmg',
  'tradeflow-connect-linux-x64.deb',
  'tradeflow-connect-linux-x64.AppImage'
];

type ReleaseAsset = { id: number; name: string; size: number };
type Release = {
  id: number;
  tag_name: string;
  name: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  target_commitish: string;
  upload_url: string;
};
type GitRef = { ref: string; object: { sha: string } };
type ResponseShape = { status: number; data: any };
type Fetcher = typeof fetch;

class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    method: string,
    path: string
  ) {
    super(`GitHub API request ${method} ${path} failed with HTTP ${status}.`);
  }
}

class SupersededBuild extends Error {}

async function apiRequest(
  fetcher: Fetcher,
  token: string,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {}
): Promise<ResponseShape> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetcher(path.startsWith('https://') ? path : `${API}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        ...(body instanceof Uint8Array ? {} : { 'content-type': 'application/json' }),
        ...extraHeaders
      },
      ...(body === undefined
        ? {}
        : { body: body instanceof Uint8Array ? body : JSON.stringify(body) })
    });
    if ([429, 502, 503, 504].includes(response.status) && attempt < 2) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const delay =
        Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 10) : attempt + 1;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delay * 1000));
      continue;
    }
    const text = response.status === 204 ? '' : await response.text();
    let data: any = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!response.ok)
      throw new GitHubApiError(response.status, method, new URL(path, API).pathname);
    return { status: response.status, data };
  }
  throw new Error('GitHub API retries were exhausted.');
}

function encodedRef(ref: string): string {
  return encodeURIComponent(ref);
}

async function getOptional<T>(fetcher: Fetcher, token: string, path: string): Promise<T | null> {
  try {
    return (await apiRequest(fetcher, token, 'GET', path)).data as T;
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) return null;
    throw error;
  }
}

async function listPages<T>(fetcher: Fetcher, token: string, path: string): Promise<T[]> {
  const results: T[] = [];
  for (let page = 1; ; page += 1) {
    const url = new URL(path, API);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    const values = (await apiRequest(fetcher, token, 'GET', url.toString())).data as T[];
    results.push(...values);
    if (values.length < 100) return results;
  }
}

async function filesRecursively(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesRecursively(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function readInstallers(directory: string): Promise<Map<string, Uint8Array>> {
  const found = new Map<string, Uint8Array>();
  for (const path of await filesRecursively(directory)) {
    const name = path.split(/[\\/]/).at(-1)!;
    if (!ARTIFACTS.includes(name)) {
      throw new Error(`Unexpected desktop release artifact: ${name}`);
    }
    if (found.has(name)) throw new Error(`Duplicate desktop release artifact: ${name}`);
    found.set(name, new Uint8Array(await readFile(path)));
  }
  const missing = ARTIFACTS.filter((name) => !found.has(name));
  if (missing.length) throw new Error(`Missing desktop release artifacts: ${missing.join(', ')}`);
  return found;
}

function assetName(name: string, version: string, generation: string): string {
  const extension = name.slice(name.lastIndexOf('.'));
  return `tradeflow-connect-${version}-${name.slice('tradeflow-connect-'.length, -extension.length)}-${generation}${extension}`;
}

function checksum(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

async function upload(
  fetcher: Fetcher,
  token: string,
  uploadUrl: string,
  name: string,
  data: Uint8Array
): Promise<ReleaseAsset> {
  const base = uploadUrl.split('{')[0];
  const url = new URL(base);
  if (
    url.protocol !== 'https:' ||
    !['uploads.github.com', 'api.github.com'].includes(url.hostname)
  ) {
    throw new Error('GitHub returned an unexpected release upload URL.');
  }
  url.searchParams.set('name', name);
  return (
    await apiRequest(fetcher, token, 'POST', url.toString(), data, {
      'content-type': 'application/octet-stream'
    })
  ).data as ReleaseAsset;
}

function releaseNotes(
  repository: string,
  sha: string,
  version: string,
  generation: string,
  assets: string[],
  sumsName: string
): string {
  const rows = assets.map((name) => {
    const platform = name.slice(
      `tradeflow-connect-${version}-`.length,
      name.lastIndexOf(`-${generation}`)
    );
    const label = platform.replaceAll('-', ' ');
    return `| ${label} | [Download](${`https://github.com/${repository}/releases/download/${TAG}/${encodeURIComponent(name)}`}) |`;
  });
  const sums = `https://github.com/${repository}/releases/download/${TAG}/${encodeURIComponent(sumsName)}`;
  return [
    '**TradeFlow Connect (Test). These installers are unsigned on Windows and ad-hoc signed on macOS.**',
    '',
    `Version: ${version}  `,
    `Commit: ${sha}  `,
    `Build run: ${generation}`,
    '',
    '| Platform | Installer |',
    '| --- | --- |',
    ...rows,
    '',
    `[SHA-256 checksums](${sums})`
  ].join('\n');
}

function repositoryPath(repository: string, suffix: string): string {
  return `/repos/${repository}/${suffix}`;
}

async function deleteAsset(
  fetcher: Fetcher,
  token: string,
  repository: string,
  assetId: number
): Promise<void> {
  await apiRequest(
    fetcher,
    token,
    'DELETE',
    repositoryPath(repository, `releases/assets/${assetId}`)
  );
}

async function cleanupFailedPublish(
  fetcher: Fetcher,
  token: string,
  repository: string,
  releaseId: number,
  createdRelease: boolean,
  createdTag: boolean,
  uploadedIds: number[],
  stagedNames: Set<string>
): Promise<void> {
  const failures: string[] = [];
  const stagedIds = new Set(uploadedIds);
  try {
    const assets = await listPages<ReleaseAsset>(
      fetcher,
      token,
      repositoryPath(repository, `releases/${releaseId}/assets`)
    );
    for (const asset of assets) {
      if (stagedNames.has(asset.name)) stagedIds.add(asset.id);
    }
  } catch {
    failures.push('staged asset lookup');
  }
  for (const id of stagedIds) {
    try {
      await deleteAsset(fetcher, token, repository, id);
    } catch {
      failures.push(`staged asset ${id}`);
    }
  }
  if (createdRelease) {
    try {
      await apiRequest(
        fetcher,
        token,
        'DELETE',
        repositoryPath(repository, `releases/${releaseId}`)
      );
    } catch {
      failures.push('new draft release');
    }
  }
  if (createdTag) {
    try {
      await apiRequest(
        fetcher,
        token,
        'DELETE',
        repositoryPath(repository, `git/refs/tags/${TAG}`)
      );
    } catch {
      failures.push(`new tag ${TAG}`);
    }
  }
  if (failures.length)
    throw new Error(`Publish failed and staging cleanup failed for ${failures.join(', ')}.`);
}

async function retainOnlyReleaseAndTag(
  fetcher: Fetcher,
  token: string,
  repository: string,
  release: Release,
  retainedAssetNames: Set<string>
): Promise<void> {
  const failures: string[] = [];
  const assets = await listPages<ReleaseAsset>(
    fetcher,
    token,
    repositoryPath(repository, `releases/${release.id}/assets`)
  );
  for (const asset of assets) {
    if (retainedAssetNames.has(asset.name)) continue;
    try {
      await deleteAsset(fetcher, token, repository, asset.id);
    } catch {
      failures.push(`release asset ${asset.name}`);
    }
  }

  const releases = await listPages<Release>(fetcher, token, repositoryPath(repository, 'releases'));
  for (const oldRelease of releases) {
    if (oldRelease.id === release.id) continue;
    try {
      await apiRequest(
        fetcher,
        token,
        'DELETE',
        repositoryPath(repository, `releases/${oldRelease.id}`)
      );
    } catch {
      failures.push(`release ${oldRelease.tag_name}`);
    }
  }

  const refs = await listPages<GitRef>(
    fetcher,
    token,
    repositoryPath(repository, 'git/matching-refs/tags/')
  );
  for (const ref of refs) {
    if (ref.ref === `refs/tags/${TAG}`) continue;
    const name = ref.ref.slice('refs/tags/'.length);
    try {
      await apiRequest(
        fetcher,
        token,
        'DELETE',
        repositoryPath(repository, `git/refs/tags/${encodedRef(name)}`)
      );
    } catch {
      failures.push(`tag ${name}`);
    }
  }
  if (failures.length)
    throw new Error(`Published release needs cleanup; failed to remove ${failures.join(', ')}.`);
}

export async function publishRelease(
  env: Record<string, string | undefined>,
  fetcher: Fetcher = fetch,
  writeSummary = async (content: string) => {
    if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, `${content}\n`);
  }
): Promise<'published' | 'superseded'> {
  const token = env.GITHUB_TOKEN;
  const repository = env.GITHUB_REPOSITORY;
  const sha = env.GITHUB_SHA?.toLowerCase();
  const branch = env.GITHUB_REF_NAME;
  const runId = env.GITHUB_RUN_ID;
  const attempt = env.GITHUB_RUN_ATTEMPT;
  const artifactDirectory = env.TRADEFLOW_DESKTOP_ARTIFACTS;
  if (!token || !repository || !sha || !branch || !runId || !attempt || !artifactDirectory) {
    throw new Error('Required GitHub release environment values are missing.');
  }
  if (branch !== BRANCH) throw new Error(`Desktop releases can only run from ${BRANCH}.`);
  if (!/^[0-9a-f]{40,64}$/.test(sha)) throw new Error('GITHUB_SHA must be a full commit SHA.');
  if (!/^[^/]+\/[^/]+$/.test(repository)) throw new Error('GITHUB_REPOSITORY is malformed.');

  const [versionData, files] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8').then((text) => JSON.parse(text)),
    readInstallers(artifactDirectory)
  ]);
  const version = versionData.version as string;
  const generation = `${runId}-${attempt}`;
  const installerAssets = new Map<string, Uint8Array>();
  for (const [fileName, data] of files)
    installerAssets.set(assetName(fileName, version, generation), data);
  const sumsName = `tradeflow-connect-${version}-SHA256SUMS-${generation}.txt`;
  const sumsBody = [...installerAssets]
    .map(([name, data]) => `${checksum(data)}  ${name}`)
    .join('\n')
    .concat('\n');
  const allAssets = new Map(installerAssets);
  allAssets.set(sumsName, new TextEncoder().encode(sumsBody));
  const body = releaseNotes(
    repository,
    sha,
    version,
    generation,
    [...installerAssets.keys()],
    sumsName
  );

  const repo = (suffix: string) => repositoryPath(repository, suffix);
  const currentBranch = await apiRequest(fetcher, token, 'GET', repo(`git/ref/heads/${BRANCH}`));
  if ((currentBranch.data as GitRef).object.sha.toLowerCase() !== sha) {
    await writeSummary(`Skipped release for ${sha}: ${BRANCH} has a newer commit.`);
    return 'superseded';
  }

  const previousTag = await getOptional<GitRef>(fetcher, token, repo(`git/ref/tags/${TAG}`));
  let release = await getOptional<Release>(fetcher, token, repo(`releases/tags/${TAG}`));
  if (
    release &&
    !release.draft &&
    release.prerelease &&
    previousTag?.object.sha.toLowerCase() === sha &&
    release.body?.includes(`Build run: ${generation}`)
  ) {
    await retainOnlyReleaseAndTag(fetcher, token, repository, release, new Set(allAssets.keys()));
    await writeSummary(
      `Published [TradeFlow Connect (Test)](https://github.com/${repository}/releases/tag/${TAG}) for commit ${sha}.`
    );
    return 'published';
  }
  const createdRelease = !release;
  let createdTag = false;
  let originalRelease: Release | null = release;
  if (!release) {
    release = (
      await apiRequest(fetcher, token, 'POST', repo('releases'), {
        tag_name: TAG,
        target_commitish: sha,
        name: 'TradeFlow Connect (Test) — rolling pre-release',
        body: 'A test installer build is being prepared.',
        draft: true,
        prerelease: true,
        make_latest: 'false'
      })
    ).data as Release;
  }

  const uploadedIds: number[] = [];
  try {
    const oldAssets = await listPages<ReleaseAsset>(
      fetcher,
      token,
      repo(`releases/${release.id}/assets`)
    );
    const oldAssetNames = new Set(oldAssets.map((asset) => asset.name));
    for (const [name, data] of allAssets) {
      if (oldAssetNames.has(name))
        throw new Error(`A release already contains this run's asset: ${name}`);
      const uploaded = await upload(fetcher, token, release.upload_url, name, data);
      uploadedIds.push(uploaded.id);
    }

    const latestBranch = (await apiRequest(fetcher, token, 'GET', repo(`git/ref/heads/${BRANCH}`)))
      .data as GitRef;
    if (latestBranch.object.sha.toLowerCase() !== sha) {
      throw new SupersededBuild(`${BRANCH} advanced before the release could be switched.`);
    }

    const nextTag = await getOptional<GitRef>(fetcher, token, repo(`git/ref/tags/${TAG}`));
    if (!previousTag && nextTag && createdRelease) createdTag = true;
    if (nextTag) {
      await apiRequest(fetcher, token, 'PATCH', repo(`git/refs/tags/${TAG}`), { sha, force: true });
    } else {
      const result = await apiRequest(fetcher, token, 'POST', repo('git/refs'), {
        ref: `refs/tags/${TAG}`,
        sha
      });
      createdTag = true;
      if ((result.data as GitRef).object.sha.toLowerCase() !== sha) {
        throw new Error('GitHub created desktop-latest at an unexpected commit.');
      }
    }

    const updated = (
      await apiRequest(fetcher, token, 'PATCH', repo(`releases/${release.id}`), {
        name: 'TradeFlow Connect (Test) — rolling pre-release',
        body,
        draft: false,
        prerelease: true,
        make_latest: 'false',
        target_commitish: sha
      })
    ).data as Release;
    release = updated;
  } catch (error) {
    const failures: string[] = [];
    try {
      const stagedRef = await getOptional<GitRef>(fetcher, token, repo(`git/ref/tags/${TAG}`));
      if (previousTag && stagedRef?.object.sha !== previousTag.object.sha) {
        await apiRequest(fetcher, token, 'PATCH', repo(`git/refs/tags/${TAG}`), {
          sha: previousTag.object.sha,
          force: true
        });
      } else if (!previousTag && stagedRef) {
        await apiRequest(fetcher, token, 'DELETE', repo(`git/refs/tags/${TAG}`));
        createdTag = false;
      }
    } catch {
      failures.push('tag rollback');
    }
    if (originalRelease && release) {
      try {
        await apiRequest(fetcher, token, 'PATCH', repo(`releases/${release.id}`), {
          name: originalRelease.name,
          body: originalRelease.body,
          draft: originalRelease.draft,
          prerelease: originalRelease.prerelease,
          make_latest: 'false',
          target_commitish: originalRelease.target_commitish
        });
      } catch {
        failures.push('release metadata rollback');
      }
    }
    try {
      await cleanupFailedPublish(
        fetcher,
        token,
        repository,
        release.id,
        createdRelease,
        createdTag,
        uploadedIds,
        new Set(allAssets.keys())
      );
    } catch (cleanupError) {
      failures.push(cleanupError instanceof Error ? cleanupError.message : 'staging cleanup');
    }
    const detail = failures.length ? ` Additional recovery failures: ${failures.join(', ')}.` : '';
    if (error instanceof SupersededBuild && failures.length === 0) {
      await writeSummary(`Skipped release for ${sha}: ${BRANCH} advanced before publication.`);
      return 'superseded';
    }
    throw new Error(
      `${error instanceof Error ? error.message : 'Desktop release failed.'}${detail}`
    );
  }

  const retainedNames = new Set(allAssets.keys());
  await retainOnlyReleaseAndTag(fetcher, token, repository, release, retainedNames);
  const releaseUrl = `https://github.com/${repository}/releases/tag/${TAG}`;
  await writeSummary(`Published [TradeFlow Connect (Test)](${releaseUrl}) for commit ${sha}.`);
  return 'published';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await publishRelease(process.env);
    if (result === 'superseded') console.log('Release skipped because build-mcp-app advanced.');
    else
      console.log(
        `Updated https://github.com/${process.env.GITHUB_REPOSITORY}/releases/tag/${TAG}`
      );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Desktop release failed.');
    process.exitCode = 1;
  }
}
