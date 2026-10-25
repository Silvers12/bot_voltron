import { config } from './core/config.js';
import { createLogger } from './core/logger.js';
import { prisma } from './infrastructure/prisma.js';
import { createClient } from './discord/client.js';
import { loadCommands, loadEvents } from './discord/loaders.js';

const log = createLogger('app');

await prisma.$connect();
log.info('Base de données connectée');

const client = createClient();

for (const [name, command] of await loadCommands()) client.commands.set(name, command);
log.info(`${client.commands.size} commande(s) : ${[...client.commands.keys()].map((n) => '/' + n).join(', ')}`);

for (const event of await loadEvents()) {
  const handler = (...args: unknown[]) => (event.execute as (...a: unknown[]) => unknown)(client, ...args);
  event.once ? client.once(event.name, handler) : client.on(event.name, handler);
}

async function shutdown(signal: string) {
  log.info(`Arrêt (${signal})`);
  await client.destroy();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => log.error('Promesse rejetée non gérée', err));

await client.login(config.discord.token);
