import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './config.js';
import { loadCommands, loadEvents } from './loaders.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = await loadCommands();
console.log(`[commands] ${client.commands.size} commande(s) chargée(s) : ${[...client.commands.keys()].join(', ')}`);

for (const event of await loadEvents()) {
  const handler = (...args) => event.execute(client, ...args);
  if (event.once) client.once(event.name, handler);
  else client.on(event.name, handler);
}

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

client.login(config.token);
