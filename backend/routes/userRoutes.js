const express = require('express');
const router = express.Router();
// --- CHANGE --- import the new SSE authenticator
const { protect, protectSSE } = require('../middleware/authMiddleware');
const Notification = require('../models/notification'); // Import the new model
const User = require('../models/user');
const Video = require('../models/video');

// @desc    Get the current user's profile data
// @route   GET /api/users/profile
// @access  Private
router.get('/profile', protect, (req, res) => {
    res.json(req.user);
});

// --- CHANGE --- New route to handle Server-Sent Events (SSE) for real-time updates
// @desc    Establish a connection for real-time updates
// @route   GET /api/users/events
// @access  Private (via query token)
router.get('/events', protectSSE, (req, res) => {
    const userId = req.user.id;
    const clients = req.app.get('sse_clients');

    // Set headers for SSE connection
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();

    // Store the client's response object
    clients[userId] = res;
    console.log(`[SSE] Client connected: ${userId}`);

    // Send a confirmation heartbeat
    res.write('data: {"message":"Connection established"}\n\n');

    // Handle client disconnection
    req.on('close', () => {
        delete clients[userId];
        console.log(`[SSE] Client disconnected: ${userId}`);
    });
});

router.get('/notifications', protect, async (req, res) => {
    try {
        const notifications = await Notification.find({ user: req.user.id, isRead: false })
            .sort({ createdAt: -1 }); // Show newest first
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'Server Error fetching notifications.' });
    }
});

// @desc    Mark a notification as read
// @route   POST /api/users/notifications/:id/read
// @access  Private
router.post('/notifications/:id/read', protect, async (req, res) => {
    try {
        const notification = await Notification.findOne({ _id: req.params.id, user: req.user.id });
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found.' });
        }
        notification.isRead = true;
        await notification.save();
        res.json({ message: 'Notification marked as read.' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error updating notification.' });
    }
});

router.get('/search', protect, async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) return res.json([]);

        // --- CHANGE --- Select the _id along with the channelName
        const users = await User.find({
            channelName: { $regex: query, $options: 'i' }
        }).select('channelName _id').limit(20);

        const filteredUsers = users.filter(user => user._id.toString() !== req.user.id);
        res.json(filteredUsers);
    } catch (error) {
        console.error('User Search Error:', error);
        res.status(500).json({ message: 'Server error during user search.' });
    }
});

// --- CHANGE --- New route to get all videos for a specific user
// @desc    Get all public videos for a specific user
// @route   GET /api/users/:userId/videos
// @access  Private
router.get('/:userId/videos', protect, async (req, res) => {
    try {
        const { userId } = req.params;
        const videos = await Video.find({ owner: userId });
        res.json(videos);
    } catch (error) {
        console.error('Fetch User Videos Error:', error);
        res.status(500).json({ message: 'Server error fetching user videos.' });
    }
});

router.post('/gift', protect, async (req, res) => {
    try {
        const user = req.user;
        const { amount } = req.body;
        const giftAmount = parseInt(amount, 10);

        // --- Server-side validation ---
        if (!giftAmount || giftAmount <= 0) {
            return res.status(400).json({ message: 'Please enter a valid amount to gift.' });
        }
        if (user.awaqiCoins < giftAmount) {
            return res.status(400).json({ message: 'Insufficient AwaqiCoins for this gift.' });
        }

        // --- The Transaction ---
        user.awaqiCoins -= giftAmount;
        await user.save();
        
        // --- The Response ---
        res.json({
            message: `Thank you for your generous gift of ${giftAmount} AwaqiCoins! We truly appreciate your support.`,
            newCoins: user.awaqiCoins
        });

    } catch (error) {
        console.error('Gift Error:', error);
        res.status(500).json({ message: 'Server error while processing your gift.' });
    }
});

module.exports = router;