import { config } from './core/config.js';
import { resolveBotIdentity } from './core/identity.js';

// Le nom du bot est lu avant tout le reste : les modules composent leurs textes avec lui dès leur chargement.
await resolveBotIdentity(config.discord.token);
await import('./app.js');
