const express = require('express');
const { Client, GatewayIntentBits, Events } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const WHITELISTED_USERIDS = (process.env.WHITELISTED_USERIDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const PORT = process.env.PORT || 3000;

if (!TOKEN) {
  console.error('DISCORD_TOKEN fehlt (Umgebungsvariable).');
  process.exit(1);
}

// --- Webserver: Render braucht einen offenen Port, UptimeRobot pingt diese URL ---
const app = express();
app.get('/', (req, res) => res.send('Bot läuft ✅'));
app.listen(PORT, () => console.log(`Webserver auf Port ${PORT}`));

// --- Discord-Bot ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (c) => {
  console.log(`Eingeloggt als ${c.user.tag}`);
  // Slash-Command global registrieren (kann bis zu ~1 Std. dauern, meist sofort)
  await c.application.commands.set([
    { name: 'ping', description: 'Testet die Antwortgeschwindigkeit vom Bot...' },
  ]);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    if (!WHITELISTED_USERIDS.includes(interaction.user.id)) {
      return interaction.reply({
        content: "⛔ You don't have the permission to use the command!",
        flags: 64, // nur für den Nutzer sichtbar
      });
    }

    const start = Date.now();
    await interaction.reply('🏓 Pinge...');
    const roundtrip = Date.now() - start;
    await interaction.editReply(
      `🏓 Pong!\n` +
      `Antwortzeit: **${roundtrip} ms**\n` +
      `Websocket: **${Math.round(client.ws.ping)} ms**`
    );
  }
});

client.login(TOKEN);
