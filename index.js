const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  AttachmentBuilder
} = require('discord.js');
const { createCanvas } = require('canvas');
const config = require('./config.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

const commands = [
  new SlashCommandBuilder()
    .setName('force-verify')
    .setDescription('Manually verify a user')
    .addUserOption(opt =>
      opt.setName('user').setDescription('User to verify').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('force-unverify')
    .setDescription('Manually unverify a user')
    .addUserOption(opt =>
      opt.setName('user').setDescription('User to unverify').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('resend-panel')
    .setDescription('Resend the verification panel')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(config.token);
(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands }
    );
    console.log('✅ Slash commands registered.');
  } catch (err) {
    console.error('Error registering commands:', err);
  }
})();

function generateCaptcha() {
  const captchaText = Math.random().toString(36).substring(2, 8);
  const canvas = createCanvas(200, 100);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '40px sans';
  ctx.fillStyle = '#000';
  ctx.fillText(captchaText, 50, 60);

  const buffer = canvas.toBuffer();
  const file = new AttachmentBuilder(buffer, { name: 'captcha.png' });
  return { text: captchaText, file };
}

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const { commandName, user, guild } = interaction;
    const targetUser = interaction.options.getUser('user');

    if (user.id !== config.adminId) {
      return interaction.reply({ content: '❌ You are not authorized.', ephemeral: true });
    }

    if (commandName === 'force-verify') {
      const targetMember = await guild.members.fetch(targetUser.id);
      await targetMember.roles.add(config.verifiedRoleId);
      return interaction.reply({ content: `✅ Verified ${targetUser.tag}.` });
    }

    if (commandName === 'force-unverify') {
      const targetMember = await guild.members.fetch(targetUser.id);
      await targetMember.roles.remove(config.verifiedRoleId);
      return interaction.reply({ content: `✅ Unverified ${targetUser.tag}.` });
    }

    if (commandName === 'resend-panel') {
      const channel = await guild.channels.fetch(config.panelChannelId);
      const embed = new EmbedBuilder()
        .setTitle('Verification Required')
        .setDescription('Click the button below to verify yourself!')
        .setFooter({ text: `Powered by ${config.botName}` })
        .setColor('Blue');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('verify_button')
          .setLabel('Verify Me')
          .setStyle(ButtonStyle.Primary)
      );

      await channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: '✅ Panel sent.', ephemeral: true });
    }
  }

  if (interaction.isButton() && interaction.customId === 'verify_button') {
    await interaction.deferReply({ ephemeral: true });

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const alreadyVerified = member.roles.cache.has(config.verifiedRoleId);

    if (alreadyVerified) {
      return interaction.editReply({ content: '✅ You already verified.' });
    }

    await interaction.editReply({ content: '📩 Check your DMs to complete verification!' });

    const { text, file } = generateCaptcha();

    try {
      const dm = await interaction.user.createDM();
      await dm.send({ content: '🧠 Solve the CAPTCHA:', files: [file] });

      const collected = await dm.awaitMessages({
        filter: m => m.author.id === interaction.user.id,
        max: 1,
        time: 60000,
        errors: ['time']
      });

      if (collected.first().content.toLowerCase() === text.toLowerCase()) {
        await member.roles.add(config.verifiedRoleId);
        await dm.send('✅ You have been verified!');
      } else {
        await dm.send('❌ Incorrect. Try again via the panel.');
      }
    } catch (err) {
      console.log(err);
      await interaction.user.send('❌ You took too long or I couldn’t DM you. Try again.');
    }
  }
});

// Send verification panel on bot startup
client.once('ready', async () => {
  console.log(`Verification Bot Started`);

  try {
    const channel = await client.channels.fetch(config.panelChannelId);
    const embed = new EmbedBuilder()
      .setTitle('Verification Required')
      .setDescription('Click the button below to verify yourself!')
      .setFooter({ text: `Powered by ${config.botName}` })
      .setColor('Blue');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verify_button')
        .setLabel('Verify Me')
        .setStyle(ButtonStyle.Primary)
    );

    await channel.send({ embeds: [embed], components: [row] });
    console.log('✅ Verification panel sent on startup.');
  } catch (error) {
    console.error('❌ Failed to send verification panel:', error);
  }
});

client.login(config.token);
