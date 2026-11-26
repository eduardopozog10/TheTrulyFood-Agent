import { execFileSync } from 'node:child_process';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 10_000_000 });
const branch = process.argv.includes('--branch');
const comparison = branch ? [`${git('merge-base', 'origin/main', 'HEAD').trim()}..HEAD`] : ['--cached'];
const files = git('diff', ...comparison, '--name-only', '--diff-filter=ACMR', '-z').split('\0').filter(Boolean);
const forbidden = /(?:^|\/)(?:node_modules|dist|data|logs|\.local|coverage)(?:\/|$)|(?:^|\/)\.env(?:$|\.(?!example$))|\.(?:pem|key|db|sqlite|log)$/i;
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}\b/,
  /\b(?:ghp_|gho_|ghs_|github_pat_)[A-Za-z0-9_]{30,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /(?:OPENAI_API_KEY|GITHUB_TOKEN|GH_TOKEN)\s*=\s*['"]?[^\s'"#]{16,}/,
];
let failures = 0;
for (const file of files) {
  if (forbidden.test(file)) { console.error(`Archivo prohibido en staging: ${file}`); failures++; continue; }
  const content = git('show', `${branch ? 'HEAD:' : ':'}${file}`);
  if (patterns.some(pattern => pattern.test(content))) { console.error(`Posible secreto en staging: ${file}. Revisión manual requerida.`); failures++; }
}
if (failures) process.exitCode = 1;
else console.log(`Revisión heurística de ${branch ? 'rama frente a origin/main' : 'staging'}: ${files.length} archivos, sin secretos detectados ni archivos prohibidos. Revisar también el diff antes del push.`);
