import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Variable d'environnement manquante : ${name} (voir .env.example)`);
    process.exit(1);
  }
  return value;
}

function list(name: string): string[] {
  return (process.env[name] ?? '').split(',').map((v) => v.trim()).filter(Boolean);
}

export const config = {
  discord: {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    /** Serveurs autorisés : le bot est privé et refuse tout autre serveur. */
    guildIds: list(process.env['DISCORD_GUILD_IDS'] ? 'DISCORD_GUILD_IDS' : 'DISCORD_GUILD_ID'),
    /**
     * Identifiants Discord autorisés à utiliser /admin. Vide = tous les membres
     * ayant la permission Administrateur sur le serveur.
     */
    adminIds: list('DISCORD_ADMIN_IDS'),
  },
  databaseUrl: required('DATABASE_URL'),
  logLevel: process.env['LOG_LEVEL'] ?? 'info',
} as const;

if (config.discord.guildIds.length === 0) {
  console.error("Variable d'environnement manquante : DISCORD_GUILD_IDS (voir .env.example)");
  process.exit(1);
}

/** Le serveur fait-il partie de la liste autorisée ? */
export function isAllowedGuild(guildId: string | null | undefined): guildId is string {
  return typeof guildId === 'string' && config.discord.guildIds.includes(guildId);
}
