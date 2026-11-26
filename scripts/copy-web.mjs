import { copyFile, mkdir } from 'node:fs/promises';
await mkdir('dist/web', { recursive: true });
for (const name of ['index.html', 'styles.css']) await copyFile(`web/${name}`, `dist/web/${name}`);
