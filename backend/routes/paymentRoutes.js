const express = require('express');
const router = express.Router();
const { Markup } = require('telegraf');
const Payment = require('../models/payment');
const { protect } = require('../middleware/authMiddleware');

const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;

router.post('/request', protect, async (req, res) => {
    const { amountETB, depositorPhoneNumber } = req.body;
    const user = req.user;

    if (!amountETB || !depositorPhoneNumber) {
        return res.status(400).json({ message: 'Please provide both amount and phone number.' });
    }
    if (amountETB < 25) {
        return res.status(400).json({ message: 'Minimum deposit is 25 ETB.' });
    }
    
    try {
        const coinsToCredit = parseInt(amountETB, 10);
        const newPayment = new Payment({
            user: user._id,
            amountETB,
            coinsPurchased: coinsToCredit,
            depositorPhoneNumber,
            status: 'pending'
        });
        await newPayment.save();

        const bot = req.app.get('bot');
        
        // --- CHANGE --- Added the "User Phone" field to the admin message
        const adminMessage = `
New Payment Confirmation Request:

**User:** ${user.channelName}
**User Phone:** ${depositorPhoneNumber}
**Amount:** ${amountETB} ETB
**Coins to Add:** ${coinsToCredit}

Please verify the deposit and take action.`;

        const keyboard = Markup.inlineKeyboard([
            Markup.button.callback('✅ Accept', `approve_${newPayment._id}`),
            Markup.button.callback('❌ Reject', `reject_${newPayment._id}`)
        ]);

        if (bot && ADMIN_TELEGRAM_ID) {
            await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, adminMessage, { 
                ...keyboard,
                parse_mode: 'Markdown' 
            });
        }

        res.status(201).json({ message: 'Your payment request has been submitted.' });
    } catch (error) {
        console.error('Payment Request Error:', error);
        res.status(500).json({ message: 'Server error processing payment request.' });
    }
});

module.exports = router;