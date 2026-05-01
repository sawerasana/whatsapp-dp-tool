const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// WhatsApp client with session saved (scan QR only once)
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let qrCodeData = '';
let isClientReady = false;

// Jab QR code generate ho
client.on('qr', async (qr) => {
    qrCodeData = qr;
    const qrImage = await qrcode.toDataURL(qr);
    io.emit('qr', qrImage);   // frontend ko bhejo
});

// Jab WhatsApp ready ho jaye
client.on('ready', () => {
    isClientReady = true;
    io.emit('ready', true);
    console.log('WhatsApp connected!');
});

client.on('authenticated', () => {
    console.log('Authenticated');
});

client.on('auth_failure', msg => {
    console.error('Auth failure', msg);
});

client.on('disconnected', (reason) => {
    console.log('Disconnected. Restarting...');
    client.initialize();
});

client.initialize();

// Static files (index.html, style.css) serve karna
app.use(express.static('public'));

// Photo upload ke liye multer setup
const upload = multer({ dest: 'uploads/' });

// DP set karne ka API
app.post('/set-dp', upload.single('photo'), async (req, res) => {
    if (!isClientReady) {
        return res.status(400).json({ success: false, message: 'WhatsApp not connected. Please scan QR first.' });
    }
    try {
        const filePath = req.file.path;
        const media = MessageMedia.fromFilePath(filePath);
        await client.setProfilePicture(media);
        fs.unlinkSync(filePath);  // uploaded file hatao
        res.json({ success: true, message: 'Profile picture updated! Full-screen DP set successfully.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to set profile picture. Try again.' });
    }
});

// Socket.IO connection
io.on('connection', (socket) => {
    if (qrCodeData && !isClientReady) {
        qrcode.toDataURL(qrCodeData).then(img => socket.emit('qr', img));
    }
    if (isClientReady) {
        socket.emit('ready', true);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
