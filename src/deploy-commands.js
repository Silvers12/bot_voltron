import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { loadCommands } from './loaders.js';

const commands = [...(await loadCommands()).values()].map((c) => c.data.toJSON());
const rest = new REST().setToken(config.token);

const route = config.guildId
  ? Routes.applicationGuildCommands(config.clientId, config.guildId)
  : Routes.applicationCommands(config.clientId);

console.log(`Déploiement de ${commands.length} commande(s) ${config.guildId ? `sur le serveur ${config.guildId}` : 'en global (peut prendre jusqu\'à 1h)'}...`);
const result = await rest.put(route, { body: commands });
console.log(`OK : ${result.length} commande(s) enregistrée(s).`);
