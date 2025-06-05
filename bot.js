// whatsapp_bot_giveaway.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const csv = require('csv-parser');

const CSV_FILE = 'contacts.csv';
const JSON_FILE = 'contacts.json';
const BACKUP_FOLDER = './backups';

const MESSAGES = [
    `Namaste! ✨ Main ThinkNew channel se Rohit.\nEk giveaway chal raha hai jisme weekly & monthly jeetne ka moka hai.\n\nAgar aap interested ho to reply karein — "send" ya "ok" likh ke send kre 🙂`
];

const MAIN_MESSAGE = `🏯 ThinkNew Mega Giveaway Live!\n\n👉 Har week 50 log jeette hain ₹500 tak\n👉 Har mahine 1 MEGA winner ko ₹10,000!\n\n📣 Winners declare hote hain Sunday aur Wednesday ko\n🔗 Entry link: https://giveawayprogram.netlify.app/\n\n💡 Mera number save zarur karein — jeetne par update yahin milega!`;

const INTEREST_KEYWORDS = [
    'interested', 'i am interested', 'haan', 'send', "i'm in",
    'yes', 'ok', 'sure', 'ready', 'lets go', 'done', 'done it', 'joined', 'ho gaya'
];

if (!fs.existsSync(BACKUP_FOLDER)) fs.mkdirSync(BACKUP_FOLDER);

function backupContacts() {
    const backupFile = `${BACKUP_FOLDER}/contacts_${Date.now()}.json`;
    fs.copyFileSync(JSON_FILE, backupFile);
}

function loadContactsFromCSV(callback) {
    const contacts = [];
    fs.createReadStream(CSV_FILE)
        .pipe(csv())
        .on('data', (row) => {
            if (row.number) {
                contacts.push({ name: row.name || '', number: row.number, sent: false, responded: false });
            }
        })
        .on('end', () => {
            fs.writeFileSync(JSON_FILE, JSON.stringify(contacts, null, 2));
            callback(contacts);
        });
}

let contacts = fs.existsSync(JSON_FILE) ? JSON.parse(fs.readFileSync(JSON_FILE)) : [];
let messageCount = 0;
const MAX_MESSAGES = 5;
let stopSending = false;

const client = new Client({ authStrategy: new LocalAuth() });

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));

client.on('ready', async () => {
    console.log('✅ WhatsApp client ready');

    const chats = await client.getChats();
    for (const chat of chats) {
        if (chat.unreadCount > 0) {
            const messages = await chat.fetchMessages({ limit: chat.unreadCount });
            for (const msg of messages) {
                if (!msg.fromMe) await handleIncomingMessage(msg);
            }
        }
    }

    if (!contacts.length) {
        loadContactsFromCSV((loaded) => {
            contacts = loaded;
            scheduleAllMessages();
        });
    } else {
        scheduleAllMessages();
    }
});

client.on('auth_failure', () => {
    console.log('❌ Auth failed. Delete .wwebjs_auth and restart.');
});

client.on('disconnected', (reason) => {
    console.log('🔄 Disconnected:', reason);
});

client.on('message', handleIncomingMessage);

async function handleIncomingMessage(msg) {
    const number = msg.from;
    const text = msg.body.toLowerCase();
    const contact = contacts.find(c => number.includes(c.number));

    if (!contact) return;

    if (!contact.responded && INTEREST_KEYWORDS.some(k => text.includes(k))) {
        try {
            await client.sendPresenceAvailable();
            await new Promise(res => setTimeout(res, 1500));
            await client.sendMessage(number, MAIN_MESSAGE);

            contact.responded = true;
            fs.writeFileSync(JSON_FILE, JSON.stringify(contacts, null, 2));
            backupContacts();

            console.log(`📤 Sent main message to ${number}`);
        } catch (err) {
            console.error(`❌ Error sending reply to ${number}:`, err);
        }
    }
}

function scheduleAllMessages() {
    const unsent = contacts.filter(c => !c.sent);
    if (!unsent.length) {
        console.log('🎉 All contacts processed.');
        return;
    }

    const limitedContacts = unsent.slice(0, MAX_MESSAGES);
    limitedContacts.forEach((contact, index) => {
       const delay = index * (3600000 + Math.floor(Math.random() * 1800000)); // 1–1.5 hr gap
        setTimeout(() => {
            if (!stopSending) sendToContact(contact);
        }, delay);
    });
}

async function sendToContact(contact) {
    if (messageCount >= MAX_MESSAGES) {
        console.log('🚫 Message limit reached. No more messages will be sent.');
        stopSending = true;
        return;
    }

    console.log(`🚀 Preparing message for ${contact.number}`);
    const chatId = contact.number.includes('@c.us') ? contact.number : `${contact.number}@c.us`;

    try {
        const isValid = await client.isRegisteredUser(chatId);
        if (!isValid) {
            console.log(`⚠️ Invalid number: ${contact.number}`);
            return;
        }

        await new Promise(res => setTimeout(res, 3000));
        await client.sendPresenceAvailable();
        await new Promise(res => setTimeout(res, 1500));

        const message = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
        await client.sendMessage(chatId, message);

        contact.sent = true;
        messageCount++;
        fs.writeFileSync(JSON_FILE, JSON.stringify(contacts, null, 2));
        backupContacts();

        console.log(`✅ Message sent to ${contact.number} (${messageCount}/${MAX_MESSAGES})`);

        if (messageCount >= MAX_MESSAGES) {
            console.log('🛑 Reached limit of 5 messages. Pausing sending.');
            stopSending = true;
        }
    } catch (err) {
        console.error(`❌ Failed to send to ${contact.number}:`, err);
    }
}

client.initialize();
