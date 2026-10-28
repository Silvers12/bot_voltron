import { AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SlashCommandBuilder, userMention } from 'discord.js';
import { defineCommand } from '../types.js';
import { getSettings } from '../../modules/settings/settings.service.js';
import { commentFor, RATES, rateByKey } from '../../modules/rates/rates.catalog.js';
import { rateOfTheDay } from '../../modules/rates/rates.service.js';
import { renderRateCard } from '../../modules/rates/rates.image.js';
import { card, screen, text } from '../v2.js';

import { botName } from '../../core/identity.js';
export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('taux')
    .setDescription('Mesure un taux du jour : chance, choupitude, suspicion…')
    .addStringOption((o) => o.setName('type').setDescription('Taux à mesurer').setRequired(true).addChoices(...RATES.map((r) => ({ name: `${r.emoji} ${r.label}`, value: r.key }))))
    .addUserOption((o) => o.setName('membre').setDescription('Membre à mesurer (toi par défaut)')),
  async execute({ interaction, guildMember }) {
    const rate = rateByKey(interaction.options.getString('type', true));
    if (!rate) return void (await interaction.reply({ content: 'Taux inconnu.', flags: MessageFlags.Ephemeral }));
    const target = interaction.options.getMember('membre') ?? guildMember;
    if (target.user.bot && target.id !== interaction.client.user.id) return void (await interaction.reply({ content: `Les bots n’ont pas de taux. Sauf ${botName()}, évidemment.`, flags: MessageFlags.Ephemeral }));

    await interaction.deferReply();
    const s = await getSettings(interaction.guildId);
    const percent = rateOfTheDay(interaction.guildId, target.id, rate.key, s.timezone);
    const comment = commentFor(rate, percent);
    const avatarPng = Buffer.from(await (await fetch(target.displayAvatarURL({ extension: 'png', size: 256 }))).arrayBuffer());
    const image = await renderRateCard({ displayName: target.displayName, avatarPng, rate, percent, comment });

    const c = card(Number.parseInt(rate.color.slice(1), 16));
    c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://taux.png')));
    c.addTextDisplayComponents(text(`${rate.emoji} ${userMention(target.id)} affiche **${percent} %** de ${rate.of} aujourd’hui. ${comment}\n-# Le taux change chaque jour à minuit.`));
    await interaction.editReply({ ...screen(c), files: [new AttachmentBuilder(image, { name: 'taux.png' })], allowedMentions: { parse: [] } });
  },
});
