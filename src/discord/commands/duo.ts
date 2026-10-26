import { AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SlashCommandBuilder, userMention } from 'discord.js';
import { defineCommand } from '../types.js';
import { getSettings } from '../../modules/settings/settings.service.js';
import { commentFor, DUO_RATES, duoRateByKey } from '../../modules/rates/rates.catalog.js';
import { duoRateOfTheDay } from '../../modules/rates/rates.service.js';
import { renderDuoCard } from '../../modules/rates/rates.image.js';
import { card, screen, text } from '../v2.js';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('duo')
    .setDescription('Mesure un taux entre deux membres : amour, amitié, complicité…')
    .addStringOption((o) => o.setName('type').setDescription('Taux à mesurer').setRequired(true).addChoices(...DUO_RATES.map((r) => ({ name: `${r.emoji} ${r.label}`, value: r.key }))))
    .addUserOption((o) => o.setName('membre').setDescription('L’autre membre').setRequired(true))
    .addUserOption((o) => o.setName('avec').setDescription('Second membre (toi par défaut)')),
  async execute({ interaction, guildMember }) {
    const rate = duoRateByKey(interaction.options.getString('type', true));
    if (!rate) return void (await interaction.reply({ content: 'Taux inconnu.', flags: MessageFlags.Ephemeral }));
    const left = interaction.options.getMember('avec') ?? guildMember;
    const right = interaction.options.getMember('membre');
    if (!right) return void (await interaction.reply({ content: 'Membre introuvable.', flags: MessageFlags.Ephemeral }));
    if (left.id === right.id) return void (await interaction.reply({ content: 'Un duo avec soi-même ? Voltron admire l’autonomie, mais il faut être deux.', flags: MessageFlags.Ephemeral }));
    const botId = interaction.client.user.id;
    if ((left.user.bot && left.id !== botId) || (right.user.bot && right.id !== botId)) return void (await interaction.reply({ content: 'Les bots ne font pas de duo. Sauf Voltron, qui adore ça.', flags: MessageFlags.Ephemeral }));

    await interaction.deferReply();
    const s = await getSettings(interaction.guildId);
    const percent = duoRateOfTheDay(interaction.guildId, left.id, right.id, rate.key, s.timezone);
    const comment = commentFor(rate, percent);
    const avatar = async (m: typeof left) => Buffer.from(await (await fetch(m.displayAvatarURL({ extension: 'png', size: 256 }))).arrayBuffer());
    const [leftAvatarPng, rightAvatarPng] = await Promise.all([avatar(left), avatar(right)]);
    const image = await renderDuoCard({ leftName: left.displayName, leftAvatarPng, rightName: right.displayName, rightAvatarPng, rate, percent, comment });

    const c = card(Number.parseInt(rate.color.slice(1), 16));
    c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://duo.png')));
    c.addTextDisplayComponents(text(`${rate.emoji} ${userMention(left.id)} et ${userMention(right.id)} : **${percent} %** de ${rate.of} aujourd’hui. ${comment}\n-# Le taux change chaque jour à minuit, et il est le même dans les deux sens.`));
    await interaction.editReply({ ...screen(c), files: [new AttachmentBuilder(image, { name: 'duo.png' })], allowedMentions: { parse: [] } });
  },
});
