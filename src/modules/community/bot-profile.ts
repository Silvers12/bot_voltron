import sharp from 'sharp';
import { AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, type Guild } from 'discord.js';
import { prisma } from '../../infrastructure/prisma.js';
import { AVATAR, BANNER_H as H, BANNER_W as W, circleAvatar, esc, FONT } from '../../core/image.js';
import { botName } from '../../core/identity.js';
import { formatAmount, getSettings } from '../settings/settings.service.js';
import { card, divider, screen, text } from '../../discord/v2.js';

const COLOR = '#e91e63';

/** Ce que le bot a fait pour la compagnie, lu en base. */
async function botStats(guildId: string) {
  const [given, hugs, members] = await Promise.all([
    prisma.transaction.aggregate({ _sum: { delta: true }, where: { account: { member: { guildId } }, type: { in: ['WELCOME', 'DAILY', 'WEEKLY', 'GROUP_HUG', 'ACHIEVEMENT', 'LOTTERY_WIN', 'BET_WIN', 'DUEL_WIN'] } } }),
    prisma.groupHug.count({ where: { guildId, state: 'CLOSED' } }),
    prisma.member.count({ where: { guildId, leftAt: null } }),
  ]);
  return { given: given._sum.delta ?? 0, hugs, members };
}

/** Bannière de la fiche du bot : avatar, nom, depuis quand, et ses bonnes actions. */
export async function renderBotCard(name: string, avatarPng: Buffer, since: Date | null, tz: string, lines: Array<[label: string, value: string]>): Promise<Buffer> {
  const x = 320;
  const sinceText = since ? `Sur le serveur depuis le ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(since)}` : 'Sur le serveur depuis toujours';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b2838"/><stop offset="1" stop-color="${COLOR}" stop-opacity="0.8"/></linearGradient>
    </defs>
    <rect width="${W}" height="${H}" rx="36" fill="url(#g)"/>
    <circle cx="${40 + AVATAR / 2}" cy="${H / 2}" r="${AVATAR / 2 + 8}" fill="${COLOR}" opacity="0.9"/>
    <text x="${x}" y="92" font-family="${FONT}" font-size="52" font-weight="bold" fill="#fff">${esc(name)}</text>
    <rect x="${x}" y="112" width="275" height="40" rx="20" fill="#f1c40f"/><text x="${x + 18}" y="140" font-family="${FONT}" font-size="24" font-weight="bold" fill="#1b2838">Mascotte officielle</text>
    <text x="${x}" y="192" font-family="${FONT}" font-size="26" fill="#dfe6ee">${esc(sinceText)}</text>
    ${lines.map(([label, value], i) => `<text x="${x}" y="${250 + i * 44}" font-family="${FONT}" font-size="26" fill="#eef3f7">${esc(label)}</text><text x="${W - 60}" y="${250 + i * 44}" text-anchor="end" font-family="${FONT}" font-size="30" font-weight="bold" fill="#f1c40f">${esc(value)}</text>`).join('')}
  </svg>`;
  const avatar = await circleAvatar(avatarPng);
  return sharp(Buffer.from(svg)).composite([{ input: avatar, left: 40, top: (H - AVATAR) / 2 }]).png().toBuffer();
}

/** Fiche publique du bot lui-même : nom et avatar du compte, description de l'application Discord, chiffres lus en base. */
export async function renderBotProfile(guild: Guild) {
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const [settings, stats, app] = await Promise.all([getSettings(guild.id), botStats(guild.id), guild.client.application.fetch()]);
  const avatarPng = Buffer.from(await (await fetch(me.displayAvatarURL({ extension: 'png', size: 256 }))).arrayBuffer());
  const name = me.displayName || botName();
  const image = await renderBotCard(name, avatarPng, me.joinedAt, settings.timezone, [
    [`${settings.currencyPlural.charAt(0).toUpperCase()}${settings.currencyPlural.slice(1)} offerts à la compagnie`, formatAmount(stats.given, settings)],
    ['Câlins collectifs distribués', String(stats.hugs)],
    ['Membres chouchoutés', String(stats.members)],
  ]);
  const c = card(0xe91e63);
  c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://profil.png').setDescription(`Fiche de ${name}`)));
  if (app.description) c.addTextDisplayComponents(text(app.description));
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(text(`-# ${name} · toujours là pour un câlin. 🦦`));
  return { ...screen(c), files: [new AttachmentBuilder(image, { name: 'profil.png' })] };
}
