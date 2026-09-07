import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const modulesFile = path.join(rootDir, 'src', 'data', 'modules.ts');

async function resolveRapidkitCoreExecutable() {
  const configured = process.env.RAPIDKIT_CORE_EXECUTABLE?.trim();
  const localCoreRoot = path.resolve(rootDir, '..', '..', 'core');
  const candidates = [
    configured,
    path.join(localCoreRoot, '.venv', 'bin', 'rapidkit'),
    path.join(localCoreRoot, '.venv', 'Scripts', 'rapidkit.exe'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await fs.pathExists(candidate)) {
      return candidate;
    }
  }

  // Standalone extension checkouts can use an installed rapidkit-core CLI.
  return 'rapidkit';
}

function escapeString(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '')
    .replace(/\n/g, ' ')
    .replace(/'/g, "\\'")
    .trim();
}

function normalizeStatus(value) {
  if (value === 'beta' || value === 'experimental') {
    return value;
  }
  return 'stable';
}

function fallbackIdFromSlug(slug) {
  if (!slug) return 'unknown';
  const parts = slug.split('/').filter(Boolean);
  return parts[parts.length - 1] || slug;
}

function buildCategoryIconsMap(source) {
  const map = {};
  const regex = /^(\s*)([a-z0-9_]+):\s*\{[^}]*icon:\s*'([^']+)'/gim;
  let match;
  while ((match = regex.exec(source))) {
    map[match[2]] = match[3];
  }
  return map;
}

function titleForCategory(category, source) {
  const regex = new RegExp(`\\b${category}\\s*:\\s*\\{[^}]*name:\\s*'([^']+)'`, 'i');
  const match = source.match(regex);
  return match ? match[1] : category;
}

function moduleToTs(entry, iconMap) {
  const slug = typeof entry.slug === 'string' ? entry.slug : '';
  const nameRaw = typeof entry.display_name === 'string' ? entry.display_name : entry.name;
  const name =
    typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : fallbackIdFromSlug(slug);
  const idRaw = typeof entry.name === 'string' ? entry.name : fallbackIdFromSlug(slug);
  const id = idRaw.replace(/\s+/g, '_').toLowerCase();
  const category = typeof entry.category === 'string' ? entry.category : 'unknown';
  const version = typeof entry.version === 'string' ? entry.version : '0.0.0';
  const description = typeof entry.description === 'string' ? entry.description : '';
  const tags = Array.isArray(entry.tags) ? entry.tags.filter((t) => typeof t === 'string') : [];
  const status = normalizeStatus(entry.status);
  const icon = iconMap[category] ?? '📦';

  const lines = [
    '  {',
    `    id: '${escapeString(id)}',`,
    `    name: '${escapeString(name)}',`,
    `    version: '${escapeString(version)}',`,
    `    category: '${escapeString(category)}',`,
    `    icon: '${escapeString(icon)}',`,
    `    description: '${escapeString(description)}',`,
    `    status: '${status}',`,
  ];

  if (tags.length) {
    const tagsLiteral = tags.map((t) => `'${escapeString(t)}'`).join(', ');
    lines.push(`    tags: [${tagsLiteral}],`);
  }

  lines.push(`    slug: '${escapeString(slug)}',`);
  lines.push('  },');
  return lines.join('\n');
}

async function main() {
  const executable = await resolveRapidkitCoreExecutable();
  let result;
  try {
    result = await execa(executable, ['modules', 'list', '--json-schema', '1'], {
      reject: false,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `RapidKit Core CLI is unavailable (${detail}). Install rapidkit-core or set RAPIDKIT_CORE_EXECUTABLE to its executable.`
    );
  }

  if (result.exitCode !== 0) {
    throw new Error(
      `RapidKit Core modules contract failed via ${executable}: ${result.stderr || result.stdout}`
    );
  }

  const raw = result.stdout || '';
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new Error('No JSON payload found in rapidkit output');
  }
  const payload = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  if (!payload || payload.schema_version !== 1 || !Array.isArray(payload.modules)) {
    throw new Error('Unexpected payload from rapidkit modules list --json-schema 1');
  }

  const fileContent = await fs.readFile(modulesFile, 'utf-8');
  const modulesStart = fileContent.indexOf('export const MODULES:');
  const categoryStart = fileContent.indexOf('export const CATEGORY_INFO');

  if (modulesStart === -1 || categoryStart === -1 || categoryStart <= modulesStart) {
    throw new Error('Could not locate MODULES or CATEGORY_INFO in modules.ts');
  }

  const header = fileContent.slice(0, modulesStart);
  const tail = fileContent.slice(categoryStart);

  const iconMap = buildCategoryIconsMap(tail);

  const modules = payload.modules
    .map((entry) => ({
      entry,
      category: typeof entry.category === 'string' ? entry.category : 'unknown',
      name:
        typeof entry.display_name === 'string'
          ? entry.display_name
          : typeof entry.name === 'string'
            ? entry.name
            : '',
    }))
    .sort((a, b) => {
      const cat = a.category.localeCompare(b.category);
      if (cat !== 0) return cat;
      return a.name.localeCompare(b.name);
    });

  const grouped = new Map();
  for (const item of modules) {
    const list = grouped.get(item.category) || [];
    list.push(item.entry);
    grouped.set(item.category, list);
  }

  const bodyLines = ['export const MODULES: ModuleData[] = ['];
  for (const [category, entries] of grouped.entries()) {
    const label = titleForCategory(category, tail);
    bodyLines.push(`  // ${label} Modules`);
    for (const entry of entries) {
      bodyLines.push(moduleToTs(entry, iconMap));
      bodyLines.push('');
    }
  }
  if (bodyLines[bodyLines.length - 1] === '') {
    bodyLines.pop();
  }
  bodyLines.push('];');
  const modulesBlock = bodyLines.join('\n');

  const nextContent = `${header}${modulesBlock}\n\n${tail.trimStart()}`;
  await fs.writeFile(modulesFile, nextContent, 'utf-8');

  console.log(
    `✅ Synced ${payload.modules.length} modules into ${path.relative(rootDir, modulesFile)}`
  );
}

main().catch((error) => {
  console.error('❌ Failed to sync modules:', error.message || error);
  process.exit(1);
});
