import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Variable d'environnement manquante : ${name} (voir .env.example)`);
    process.exit(1);
  }
  return value;
}

export const config = {
  discord: {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    /** Seul serveur autorisé : le bot est privé. */
    guildId: required('DISCORD_GUILD_ID'),
    /**
     * Identifiants Discord autorisés à utiliser /admin. Vide = tous les membres
     * ayant la permission Administrateur sur le serveur.
     */
    adminIds: (process.env['DISCORD_ADMIN_IDS'] ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  },
  databaseUrl: required('DATABASE_URL'),
  logLevel: process.env['LOG_LEVEL'] ?? 'info',
} as const;
