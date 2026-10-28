import { REST, Routes } from 'discord.js';

let name = 'Voltron';
let bannerUrl: string | null = null;

/** Nom de l'application telle que créée sur le portail Discord (différent chez chaque hébergeur du bot). */
export const botName = () => name;

/** Bannière du bot définie sur le portail Discord (page « Bot »), ou null s'il n'en a pas. */
export const botBannerUrl = () => bannerUrl;

/** Lit le nom et la bannière du bot auprès de Discord. À appeler avant de charger les modules, dont les textes l'incorporent. */
export async function resolveBotIdentity(token: string): Promise<string> {
  const rest = new REST().setToken(token);
  const me = (await rest.get(Routes.user('@me'))) as { id: string; username: string; banner: string | null };
  name = me.username;
  bannerUrl = me.banner ? rest.cdn.banner(me.id, me.banner, { size: 1024, extension: me.banner.startsWith('a_') ? 'gif' : 'png' }) : null;
  return name;
}
