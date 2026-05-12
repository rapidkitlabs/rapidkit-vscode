import fs from 'fs';
import path from 'path';

const FILE_NAME = 'backend-import-stack-parity.snapshot.json';
const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');

const extensionRoot = path.resolve(process.cwd());
const extensionTarget = path.resolve(extensionRoot, 'contracts', FILE_NAME);

function normalizePath(value) {
  return path.resolve(value);
}

function pickSource() {
  const explicit = process.env.RAPIDKIT_BACKEND_IMPORT_PARITY_SNAPSHOT_SOURCE;
  const candidates = [
    explicit && explicit.trim().length > 0 ? normalizePath(explicit.trim()) : null,
    path.resolve(extensionRoot, '..', 'contracts', FILE_NAME),
    extensionTarget,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function writeTarget(targetPath, sourceContent) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, sourceContent, 'utf-8');
}

function verifyTarget(targetPath, sourceContent) {
  if (!fs.existsSync(targetPath)) {
    console.error(`Parity snapshot is missing: ${targetPath}`);
    process.exit(1);
  }

  const targetContent = fs.readFileSync(targetPath, 'utf-8');
  if (targetContent !== sourceContent) {
    console.error(`Parity snapshot is out of sync: ${targetPath}`);
    process.exit(1);
  }
}

const sourcePath = pickSource();
if (!sourcePath) {
  console.error('No parity snapshot source found.');
  console.error(`Expected one of: ${path.resolve(extensionRoot, '..', 'contracts', FILE_NAME)} or ${extensionTarget}`);
  process.exit(1);
}

const sourceContent = fs.readFileSync(sourcePath, 'utf-8');

if (checkOnly) {
  verifyTarget(extensionTarget, sourceContent);
  console.log('Extension parity snapshot is in sync.');
  process.exit(0);
}

writeTarget(extensionTarget, sourceContent);
console.log(`Parity snapshot synced from ${sourcePath}`);
console.log(`- extension target: ${extensionTarget}`);
