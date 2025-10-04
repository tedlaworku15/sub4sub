// server.js (Final Production Version)

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const { Telegraf } = require('telegraf');
const path = require('path');
const http = require('http');
const User = require('./models/user');
const Payment = require('./models/payment');

dotenv.config();
const app = express();
const server = http.createServer(app);

const sseClients = {};
app.set('sse_clients', sseClients);

app.use(cors());
app.use(express.json());


// --- THE FINAL, PROVEN-CORRECT STATIC FILE CONFIGURATION ---
// The debug route confirmed this is the correct path for your Render deployment.
// It looks for a 'public' folder in the parent directory of where this script is running.
const staticPath = path.join(__dirname, '..', 'public');
app.use(express.static(staticPath));
// --- END OF FIX ---


// --- API ROUTES ---
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/videos', require('./routes/videoRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/subscriptions', require('./routes/subscriptionRoutes'));


// --- CATCH-ALL ROUTE FOR SINGLE-PAGE APP ---
// This ensures your app works even if the user refreshes a page.
app.get('*', (req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
});


// --- DATABASE CONNECTION ---
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('[DB] MongoDB Connected successfully.');
    } catch (err) {
        console.error('[DB] MongoDB Connection Error:', err.message);
        process.exit(1);
    }
};

// --- TELEGRAM BOT SETUP & LOGIC ---
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
app.set('bot', bot);

bot.action(/approve_(.+)/, async (ctx) => {
    try {
        const paymentId = ctx.match[1];
        const payment = await Payment.findById(paymentId);
        if (!payment || payment.status !== 'pending') {
            return ctx.answerCbQuery('This payment has already been processed.');
        }

        const user = await User.findById(payment.user);
        user.awaqiCoins += payment.coinsPurchased;
        payment.status = 'completed';

        await user.save();
        await payment.save();

        const client = sseClients[user._id.toString()];
        if (client) {
            const payload = {
                message: `Your deposit of ${payment.amountETB} ETB was approved!`,
                newCoins: user.awaqiCoins
            };
            client.write(`event: payment_update\n`);
            client.write(`data: ${JSON.stringify(payload)}\n\n`);
        }

        await ctx.editMessageText(`✅ Payment Accepted for ${user.channelName}. ${payment.coinsPurchased} coins credited.`);
        await ctx.answerCbQuery('Approved.');
    } catch (error) {
        console.error('Bot Approve Error:', error);
        await ctx.answerCbQuery('Error during approval.');
    }
});

bot.action(/reject_(.+)/, async (ctx) => {
    try {
        const paymentId = ctx.match[1];
        const payment = await Payment.findById(paymentId);
        if (!payment || payment.status !== 'pending') {
            return ctx.answerCbQuery('This payment has already been processed.');
        }

        payment.status = 'failed';
        await payment.save();
        
        const user = await User.findById(payment.user);

        const client = sseClients[user._id.toString()];
        if (client) {
             const payload = {
                message: `Your deposit of ${payment.amountETB} ETB was rejected. Please contact support.`
            };
            client.write(`event: payment_update\n`);
            client.write(`data: ${JSON.stringify(payload)}\n\n`);
        }

        await ctx.editMessageText(`❌ Payment Rejected.\n\nUser: ${user.channelName}\nAmount: ${payment.amountETB} ETB\n\nNo coins were credited.`);
        await ctx.answerCbQuery('Payment rejected.');
    } catch (error) {
        console.error('Bot Reject Error:', error);
        await ctx.answerCbQuery('Error processing rejection.');
    }
});

bot.launch().then(() => console.log('[BOT] Telegram bot is running...'));


// --- START THE SERVER ---
const PORT = process.env.PORT || 3000;
const startServer = async () => {
    await connectDB();
    server.listen(PORT, () => console.log(`[SERVER] Server running on port ${PORT}`));
};

startServer();