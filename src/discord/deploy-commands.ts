import { REST, Routes } from 'discord.js';
import { config } from '../core/config.js';
import { resolveBotIdentity } from '../core/identity.js';

await resolveBotIdentity(config.discord.token);
const { loadCommands } = await import('./loaders.js');
const commands = [...(await loadCommands()).values()].map((c) => c.data.toJSON());
const rest = new REST().setToken(config.discord.token);

for (const guildId of config.discord.guildIds) {
  console.log(`Déploiement de ${commands.length} commande(s) sur le serveur ${guildId}...`);
  const result = (await rest.put(Routes.applicationGuildCommands(config.discord.clientId, guildId), { body: commands })) as unknown[];
  console.log(`OK : ${result.length} commande(s) enregistrée(s) : ${commands.map((c) => '/' + c.name).join(', ')}`);
}
