// --- backend/routes/subscriptionRoutes.js ---

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Subscription = require('../models/subscription');
const Video = require('../models/video');
const { protect } = require('../middleware/authMiddleware');
const mongoose = require('mongoose');
const Notification = require('../models/notification');

// @desc    Perform a subscription (from Discover page)
// @route   POST /api/subscriptions/perform
// @access  Private
router.post('/perform', protect, async (req, res) => {
    try {
        const { targetChannelId, linkId } = req.body;
        const subscriber = req.user;

        if (subscriber.youtubeChannelId === targetChannelId) {
             return res.status(400).json({ message: "You can't subscribe to yourself." });
        }
        
        const video = await Video.findById(linkId).populate('owner');
        if (!video) return res.status(404).json({ message: 'Associated video not found.' });
        
        const targetUser = video.owner;
        let rewardCoins = 0;
        let message = '';

        if (video.isSponsored) {
            // Rule: System-sponsored links give 3 coins from the system.
            rewardCoins = 3;
            subscriber.awaqiCoins += rewardCoins;
            await subscriber.save();
            message = `Subscription sent! You earned ${rewardCoins} AwaqiCoins from a sponsored link.`;

        } else {
            // Rule: Regular/Boosted links use a 1-coin peer-to-peer exchange.
            rewardCoins = 1;
            if (targetUser.awaqiCoins < rewardCoins) {
                return res.status(400).json({ message: `This channel owner cannot afford the ${rewardCoins} coin reward.` });
            }
            // Deduct from the target and give to the subscriber.
            targetUser.awaqiCoins -= rewardCoins;
            subscriber.awaqiCoins += rewardCoins;
            
            await Promise.all([targetUser.save(), subscriber.save()]);
            message = `Subscription sent! You earned ${rewardCoins} AwaqiCoin from ${targetUser.channelName}.`;
        }

        await Subscription.create({
            subscriber: subscriber._id,
            subscribedTo: targetUser._id,
            status: 'pending'
        });

        res.json({ message, newCoins: subscriber.awaqiCoins });

    } catch (error) {
        console.error('Perform Subscription Error:', error);
        res.status(500).json({ message: 'Server error during subscription.' });
    }
});

// @desc    Confirm the mandatory first subscription
// @route   POST /api/subscriptions/confirm-mandatory
// @access  Private
router.post('/confirm-mandatory', protect, async (req, res) => {
    try {
        const user = req.user;
        if (!user.isNewUser) {
            return res.status(400).json({ message: 'This action is only for new users.' });
        }

        // Mark the user as no longer new and give them a starting bonus.
        user.isNewUser = false;
        user.awaqiCoins += 3; // Welcome bonus
        await user.save();
        
        res.json({
            message: 'Welcome! You earned 3 AwaqiCoins for your first subscription.',
            newCoins: user.awaqiCoins
        });
    } catch (error) {
        console.error('Confirm Mandatory Sub Error:', error);
        res.status(500).json({ message: 'Server error confirming mandatory subscription.' });
    }
});

// @desc    Get list of pending subscribers for the current user
// @route   GET /api/subscriptions/my-subscribers
// @access  Private
router.get('/my-subscribers', protect, async (req, res) => {
    try {
        const subscriptions = await Subscription.find({ 
            subscribedTo: req.user.id,
            status: 'pending' 
        }).populate('subscriber', 'channelName').lean();

        const subscriptionsWithVideo = await Promise.all(subscriptions.map(async (sub) => {
            const video = await Video.findOne({ owner: sub.subscriber._id }).select('youtubeId channelId').lean();
            return {
                ...sub,
                subscriberVideo: video
            };
        }));

        const validSubscriptions = subscriptionsWithVideo.filter(sub => sub.subscriberVideo);

        res.json(validSubscriptions);
    } catch (error) {
        console.error("Error getting subscribers:", error);
        res.status(500).json({ message: 'Server Error getting subscribers' });
    }
});

// @desc    Confirm a subscription (subscribe back)
// @route   POST /api/subscriptions/subscribe-back/:id
// @access  Private
router.post('/subscribe-back/:id', protect, async (req, res) => {
    try {
        const subscription = await Subscription.findById(req.params.id);
        if (!subscription || !subscription.subscribedTo.equals(req.user.id)) {
            return res.status(404).json({ message: 'Subscription not found.' });
        }
        if (subscription.status !== 'pending') {
            return res.status(400).json({ message: 'This subscription has already been processed.' });
        }

        const currentUser = req.user; // The user subscribing back (User B)
        const originalSubscriber = await User.findById(subscription.subscriber); // The user who subscribed first (User A)
        const REWARD_AMOUNT = 1;

        if (originalSubscriber.awaqiCoins < REWARD_AMOUNT) {
            // The original subscriber CANNOT afford the 1-coin reward.
            // We still confirm the subscription to clear it from the current user's queue.
            subscription.status = 'confirmed';
            await subscription.save();
            
            // Return a specific error message that the frontend can handle.
            return res.status(400).json({ 
                message: `${originalSubscriber.channelName} does not have enough coins to complete the exchange. The request has been cleared.` 
            });
        }

        // If we reach here, the original subscriber CAN afford the reward.
        originalSubscriber.awaqiCoins -= REWARD_AMOUNT;
        currentUser.awaqiCoins += REWARD_AMOUNT;
        subscription.status = 'confirmed';

        await Promise.all([
            originalSubscriber.save(),
            currentUser.save(),
            subscription.save()
        ]);
        
        res.json({ 
            message: `Successfully subscribed back! You earned ${REWARD_AMOUNT} AwaqiCoin.`, 
            newCoins: currentUser.awaqiCoins 
        });

    } catch (error) {
        console.error('Subscribe Back Error:', error);
        res.status(500).json({ message: 'Server Error during subscribe-back.' });
    }
});

// @desc    Refuse a subscription - PENALTY ACTION
// @route   POST /api/subscriptions/refuse/:id
// @access  Private
router.post('/refuse/:id', protect, async (req, res) => {
    try {
        const subscription = await Subscription.findById(req.params.id).populate('subscriber');
        if (!subscription || !subscription.subscribedTo.equals(req.user.id)) {
            return res.status(404).json({ message: 'Subscription not found.' });
        }
        if (subscription.status !== 'pending') {
            return res.status(400).json({ message: 'This subscription has already been processed.' });
        }

        const refuser = req.user; // The current user who is refusing (User B)
        const originalSubscriber = subscription.subscriber; // The user who subscribed first (User A)
        const PENALTY_AMOUNT = 2;
        
        // Check if the refuser can afford the penalty.
        if (refuser.awaqiCoins < PENALTY_AMOUNT) {
            return res.status(400).json({ message: `You need at least ${PENALTY_AMOUNT} AwaqiCoins to refuse a subscription.` });
        }

        // Transfer coins from the refuser to the original subscriber.
        refuser.awaqiCoins -= PENALTY_AMOUNT;
        originalSubscriber.awaqiCoins += PENALTY_AMOUNT;
        
        subscription.status = 'refused';
        subscription.refusalReason = req.body.reason || 'No reason provided.';
        
        await Promise.all([
            refuser.save(),
            originalSubscriber.save(),
            subscription.save()
        ]);

        // Create a notification for the original subscriber informing them of their reward.
        const notificationMessage = `You have been awarded ${PENALTY_AMOUNT} coins because ${refuser.channelName} did not subscribe back.`;
        await Notification.create({
            user: originalSubscriber._id,
            message: notificationMessage,
            type: 'refusal_reward'
        });

        res.json({ 
            message: `Subscription refused. ${PENALTY_AMOUNT} AwaqiCoins have been paid to the other user.`,
            newCoins: refuser.awaqiCoins
        });

    } catch (error) {
        console.error('Refuse Sub Error:', error);
        res.status(500).json({ message: 'Server Error refusing subscription.' });
    }
});

// @desc    Get IDs of channels the current user has already subscribed to
// @route   GET /api/subscriptions/my-subscription-ids
// @access  Private
router.get('/my-subscription-ids', protect, async (req, res) => {
    try {
        const subscriptions = await Subscription.find({ 
            subscriber: req.user.id,
            status: 'confirmed'
        }).select('subscribedTo -_id');

        const ids = subscriptions.map(sub => sub.subscribedTo);
        res.json(ids);
    } catch (error) {
        console.error("Error fetching subscription IDs:", error);
        res.status(500).json({ message: 'Server Error getting subscription IDs' });
    }
});

module.exports = router;