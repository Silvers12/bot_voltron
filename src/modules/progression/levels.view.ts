import { AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, roleMention, userMention, type GuildMember } from 'discord.js';
import { card, screen, text } from '../../discord/v2.js';
import { fetchAvatarPng, loadIllustration } from '../../core/duo-card.js';
import { renderSoloCard } from '../../core/solo-card.js';
import { allowedUsers } from '../notify/mentions.js';
import { botName } from '../../core/identity.js';

const CHEERS = ['Quelle ascension !', 'Ça grimpe, ça grimpe !', 'Les poissons applaudissent.', 'Encore un peu et tu touches les nuages.', 'La rivière entière en parle.'];

/** Carte d'annonce de niveau : avatar, nouveau niveau, rôle de palier éventuel, illustration. */
export async function buildLevelUpMessage(member: GuildMember, level: number, roleName: string | null, roleId: string | null) {
  const cheer = CHEERS[Math.floor(Math.random() * CHEERS.length)]!;
  const image = await renderSoloCard({
    title: 'Niveau supérieur !', badge: `Niveau ${level}`, badgeColor: '#e65100', from: '#1b5e20', to: '#f9a825',
    name: member.displayName, avatarPng: await fetchAvatarPng(member.displayAvatarURL({ extension: 'png', size: 256 })),
    lines: [`${member.displayName} atteint le niveau ${level}. ${cheer}`, ...(roleName ? [`${botName()} lui remet le rôle « ${roleName} ».`] : [])],
    illustration: await loadIllustration('niveau', 'niveau'),
  });
  const c = card(0xf9a825);
  c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://niveau.png').setDescription(`${member.displayName} atteint le niveau ${level}`)));
  c.addTextDisplayComponents(text(`-# 🎉 ${userMention(member.id)} · niveau ${level}${roleId ? ` · ${roleMention(roleId)}` : ''}`));
  return { ...screen(c), files: [new AttachmentBuilder(image, { name: 'niveau.png' })], allowedMentions: { users: await allowedUsers(member.guild.id, 'niveau', member.id) } };
}
