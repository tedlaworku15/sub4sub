const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const { Telegraf, Markup } = require('telegraf');
const path = require('path');
const http = require('http');
const User = require('./models/user');
const Payment = require('./models/payment');
const path = require('path');

dotenv.config();
const app = express();
const server = http.createServer(app);

// Create a global object to store active client connections for Server-Sent Events (SSE)
const sseClients = {};
app.set('sse_clients', sseClients);

app.use(cors());
app.use(express.json());

// API ROUTES
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/videos', require('./routes/videoRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/subscriptions', require('./routes/subscriptionRoutes'));

// SERVE STATIC FILES (Frontend)
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// Database Connection
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected successfully.');
    } catch (err) {
        console.error('MongoDB Connection Error:', err.message);
        process.exit(1);
    }
};

// Full Telegram Bot Setup
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;
app.set('bot', bot); // Make bot instance available to other files

// Bot handler for the "Accept" button
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

        // Logic to send a real-time update to the user's browser
        const client = sseClients[user._id.toString()];
        if (client) {
            const payload = {
                message: `Your deposit of ${payment.amountETB} ETB was approved!`,
                newCoins: user.awaqiCoins
            };
            client.write(`event: payment_update\n`);
            client.write(`data: ${JSON.stringify(payload)}\n\n`);
            console.log(`[SSE] Sent payment_update to user ${user._id}`);
        }

        await ctx.editMessageText(`✅ Payment Accepted for ${user.channelName}. ${payment.coinsPurchased} coins credited.`);
        await ctx.answerCbQuery('Approved.');
    } catch (error) {
        console.error('Bot Approve Error:', error);
        await ctx.answerCbQuery('Error during approval.');
    }
});

// Bot handler for the "Reject" button
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

        // Logic to notify the user of rejection in real-time
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

bot.launch().then(() => console.log('[BOT] Telegram bot is running and listening for actions...'));

// Start Server
const PORT = process.env.PORT || 3000;
const startServer = async () => {
    await connectDB();
    server.listen(PORT, () => console.log(`[SERVER] Server running on port ${PORT}`));
};

startServer();