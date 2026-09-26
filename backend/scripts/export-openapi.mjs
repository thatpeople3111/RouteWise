import { writeFile } from 'node:fs/promises';
import { buildApp } from '../dist/src/app.js';
import { readConfig } from '../dist/src/config.js';
const app = await buildApp(readConfig({ DATA_MODE: 'demo' }));
await writeFile('openapi.json', JSON.stringify(app.swagger(), null, 2) + '\n');
await app.close();
