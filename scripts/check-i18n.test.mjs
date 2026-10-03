import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { analyzeTranslations, formatReport, runCheck } from './check-i18n.mjs';

function locales(zh = {}, en = zh, ko = zh) {
  return Object.entries({ zh, en, ko }).map(([language, value]) => ({
    language,
    path: `${language}.json`,
    value
  }));
}

function web(source) {
  return {
    path: 'frontend/src/example.tsx',
    source: `import { useTranslation } from 'react-i18next';\n${source}`
  };
}

function desktop(source) {
  return {
    path: 'desktop/src/example.tsx',
    source: `import zh from '../../frontend/src/i18n/locales/zh/zh-CN.json';
import en from '../../frontend/src/i18n/locales/en/en-US.json';
const t = (language === 'zh' ? zh : en).desktopConnect;
${source}`
  };
}

test('compares nested keys using the union, including Korean-only keys', () => {
  const report = analyzeTranslations(
    locales({ nav: { home: '主页' } }, { nav: { home: 'Home' } }, { nav: { extra: '추가' } }),
    [web("t('nav.home');")]
  );
  assert.deepEqual(
    report.issues.map(({ key, languages }) => ({ key, languages })),
    [
      { key: 'nav.extra', languages: ['zh', 'en'] },
      { key: 'nav.home', languages: ['ko'] }
    ]
  );
  const output = formatReport(report);
  assert.match(output, /Reference ko: "추가"/);
  assert.match(output, /ko: ko\.json/);
  assert.match(output, /Used at frontend\/src\/example\.tsx:2:1/);
  assert.equal(report.exitCode, 1);
});

test('reports source keys absent from every language despite defaultValue', () => {
  const report = analyzeTranslations(locales(), [
    web("t('common.user', { defaultValue: 'User' }); t('common.user');")
  ]);
  assert.equal(report.issues.length, 1);
  assert.deepEqual(report.issues[0], {
    category: 'Missing in all languages',
    key: 'common.user',
    languages: ['zh', 'en', 'ko']
  });
  assert.equal(report.references.get('common.user').length, 2);
});

test('checks static templates, condition branches, casts, and fallback arrays without scanning comments', () => {
  const report = analyzeTranslations(locales({ common: { known: 'OK' } }), [
    web(`
// t('comment.line');
/* t('comment.block'); */
const content = <div>{/* t('comment.jsx') */}</div>;
t(\`common.known\`);
t(flag ? 'common.first' : ('common.second' as string));
t(['common.known', 'common.third']);
`)
  ]);
  assert.deepEqual(
    report.issues.map((issue) => issue.key),
    ['common.first', 'common.second', 'common.third']
  );
  assert.equal(report.dynamic.length, 0);
});

test('recognizes hook aliases, instance imports, and typed t props', () => {
  const report = analyzeTranslations(locales({ common: { known: 'OK' } }), [
    {
      path: 'frontend/src/example.tsx',
      source: `import { useTranslation as useLocale } from 'react-i18next';
import client from '../i18n';
import type { TFunction } from 'i18next';
const { t: translate, i18n: instance } = useLocale();
translate('common.first');
instance.t('common.second');
client.t('common.third');
function Child({ t }: { t: TFunction }) { return t('common.fourth'); }
`
    }
  ]);
  assert.deepEqual(
    report.issues.map((issue) => issue.key),
    ['common.first', 'common.fourth', 'common.second', 'common.third']
  );
});

test('ignores unrelated t calls and unrelated desktop-like objects', () => {
  const report = analyzeTranslations(locales(), [
    {
      path: 'frontend/src/unrelated.ts',
      source:
        "function t(value: string) { return value; } t('not.translation'); const data = { desktopConnect: {} }; const labels = data.desktopConnect; labels.name;"
    }
  ]);
  assert.equal(report.issues.length, 0);
  assert.equal(report.dynamic.length, 0);
});

test('lists unresolved dynamic expressions as warnings and checks static fallbacks', () => {
  const report = analyzeTranslations(locales({ nav: { home: 'Home' } }), [
    web("t(`nav.${value}`); t(getKey()); t(map[value] ?? 'nav.home');")
  ]);
  assert.equal(report.exitCode, 0);
  assert.equal(report.dynamic.length, 3);
  assert.ok(report.references.has('nav.home'));
  assert.match(formatReport(report), /Dynamic references requiring manual review \(3\)/);
  assert.match(formatReport(report), /t\(`nav\.\$\{value\}`\)/);
});

test('reports empty strings and non-string leaves without treating equal translations as missing', () => {
  const value = {
    common: {
      brand: 'TradeFlow',
      empty: '',
      spaces: ' \n ',
      nil: null,
      number: 7,
      bool: false,
      array: ['text']
    }
  };
  const report = analyzeTranslations(locales(value), []);
  assert.equal(report.issues.length, 18);
  assert.ok(report.issues.every((issue) => issue.category === 'Invalid values'));
  assert.ok(report.issues.every((issue) => issue.key !== 'common.brand'));
  assert.equal(report.exitCode, 1);
});

test('reports malformed resource roots without flooding the report with missing children', () => {
  const report = analyzeTranslations(
    locales(null, { common: { user: 'User' } }, { common: { user: '사용자' } }),
    []
  );
  assert.equal(report.issues.filter((issue) => issue.category === 'Invalid values').length, 1);
  assert.equal(report.issues.filter((issue) => issue.category.startsWith('Missing')).length, 0);
});

test('reports object/string conflicts and does not report their descendants as missing', () => {
  const report = analyzeTranslations(
    locales({ common: { user: 'User' } }, { common: 'text' }, { common: { user: '사용자' } }),
    []
  );
  assert.deepEqual(report.issues, [
    {
      category: 'Structure conflicts',
      key: 'common',
      languages: ['zh', 'en', 'ko'],
      reason: 'Object and non-object values share this path.'
    }
  ]);
});

test('requires string values for web translation calls, even when every resource has an object', () => {
  const report = analyzeTranslations(locales({ common: { user: 'User' } }), [web("t('common');")]);
  assert.equal(report.issues.length, 3);
  assert.ok(
    report.issues.every((issue) => issue.category === 'Invalid values' && issue.key === 'common')
  );
});

test('checks desktop static paths in Chinese and English and permits group objects', () => {
  const value = { desktopConnect: { title: 'Title', stages: { complete: 'Done' } } };
  const report = analyzeTranslations(locales(value, value, {}), [
    desktop(
      "t.title; t.stages; t.stages.complete; t['missing']; (t.stages as Record<string, string>)[stage];"
    )
  ]);
  assert.deepEqual(report.issues, [
    { category: 'Missing in all languages', key: 'desktopConnect.missing', languages: ['zh', 'en'] }
  ]);
  assert.equal(report.dynamic.length, 1);
  assert.equal(report.references.get('desktopConnect.stages.complete').length, 1);
  assert.match(report.dynamic[0].expression, /\[stage\]/);
  assert.doesNotMatch(formatReport(report), /ko: ko\.json/);
});

test('ignores Korean desktop-only extras and invalid values, and checks resource-only desktop gaps', () => {
  const report = analyzeTranslations(
    locales(
      { desktopConnect: { title: '标题' } },
      { desktopConnect: {} },
      { desktopConnect: { unused: null, extra: '추가' } }
    ),
    []
  );
  assert.deepEqual(report.issues, [
    { category: 'Missing by language', key: 'desktopConnect.title', languages: ['en'] }
  ]);
});

test('checks static desktop condition branches and retains known paths in partially dynamic branches', () => {
  const value = { desktopConnect: { stages: { complete: 'Done' } } };
  const report = analyzeTranslations(locales(value, value, {}), [
    desktop(
      "t[flag ? 'first' : 'second']; t.stages[flag ? 'missing' : value]; t[flag ? 'stages' : value].complete;"
    )
  ]);
  assert.deepEqual(
    report.issues.map((issue) => issue.key),
    ['desktopConnect.first', 'desktopConnect.second', 'desktopConnect.stages.missing']
  );
  assert.equal(report.dynamic.length, 2);
  assert.ok(report.references.has('desktopConnect.stages.complete'));
  assert.ok(!report.references.has('desktopConnect.complete'));
});

test('sorts and deduplicates locations and truncates reference text', () => {
  const source = web("t('common.long');");
  const report = analyzeTranslations(locales({ common: { long: 'x'.repeat(500) } }, {}, {}), [
    source,
    source
  ]);
  const output = formatReport(report);
  assert.equal(output.match(/Used at /g).length, 1);
  assert.match(output, /Reference zh: "x+\.\.\./);
  assert.equal(
    output,
    formatReport(
      analyzeTranslations(locales({ common: { long: 'x'.repeat(500) } }, {}, {}), [source, source])
    )
  );
});

function fixture(
  t,
  values = locales({ common: { known: 'Known' } }),
  source = "t('common.known');"
) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'tradeflow-i18n-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [index, file] of ['zh/zh-CN', 'en/en-US', 'ko/ko-Kr'].entries()) {
    const target = path.join(root, `frontend/src/i18n/locales/${file}.json`);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(values[index].value));
  }
  mkdirSync(path.join(root, 'desktop/src'), { recursive: true });
  writeFileSync(path.join(root, 'frontend/src/example.tsx'), web(source).source);
  writeFileSync(path.join(root, 'frontend/src/ignored.d.ts'), 'not valid TypeScript');
  writeFileSync(path.join(root, 'frontend/src/ignored.json'), 'not valid JSON');
  return root;
}

function snapshot(root) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const file = path.join(entry.parentPath, entry.name);
      return [
        path.relative(root, file),
        createHash('sha256').update(readFileSync(file)).digest('hex')
      ];
    })
    .sort(([a], [b]) => a.localeCompare(b));
}

test('runs twice with stable output and leaves all fixture files unchanged', (t) => {
  const root = fixture(t);
  const before = snapshot(root);
  const outputs = [];
  assert.equal(
    runCheck(root, (output) => outputs.push(output)),
    0
  );
  assert.equal(
    runCheck(root, (output) => outputs.push(output)),
    0
  );
  assert.equal(outputs[0], outputs[1]);
  assert.deepEqual(snapshot(root), before);
});

test('returns exit code 2 with file context for missing files, invalid JSON, and invalid source', (t) => {
  for (const failure of ['missing', 'json', 'source']) {
    const root = fixture(t);
    const locale = path.join(root, 'frontend/src/i18n/locales/en/en-US.json');
    if (failure === 'missing') rmSync(locale);
    if (failure === 'json') writeFileSync(locale, '{invalid');
    if (failure === 'source')
      writeFileSync(path.join(root, 'frontend/src/example.tsx'), 'const = ;');
    let output;
    assert.equal(
      runCheck(root, (text) => {
        output = text;
      }),
      2
    );
    assert.match(output, /Check failed:/);
    assert.match(output, failure === 'source' ? /frontend\/src\/example\.tsx/ : /en-US\.json/);
  }
});

test('propagates success, translation gaps, and parsing failures to process exit codes', (t) => {
  const roots = [fixture(t), fixture(t, locales(), "t('missing.key');"), fixture(t)];
  writeFileSync(path.join(roots[2], 'frontend/src/example.tsx'), 'const = ;');
  const moduleUrl = new URL('./check-i18n.mjs', import.meta.url).href;
  for (const [expected, root] of roots.entries()) {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { runCheck } from ${JSON.stringify(moduleUrl)}; process.exitCode = runCheck(process.argv[1]);`,
        root
      ],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, expected, result.stderr);
    assert.equal(result.stderr, '');
  }
});
