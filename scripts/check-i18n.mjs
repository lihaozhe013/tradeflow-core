import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const localeFiles = [
  ['zh', 'frontend/src/i18n/locales/zh/zh-CN.json'],
  ['en', 'frontend/src/i18n/locales/en/en-US.json'],
  ['ko', 'frontend/src/i18n/locales/ko/ko-Kr.json']
];
const sourceDirectories = ['frontend/src', 'desktop/src'];
const desktopPrefix = 'desktopConnect';
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isDesktopKey = (key) => key === desktopPrefix || key.startsWith(`${desktopPrefix}.`);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function flatten(value, key = '', nodes = new Map()) {
  const kind = isObject(value) ? 'object' : typeof value === 'string' ? 'string' : 'invalid';
  nodes.set(key, { kind, value });
  if (kind === 'object') {
    for (const [name, child] of Object.entries(value)) {
      flatten(child, key ? `${key}.${name}` : name, nodes);
    }
  }
  return nodes;
}

function walk(node, visit, ancestors = []) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, ancestors);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit, [...ancestors, node]);
    } else if (value?.type) {
      walk(value, visit, [...ancestors, node]);
    }
  }
}

const wrappers = new Set([
  'TSAsExpression',
  'TSTypeAssertion',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'ParenthesizedExpression'
]);

function unwrap(node) {
  while (wrappers.has(node?.type)) node = node.expression;
  return node;
}

function staticKeys(node) {
  node = unwrap(node);
  if (node?.type === 'StringLiteral') return { keys: [node.value], dynamic: false };
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return { keys: [node.quasis[0].value.cooked], dynamic: false };
  }
  let branches;
  if (node?.type === 'ConditionalExpression') branches = [node.consequent, node.alternate];
  else if (node?.type === 'LogicalExpression') branches = [node.left, node.right];
  else if (node?.type === 'ArrayExpression') branches = node.elements;
  if (branches) {
    const results = branches.map(staticKeys);
    return {
      keys: results.flatMap((result) => result.keys),
      dynamic: results.some((result) => result.dynamic)
    };
  }
  return { keys: [], dynamic: true };
}

function memberPaths(node) {
  node = unwrap(node);
  if (node?.type === 'Identifier') return { root: node.name, paths: [[]], unresolved: [] };
  if (node?.type !== 'MemberExpression' && node?.type !== 'OptionalMemberExpression') return null;
  const base = memberPaths(node.object);
  if (!base) return null;
  const property = node.computed
    ? unwrap(node.property)?.type === 'ArrayExpression'
      ? { keys: [], dynamic: true }
      : staticKeys(node.property)
    : { keys: [node.property.name], dynamic: false };
  return {
    root: base.root,
    paths: base.paths.flatMap((parts) => property.keys.map((key) => [...parts, key])),
    unresolved: [...base.unresolved, ...(property.dynamic ? base.paths : [])]
  };
}

function scanSource({ path: file, source }) {
  let ast;
  try {
    ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  } catch (error) {
    throw new Error(`${file}: ${error.message}`);
  }
  const translators = new Set();
  const instances = new Set();
  const hooks = new Set();
  const localeImports = new Set();
  const desktopBindings = new Set();
  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration') continue;
    for (const specifier of node.specifiers) {
      const imported = specifier.imported?.name;
      if (node.source.value === 'react-i18next' && imported === 'useTranslation') {
        hooks.add(specifier.local.name);
        // The frontend also passes t through typed component props.
        translators.add('t');
      }
      if (node.source.value === 'i18next' && imported === 'TFunction') translators.add('t');
      if (
        specifier.type === 'ImportDefaultSpecifier' &&
        (node.source.value === 'i18next' || /(?:^|\/)i18n(?:\/index)?$/.test(node.source.value))
      ) {
        instances.add(specifier.local.name);
      }
      if (/\/i18n\/locales\/.*\.json$/.test(node.source.value)) {
        localeImports.add(specifier.local.name);
      }
    }
  }
  walk(ast, (node) => {
    if (node.type !== 'VariableDeclarator') return;
    const init = unwrap(node.init);
    if (init?.type === 'CallExpression' && hooks.has(init.callee.name)) {
      for (const property of node.id.properties ?? []) {
        if (property.type !== 'ObjectProperty' || property.value.type !== 'Identifier') continue;
        if (property.key.name === 't') translators.add(property.value.name);
        if (property.key.name === 'i18n') instances.add(property.value.name);
      }
    }
    if (node.id.type === 'Identifier' && init?.type === 'MemberExpression') {
      const property = init.computed ? staticKeys(init.property).keys[0] : init.property.name;
      const objects = unwrap(init.object);
      const choices =
        objects?.type === 'ConditionalExpression'
          ? [unwrap(objects.consequent), unwrap(objects.alternate)]
          : [objects];
      if (
        property === desktopPrefix &&
        choices.every((choice) => localeImports.has(choice?.name))
      ) {
        desktopBindings.add(node.id.name);
      }
    }
  });

  const references = [];
  const dynamic = [];
  const location = (node) => `${file}:${node.loc.start.line}:${node.loc.start.column + 1}`;
  const addDynamic = (node) =>
    dynamic.push({ location: location(node), expression: source.slice(node.start, node.end) });
  walk(ast, (node, ancestors) => {
    if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
      const callee = unwrap(node.callee);
      const member = memberPaths(callee);
      if (
        (callee?.type === 'Identifier' && translators.has(callee.name)) ||
        (member &&
          instances.has(member.root) &&
          member.paths.some((parts) => parts.join('.') === 't'))
      ) {
        const result = staticKeys(node.arguments[0]);
        for (const key of result.keys)
          references.push({ key, location: location(node), objectAllowed: false });
        if (result.dynamic) addDynamic(node);
      }
    }
    if (node.type !== 'MemberExpression' && node.type !== 'OptionalMemberExpression') return;
    let parentIndex = ancestors.length - 1;
    while (wrappers.has(ancestors[parentIndex]?.type)) parentIndex -= 1;
    const parent = ancestors[parentIndex];
    if (
      (parent?.type === 'MemberExpression' || parent?.type === 'OptionalMemberExpression') &&
      unwrap(parent.object) === node
    )
      return;
    const member = memberPaths(node);
    if (!member || !desktopBindings.has(member.root)) return;
    for (const parts of [...member.paths, ...member.unresolved]) {
      if (!parts.length) continue;
      references.push({
        key: [desktopPrefix, ...parts].join('.'),
        location: location(node),
        objectAllowed: true
      });
    }
    if (member.unresolved.length) addDynamic(node);
  });
  return { references, dynamic };
}

export function analyzeTranslations(locales, sources) {
  const resources = locales.map((locale) => ({ ...locale, nodes: flatten(locale.value) }));
  const scans = sources.map(scanSource);
  const references = new Map();
  for (const reference of scans.flatMap((scan) => scan.references)) {
    const entries = references.get(reference.key) ?? [];
    entries.push(reference);
    references.set(reference.key, entries);
  }
  const applicable = (key) =>
    resources.filter((resource) => !isDesktopKey(key) || resource.language !== 'ko');
  const scopedNodes = resources.flatMap((resource) =>
    [...resource.nodes].filter(([key]) => !isDesktopKey(key) || resource.language !== 'ko')
  );
  const paths = new Set(scopedNodes.map(([key]) => key));
  const issues = [];
  const conflicts = new Set();
  const invalid = new Set();
  for (const key of [...paths].sort(compare)) {
    const languages = applicable(key);
    const present = languages.filter((resource) => resource.nodes.has(key));
    const kinds = new Set(present.map((resource) => resource.nodes.get(key).kind));
    if (kinds.has('object') && kinds.size > 1) {
      conflicts.add(key);
      issues.push({
        category: 'Structure conflicts',
        key,
        languages: present.map((resource) => resource.language),
        reason: 'Object and non-object values share this path.'
      });
    }
    for (const resource of present) {
      const node = resource.nodes.get(key);
      let reason;
      if (key === '' && node.kind !== 'object') reason = 'Resource root must be an object.';
      else if (node.kind === 'invalid') reason = 'Translation leaf must be a string.';
      else if (node.kind === 'string' && node.value.trim() === '')
        reason = 'Translation is empty or whitespace only.';
      if (reason) {
        invalid.add(`${resource.language}:${key}`);
        issues.push({ category: 'Invalid values', key, languages: [resource.language], reason });
      }
    }
  }
  const blocked = (key, resource) => {
    const parents = [
      '',
      ...key
        .split('.')
        .slice(0, -1)
        .map((_, i, parts) => parts.slice(0, i + 1).join('.'))
    ];
    return parents.some(
      (parent) => conflicts.has(parent) || invalid.has(`${resource.language}:${parent}`)
    );
  };
  const keys = new Set([
    ...scopedNodes.filter(([, node]) => node.kind !== 'object').map(([key]) => key),
    ...references.keys()
  ]);
  for (const key of [...keys].sort(compare)) {
    if (conflicts.has(key)) continue;
    const languages = applicable(key).filter((resource) => !blocked(key, resource));
    const uses = references.get(key) ?? [];
    const present = languages.filter((resource) => resource.nodes.has(key));
    if (
      uses.length &&
      uses.every((use) => use.objectAllowed) &&
      present.some((resource) => resource.nodes.get(key).kind === 'object')
    )
      continue;
    for (const resource of present) {
      if (resource.nodes.get(key).kind === 'object' && uses.some((use) => !use.objectAllowed)) {
        issues.push({
          category: 'Invalid values',
          key,
          languages: [resource.language],
          reason: 'Translation call requires a string, but this value is an object.'
        });
      }
    }
    const missing = languages.filter((resource) => !resource.nodes.has(key));
    if (missing.length) {
      issues.push({
        category: present.length ? 'Missing by language' : 'Missing in all languages',
        key,
        languages: missing.map((resource) => resource.language)
      });
    }
  }
  const dynamic = [
    ...new Map(
      scans.flatMap((scan) => scan.dynamic).map((entry) => [entry.location, entry])
    ).values()
  ].sort((a, b) => compare(a.location, b.location));
  return { resources, references, issues, dynamic, exitCode: issues.length ? 1 : 0 };
}

function preview(value) {
  const text = JSON.stringify(value).replace(/\s+/g, ' ');
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

export function formatReport(report) {
  const lines = ['[i18n] Manual translation check (web: zh/en/ko; desktop: zh/en).'];
  for (const category of [
    'Missing in all languages',
    'Missing by language',
    'Invalid values',
    'Structure conflicts'
  ]) {
    const issues = report.issues
      .filter((issue) => issue.category === category)
      .sort((a, b) => compare(a.key, b.key));
    if (!issues.length) continue;
    lines.push('', `${category} (${issues.length}):`);
    for (const issue of issues) {
      lines.push(`  ${issue.key || '<root>'} [${issue.languages.join(', ')}]`);
      if (issue.reason) lines.push(`    ${issue.reason}`);
      for (const resource of report.resources) {
        if (isDesktopKey(issue.key) && resource.language === 'ko') continue;
        const node = resource.nodes.get(issue.key);
        if (issue.languages.includes(resource.language))
          lines.push(`    ${resource.language}: ${resource.path}`);
        if (node?.kind === 'string' && node.value.trim())
          lines.push(`    Reference ${resource.language}: ${preview(node.value)}`);
      }
      const locations = [
        ...new Set((report.references.get(issue.key) ?? []).map((use) => use.location))
      ].sort(compare);
      for (const location of locations) lines.push(`    Used at ${location}`);
    }
  }
  if (report.dynamic.length) {
    lines.push('', `Dynamic references requiring manual review (${report.dynamic.length}):`);
    for (const entry of report.dynamic)
      lines.push(`  ${entry.location}: ${preview(entry.expression)}`);
  }
  lines.push('', 'Summary:');
  for (const resource of report.resources) {
    const count = report.issues.filter(
      (issue) => issue.category.startsWith('Missing') && issue.languages.includes(resource.language)
    ).length;
    lines.push(`  ${resource.language}: ${count} missing keys`);
  }
  lines.push(
    `  Missing in all languages: ${report.issues.filter((issue) => issue.category === 'Missing in all languages').length}`,
    `  Invalid values: ${report.issues.filter((issue) => issue.category === 'Invalid values').length}`,
    `  Structure conflicts: ${report.issues.filter((issue) => issue.category === 'Structure conflicts').length}`,
    `  Dynamic references: ${report.dynamic.length}`,
    report.exitCode
      ? '[i18n] Missing or invalid translations found.'
      : '[i18n] No definite translation gaps found.'
  );
  return lines.join('\n');
}

export function runCheck(root = projectRoot, write = console.log) {
  try {
    const locales = localeFiles.map(([language, file]) => {
      try {
        return {
          language,
          path: file,
          value: JSON.parse(readFileSync(path.join(root, file), 'utf8'))
        };
      } catch (error) {
        throw new Error(`${file}: ${error.message}`);
      }
    });
    const sources = sourceDirectories.flatMap((directory) =>
      readdirSync(path.join(root, directory), { recursive: true })
        .filter((file) => /\.(?:ts|tsx)$/.test(file) && !file.endsWith('.d.ts'))
        .sort(compare)
        .map((file) => ({
          path: path.posix.join(directory, file.replaceAll('\\', '/')),
          source: readFileSync(path.join(root, directory, file), 'utf8')
        }))
    );
    const report = analyzeTranslations(locales, sources);
    write(formatReport(report));
    return report.exitCode;
  } catch (error) {
    write(`[i18n] Check failed: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCheck();
}
