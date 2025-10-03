// --- backend/routes/authRoutes.js ---

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { protect } = require('../middleware/authMiddleware');

// --- CHANGE --- Added referralCode to the response payload
const formatUserResponse = (user, token) => ({
    token,
    user: {
        id: user._id,
        channelName: user.channelName,
        email: user.email,
        coins: user.awaqiCoins,
        isNewUser: user.isNewUser,
        referralCode: user.referralCode, // Add this line
    },
});

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', async (req, res) => {
    try {
        const { email, channelName, password, referralCode } = req.body;
        if (!email || !channelName || !password) {
            return res.status(400).json({ message: 'Please provide all required fields.' });
        }
        if (await User.findOne({ email })) {
            return res.status(400).json({ message: 'User with this email already exists.' });
        }
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const user = new User({ email, channelName, password: hashedPassword });

        // --- CHANGE --- New referral logic
        // It now adds 3 coins to the new user if the code is valid.
        if (referralCode) {
            const referredByUser = await User.findOne({ referralCode: referralCode.trim() });
            if (referredByUser) {
                // Give 5 coins to the referrer
                referredByUser.awaqiCoins += 5; 
                await referredByUser.save();
                // Give 3 coins to the new user
                user.awaqiCoins += 3;
            }
        }

        await user.save();
        
        const payload = { user: { id: user.id } };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });

        res.status(201).json(formatUserResponse(user, token));

    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
});
// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (user && (await bcrypt.compare(password, user.password))) {
            const payload = { user: { id: user.id } };
            const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });
            res.json(formatUserResponse(user, token));
        } else {
            res.status(400).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error during login.' });
    }
});

// @desc    Check if token is valid and return user data
// @route   POST /api/auth/check-token
// @access  Private
router.post('/check-token', protect, async (req, res) => {
    try {
        // --- CHANGE --- Added referralCode to the response payload
        res.json({
            user: {
                id: req.user._id,
                channelName: req.user.channelName,
                email: req.user.email,
                coins: req.user.awaqiCoins,
                isNewUser: req.user.isNewUser,
                referralCode: req.user.referralCode, // Add this line
            },
        });
    } catch (error) {
        console.error('Check Token Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;