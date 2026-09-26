import 'dotenv/config';
import { buildApp } from './app.js';
import { readConfig } from './config.js';

try {
  const config = readConfig();
  const app = await buildApp(config, { logger: true });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
  await app.listen({ host: config.HOST, port: config.PORT });
  console.log(`RouteWise ${config.DATA_MODE} API: http://${config.HOST}:${config.PORT}/docs`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Server failed to start.');
  process.exit(1);
}
