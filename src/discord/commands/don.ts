import { MessageFlags, SlashCommandBuilder, userMention } from 'discord.js';
import { defineCommand } from '../types.js';
import { ensureMember, findMember } from '../../modules/community/member.service.js';
import { getInventory, giftItem, PurchaseError } from '../../modules/shop/shop.service.js';

import { botName } from '../../core/identity.js';
export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('don')
    .setDescription('Donne un objet de ton inventaire à un membre')
    .addUserOption((o) => o.setName('membre').setDescription('Qui reçoit l’objet').setRequired(true))
    .addStringOption((o) => o.setName('article').setDescription('Objet de ton inventaire').setRequired(true).setAutocomplete(true))
    .addIntegerOption((o) => o.setName('quantite').setDescription('Combien d’exemplaires (1 par défaut)').setMinValue(1))
    .addStringOption((o) => o.setName('message').setDescription('Un petit mot (facultatif)').setMaxLength(100)),

  async autocomplete(interaction) {
    const query = interaction.options.getFocused().toLowerCase();
    const me = await findMember(interaction.guildId, interaction.user.id);
    const entries = me ? await getInventory(me.id) : [];
    await interaction.respond(
      entries
        .filter((e) => e.item.kind === 'COLLECTIBLE' && e.item.name.toLowerCase().includes(query))
        .slice(0, 25)
        .map((e) => ({ name: `${e.item.emoji ? `${e.item.emoji} ` : ''}${e.item.name}${e.quantity > 1 ? ` (×${e.quantity})` : ''}`.slice(0, 100), value: e.itemId })),
    );
  },

  async execute({ interaction, member }) {
    const target = interaction.options.getMember('membre');
    const itemId = interaction.options.getString('article', true);
    const quantity = interaction.options.getInteger('quantite') ?? 1;
    const message = interaction.options.getString('message');
    const refuse = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

    if (!target) return void (await refuse('Ce membre ne fait pas (ou plus) partie du serveur.'));
    if (target.user.bot) return void (await refuse(`Les bots n’ont pas de poches. Pas même ${botName()}.`));
    if (target.id === interaction.user.id) return void (await refuse('Te donner un objet à toi-même ? Il est déjà à toi.'));

    const toMember = await ensureMember(target);
    try {
      const { item, leftForGiver, quantityForReceiver } = await giftItem(member.id, toMember.id, itemId, quantity);
      const label = `${item.emoji ? `${item.emoji} ` : ''}**${item.name}**${quantity > 1 ? ` ×${quantity}` : ''}`;
      const note = message ? `\n> ${message}` : '';
      await interaction.reply({
        content: `🎁 ${userMention(interaction.user.id)} offre ${label} à ${userMention(target.id)} !${note}`,
        allowedMentions: { users: [target.id] },
      });
      await interaction.followUp({
        content: `Il te reste ${leftForGiver} exemplaire(s) de « ${item.name} » ; ${target.displayName} en a maintenant ${quantityForReceiver}.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      if (err instanceof PurchaseError) return void (await refuse(err.message));
      throw err;
    }
  },
});
