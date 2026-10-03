import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishRelease } from './publish-release.ts';

const oldSha = 'b'.repeat(40);
const newSha = 'a'.repeat(40);
const assetNames = [
  'tradeflow-connect-windows-x64.exe',
  'tradeflow-connect-windows-arm64.exe',
  'tradeflow-connect-macos-arm64.dmg',
  'tradeflow-connect-linux-x64.deb',
  'tradeflow-connect-linux-x64.AppImage'
];
let temporaryRoot: string;

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'tradeflow-release-tests-'));
});

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

type FixtureRelease = {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  target_commitish: string;
  upload_url: string;
};
type FixtureAsset = { id: number; name: string; size: number; data: Uint8Array };

class GitHubFixture {
  head = newSha;
  headOnSecondRead: string | null = null;
  releases: FixtureRelease[] = [];
  assets = new Map<number, FixtureAsset[]>();
  tags = new Map<string, string>();
  failedUploadNumber = 0;
  ambiguousUploadNumber = 0;
  failedReleaseUpdate = false;
  failedCleanupTag: string | null = null;
  private uploadNumber = 0;
  private nextReleaseId = 1;
  private nextAssetId = 1;
  private headRequestCount = 0;
  requests: Array<{ method: string; path: string }> = [];

  seedHistory(releaseCount = 0, tagCount = 0) {
    const current = this.seedRelease('desktop-latest', oldSha, 'Previous rolling release');
    this.tags.set('desktop-latest', oldSha);
    for (let index = 1; index <= releaseCount; index += 1) {
      this.seedRelease(`old-release-${index}`, oldSha, `Old release ${index}`);
    }
    for (let index = 1; index <= tagCount; index += 1) {
      this.tags.set(`old-tag-${index}`, oldSha);
    }
    return current;
  }

  private seedRelease(tag: string, sha: string, name: string): FixtureRelease {
    const id = this.nextReleaseId++;
    const release: FixtureRelease = {
      id,
      tag_name: tag,
      name,
      body: `Old notes for ${tag}`,
      draft: false,
      prerelease: true,
      target_commitish: sha,
      upload_url: `https://uploads.github.com/repos/owner/repo/releases/${id}/assets{?name,label}`
    };
    this.releases.push(release);
    this.assets.set(release.id, []);
    return release;
  }

  async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = new URL(input.toString());
    const method = init?.method ?? 'GET';
    const path = `${url.pathname}${url.search}`;
    this.requests.push({ method, path });
    if (new Headers(init?.headers).get('authorization') !== 'Bearer test-token') {
      return this.json(401, { message: 'bad token' });
    }

    if (url.hostname === 'uploads.github.com') {
      this.uploadNumber += 1;
      if (this.failedUploadNumber === this.uploadNumber) return this.json(500, {});
      const releaseId = Number(url.pathname.match(/releases\/(\d+)\/assets/)?.[1]);
      const name = url.searchParams.get('name')!;
      if (this.assets.get(releaseId)!.some((asset) => asset.name === name))
        return this.json(422, {});
      const data = new Uint8Array(await new Response(init?.body).arrayBuffer());
      const asset = { id: this.nextAssetId++, name, size: data.length, data };
      this.assets.get(releaseId)!.push(asset);
      if (this.ambiguousUploadNumber === this.uploadNumber) return this.json(502, {});
      return this.json(201, asset);
    }

    const route = url.pathname.replace('/repos/owner/repo/', '');
    if (method === 'GET' && route === 'git/ref/heads/build-mcp-app') {
      this.headRequestCount += 1;
      const sha = this.headRequestCount > 1 ? (this.headOnSecondRead ?? this.head) : this.head;
      return this.json(200, { ref: 'refs/heads/build-mcp-app', object: { sha } });
    }
    if (route === 'git/ref/tags/desktop-latest') {
      if (method === 'GET') {
        const sha = this.tags.get('desktop-latest');
        return sha
          ? this.json(200, { ref: 'refs/tags/desktop-latest', object: { sha } })
          : this.json(404, {});
      }
      if (method === 'PATCH') {
        const payload = JSON.parse(String(init?.body));
        this.tags.set('desktop-latest', payload.sha);
        return this.json(200, { ref: 'refs/tags/desktop-latest', object: { sha: payload.sha } });
      }
      if (method === 'DELETE') {
        this.tags.delete('desktop-latest');
        return this.empty();
      }
    }
    if (route === 'git/refs/tags/desktop-latest' && method === 'PATCH') {
      const payload = JSON.parse(String(init?.body));
      this.tags.set('desktop-latest', payload.sha);
      return this.json(200, { ref: 'refs/tags/desktop-latest', object: { sha: payload.sha } });
    }
    if (route === 'releases/tags/desktop-latest' && method === 'GET') {
      const release = this.releases.find((item) => item.tag_name === 'desktop-latest');
      return release ? this.json(200, release) : this.json(404, {});
    }
    if (route === 'releases' && method === 'POST') {
      const payload = JSON.parse(String(init?.body));
      const release = this.seedRelease(payload.tag_name, payload.target_commitish, payload.name);
      release.body = payload.body;
      release.draft = payload.draft;
      if (!this.tags.has(payload.tag_name))
        this.tags.set(payload.tag_name, payload.target_commitish);
      return this.json(201, release);
    }
    if (route === 'git/refs' && method === 'POST') {
      const payload = JSON.parse(String(init?.body));
      const tag = payload.ref.slice('refs/tags/'.length);
      this.tags.set(tag, payload.sha);
      return this.json(201, { ref: payload.ref, object: { sha: payload.sha } });
    }
    if (method === 'GET' && route.startsWith('releases/') && route.endsWith('/assets')) {
      const releaseId = Number(route.split('/')[1]);
      const items = this.assets.get(releaseId) ?? [];
      const page = Number(url.searchParams.get('page') ?? 1);
      return this.json(200, items.slice((page - 1) * 100, page * 100));
    }
    if (method === 'POST' && route.startsWith('releases/') && route.endsWith('/assets')) {
      throw new Error('Release uploads should use the uploads.github.com host.');
    }
    const assetMatch = route.match(/^releases\/assets\/(\d+)$/);
    if (method === 'DELETE' && assetMatch) {
      const assetId = Number(assetMatch[1]);
      for (const assets of this.assets.values()) {
        const index = assets.findIndex((asset) => asset.id === assetId);
        if (index !== -1) assets.splice(index, 1);
      }
      return this.empty();
    }
    const releaseMatch = route.match(/^releases\/(\d+)$/);
    if (releaseMatch && method === 'PATCH') {
      if (this.failedReleaseUpdate) {
        this.failedReleaseUpdate = false;
        return this.json(500, {});
      }
      const release = this.releases.find((item) => item.id === Number(releaseMatch[1]))!;
      Object.assign(release, JSON.parse(String(init?.body)));
      return this.json(200, release);
    }
    if (releaseMatch && method === 'DELETE') {
      this.releases = this.releases.filter((item) => item.id !== Number(releaseMatch[1]));
      this.assets.delete(Number(releaseMatch[1]));
      return this.empty();
    }
    if (method === 'GET' && route === 'releases') {
      const page = Number(url.searchParams.get('page') ?? 1);
      return this.json(200, this.releases.slice((page - 1) * 100, page * 100));
    }
    if (method === 'GET' && route === 'git/matching-refs/tags/') {
      const page = Number(url.searchParams.get('page') ?? 1);
      const refs = [...this.tags].map(([tag, sha]) => ({
        ref: `refs/tags/${tag}`,
        object: { sha }
      }));
      return this.json(200, refs.slice((page - 1) * 100, page * 100));
    }
    const tagMatch = route.match(/^git\/refs\/tags\/(.+)$/);
    if (method === 'DELETE' && tagMatch) {
      const tag = decodeURIComponent(tagMatch[1]);
      if (this.failedCleanupTag === tag) return this.json(403, {});
      this.tags.delete(tag);
      return this.empty();
    }
    return this.json(500, { route, method });
  }

  private json(status: number, value: unknown): Response {
    return new Response(JSON.stringify(value), {
      status,
      headers: { 'content-type': 'application/json' }
    });
  }

  private empty(): Response {
    return new Response(null, { status: 204 });
  }
}

async function makeArtifacts(name: string): Promise<string> {
  const directory = join(temporaryRoot, name);
  await mkdir(directory, { recursive: true });
  await Promise.all(
    assetNames.map((fileName, index) =>
      writeFile(join(directory, fileName), `artifact-${index}-${name}`)
    )
  );
  return directory;
}

function environment(artifactDirectory: string, overrides: Record<string, string> = {}) {
  return {
    GITHUB_TOKEN: 'test-token',
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_SHA: newSha,
    GITHUB_REF_NAME: 'build-mcp-app',
    GITHUB_RUN_ID: '100',
    GITHUB_RUN_ATTEMPT: '1',
    TRADEFLOW_DESKTOP_ARTIFACTS: artifactDirectory,
    ...overrides
  };
}

describe('desktop rolling release publisher', () => {
  test('creates the first release, tag, platform assets, and checksum manifest', async () => {
    const github = new GitHubFixture();
    const artifacts = await makeArtifacts('first');
    const result = await publishRelease(environment(artifacts), github.fetch.bind(github));
    const release = github.releases[0];
    const assets = github.assets.get(release.id)!;
    expect(result).toBe('published');
    expect(github.releases).toHaveLength(1);
    expect([...github.tags.keys()]).toEqual(['desktop-latest']);
    expect(github.tags.get('desktop-latest')).toBe(newSha);
    expect(release.draft).toBe(false);
    expect(release.prerelease).toBe(true);
    expect(assets).toHaveLength(6);
    const checksumAsset = assets.find((asset) => asset.name.endsWith('.txt'))!;
    expect(new TextDecoder().decode(checksumAsset.data)).toContain(
      'tradeflow-connect-0.1.1-linux-x64-100-1.AppImage'
    );
  });

  test('removes all repository releases and tags except desktop-latest', async () => {
    const github = new GitHubFixture();
    github.seedHistory(2, 2);
    const artifacts = await makeArtifacts('history');
    const result = await publishRelease(environment(artifacts), github.fetch.bind(github));
    const release = github.releases[0];
    expect(result).toBe('published');
    expect(github.releases).toHaveLength(1);
    expect([...github.tags.keys()]).toEqual(['desktop-latest']);
    expect(github.tags.get('desktop-latest')).toBe(newSha);
    expect(release.draft).toBe(false);
    expect(release.prerelease).toBe(true);
    expect(release.body).toContain('tradeflow-connect-0.1.1-windows-x64-100-1.exe');
    expect(github.assets.get(release.id)).toHaveLength(6);
  });

  test('updates the same release and tag when a newer build arrives', async () => {
    const github = new GitHubFixture();
    github.head = 'c'.repeat(40);
    const release = github.seedHistory(1, 1);
    github.assets.set(release.id, [
      { id: 900, name: 'old-installer.exe', size: 4, data: new Uint8Array() }
    ]);
    const artifacts = await makeArtifacts('repeat');
    const result = await publishRelease(
      environment(artifacts, {
        GITHUB_SHA: 'c'.repeat(40),
        GITHUB_RUN_ID: '101',
        GITHUB_RUN_ATTEMPT: '2'
      }),
      github.fetch.bind(github)
    );
    expect(result).toBe('published');
    expect(github.releases).toHaveLength(1);
    expect(github.releases[0].id).toBe(release.id);
    expect(github.tags.get('desktop-latest')).toBe('c'.repeat(40));
    expect(github.assets.get(release.id)).toHaveLength(6);
  });

  test('cleans staged uploads and preserves the old release when an upload fails', async () => {
    const github = new GitHubFixture();
    const release = github.seedHistory(1, 1);
    const previousBody = release.body;
    github.assets.set(release.id, [
      { id: 900, name: 'previous.exe', size: 4, data: new Uint8Array() }
    ]);
    github.failedUploadNumber = 3;
    const artifacts = await makeArtifacts('upload-failure');
    await expect(publishRelease(environment(artifacts), github.fetch.bind(github))).rejects.toThrow(
      'HTTP 500'
    );
    expect(github.releases).toHaveLength(2);
    expect(release.body).toBe(previousBody);
    expect(github.tags.get('desktop-latest')).toBe(oldSha);
    expect(github.assets.get(release.id)?.map((asset) => asset.name)).toEqual(['previous.exe']);
  });

  test('removes an auto-created tag and draft if the first release upload fails', async () => {
    const github = new GitHubFixture();
    github.failedUploadNumber = 1;
    const artifacts = await makeArtifacts('first-upload-failure');
    await expect(publishRelease(environment(artifacts), github.fetch.bind(github))).rejects.toThrow(
      'HTTP 500'
    );
    expect(github.releases).toHaveLength(0);
    expect(github.tags.size).toBe(0);
  });

  test('finds and removes an upload whose response was lost before retrying', async () => {
    const github = new GitHubFixture();
    const release = github.seedHistory();
    github.ambiguousUploadNumber = 1;
    const artifacts = await makeArtifacts('ambiguous-upload');
    await expect(publishRelease(environment(artifacts), github.fetch.bind(github))).rejects.toThrow(
      'HTTP 422'
    );
    expect(github.tags.get('desktop-latest')).toBe(oldSha);
    expect(github.releases).toHaveLength(1);
    expect(github.assets.get(release.id)).toHaveLength(0);
  });

  test('restores the old tag and release metadata when the release switch fails', async () => {
    const github = new GitHubFixture();
    const release = github.seedHistory(1, 1);
    const previousBody = release.body;
    github.assets.set(release.id, [
      { id: 900, name: 'previous.exe', size: 4, data: new Uint8Array() }
    ]);
    github.failedReleaseUpdate = true;
    const artifacts = await makeArtifacts('metadata-failure');
    await expect(publishRelease(environment(artifacts), github.fetch.bind(github))).rejects.toThrow(
      'HTTP 500'
    );
    expect(github.tags.get('desktop-latest')).toBe(oldSha);
    expect(release.body).toBe(previousBody);
    expect(github.releases).toHaveLength(2);
    expect(github.assets.get(release.id)?.map((asset) => asset.name)).toEqual(['previous.exe']);
  });

  test('reports failed tag cleanup and succeeds on a later retry', async () => {
    const github = new GitHubFixture();
    github.seedHistory(1, 1);
    github.failedCleanupTag = 'old-tag-1';
    const artifacts = await makeArtifacts('cleanup-failure');
    await expect(publishRelease(environment(artifacts), github.fetch.bind(github))).rejects.toThrow(
      'Published release needs cleanup'
    );
    expect(github.releases).toHaveLength(1);
    expect(github.tags.has('old-tag-1')).toBe(true);
    github.failedCleanupTag = null;
    const result = await publishRelease(environment(artifacts), github.fetch.bind(github));
    expect(result).toBe('published');
    expect(github.releases).toHaveLength(1);
    expect([...github.tags.keys()]).toEqual(['desktop-latest']);
  });

  test('uses pagination while cleaning old releases and tags', async () => {
    const github = new GitHubFixture();
    github.seedHistory(102, 102);
    const artifacts = await makeArtifacts('pagination');
    const result = await publishRelease(environment(artifacts), github.fetch.bind(github));
    expect(result).toBe('published');
    expect(github.releases).toHaveLength(1);
    expect(github.tags.size).toBe(1);
    expect(github.requests.some((request) => request.path.includes('page=2'))).toBe(true);
  });

  test('skips publishing after the source branch has advanced', async () => {
    const github = new GitHubFixture();
    github.head = 'c'.repeat(40);
    const artifacts = await makeArtifacts('superseded');
    const result = await publishRelease(environment(artifacts), github.fetch.bind(github));
    expect(result).toBe('superseded');
    expect(github.releases).toHaveLength(0);
    expect(github.tags.size).toBe(0);
    expect(github.requests).toHaveLength(1);
  });

  test('cleans staged assets if the source branch advances during publication', async () => {
    const github = new GitHubFixture();
    github.headOnSecondRead = 'c'.repeat(40);
    const artifacts = await makeArtifacts('superseded-after-staging');
    const result = await publishRelease(environment(artifacts), github.fetch.bind(github));
    expect(result).toBe('superseded');
    expect(github.releases).toHaveLength(0);
    expect(github.tags.size).toBe(0);
  });
});
