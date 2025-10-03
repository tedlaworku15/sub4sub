const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/user');
const Video = require('../models/video');
const Subscription = require('../models/subscription');
const { protect } = require('../middleware/authMiddleware');

const FREE_VIDEO_SLOTS = 1;
const EXTRA_SLOT_COST = 3;

const boostOptions = {
    '100': { cost: 25, durationDays: 7 },
    '500': { cost: 125, durationDays: 14 },
    '1000': { cost: 250, durationDays: 21 }
};

function getYouTubeID(url) {
    const arr = url.split(/(vi\/|v%3D|v=|\/v\/|youtu\.be\/|\/embed\/)/);
    return arr[2] ? arr[2].split(/[?&]/)[0] : null;
}

// @desc    Get sponsored videos (FOR FUTURE VIP USE)
router.get('/sponsored', protect, async (req, res) => {
    try {
        const sponsoredVideos = await Video.find({
            isSponsored: true,
            owner: { $ne: req.user._id } 
        }).limit(3); // Limit how many sponsored links are shown
        res.json(sponsoredVideos);
    } catch (error) {
        console.error('Sponsored Videos Error:', error);
        res.status(500).json({ message: 'Server error fetching sponsored videos.' });
    }
});

// @desc    Get videos to discover, with boosted videos prioritized
router.get('/discover', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const subscribedToOwnerIds = (await Subscription.find({ subscriber: userId })).map(s => s.subscribedTo);
        const excludeIds = [...subscribedToOwnerIds, userId];

        const BOOSTED_VIDEOS_TO_SHOW = 3;
        
        // --- CHANGE --- Chained .populate() to fetch the owner's coin balance with the video.
        const boostedVideos = await Video.find({
            isBoosted: true,
            isSponsored: false,
            boostExpiresAt: { $gt: new Date() },
            $expr: { $lt: ["$boostImpressions", "$boostTarget"] },
            owner: { $nin: excludeIds },
            viewedBy: { $nin: [userId] }
        })
        .populate('owner', 'awaqiCoins') // Fetches only the 'awaqiCoins' field of the owner.
        .limit(BOOSTED_VIDEOS_TO_SHOW);
        
        if (boostedVideos.length > 0) {
            const videoIdsToUpdate = boostedVideos.map(v => v._id);
            await Video.updateMany(
                { _id: { $in: videoIdsToUpdate } },
                { $inc: { boostImpressions: 1 }, $push: { viewedBy: userId } }
            );
        }

        const regularVideoLimit = 20 - boostedVideos.length;
        const boostedVideoIds = boostedVideos.map(v => v._id);

        // --- CHANGE --- Also chained .populate() to the regular videos query.
        const regularVideos = await Video.find({
            owner: { $nin: excludeIds },
            _id: { $nin: boostedVideoIds },
            isBoosted: false,
            isSponsored: false
        })
        .populate('owner', 'awaqiCoins') // Fetches only the 'awaqiCoins' field of the owner.
        .limit(regularVideoLimit);

        const finalList = [...boostedVideos, ...regularVideos];

        if (finalList.length > 0) {
            const videoIds = finalList.map(v => v._id);
            await Video.updateMany({ _id: { $in: videoIds } }, { $inc: { views: 1 } });
        }
        
        res.json(finalList);
    } catch (error) {
        console.error('Discover Videos Error:', error);
        res.status(500).json({ message: 'Server error fetching discoverable videos.' });
    }
});

// @desc    Get the next available boosted video for a user
router.get('/next-boosted', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const boostedVideo = await Video.findOne({
            isBoosted: true,
            boostExpiresAt: { $gt: new Date() },
            $expr: { $lt: ["$boostImpressions", "$boostTarget"] },
            owner: { $ne: userId },
            viewedBy: { $nin: [userId] }
        });

        if (boostedVideo) {
            boostedVideo.boostImpressions += 1;
            boostedVideo.viewedBy.push(userId);
            await boostedVideo.save();
        }
        res.json(boostedVideo); 
    } catch (error) {
        console.error('Next Boosted Video Error:', error);
        res.status(500).json({ message: 'Server error fetching next boosted video.' });
    }
});

// --- CHANGE --- New route to get the mandatory first video for new users
// @desc    Get the mandatory first video for new users
// @route   GET /api/videos/mandatory
// @access  Private
router.get('/mandatory', protect, async (req, res) => {
    try {
        // For now, this is hardcoded. In the future, this could be pulled from a database setting.
        const mandatoryVideo = {
            videoId: 'VCJPHV6gQDk',
            channelId: 'UC0kCpfjHnorr39BtAmmH0Pg' , 
        };
        res.json(mandatoryVideo);
    } catch (error) {
        console.error('Mandatory Video Error:', error);
        res.status(500).json({ message: 'Server error fetching mandatory video.' });
    }
});

// @desc    Get user's own videos
router.get('/my-videos', protect, async (req, res) => {
    try {
        const videos = await Video.find({ owner: req.user.id });
        res.json(videos);
    } catch (error) {
        res.status(500).json({ message: 'Server error fetching your videos.' });
    }
});

// --- FIX --- The implementation for this route has been fully restored.
// @desc    Add a new video
// @route   POST /api/videos/my-videos
// @access  Private
router.post('/my-videos', protect, async (req, res) => {
    try {
        const { videoUrl } = req.body;
        const videoId = getYouTubeID(videoUrl);
        if (!videoId) {
            return res.status(400).json({ message: 'Invalid YouTube URL provided.' });
        }

        const YOUTUBE_API_URL = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet&key=${process.env.YOUTUBE_API_KEY}`;
        const youtubeResponse = await axios.get(YOUTUBE_API_URL);

        if (!youtubeResponse.data.items || youtubeResponse.data.items.length === 0) {
            return res.status(404).json({ message: 'Could not find this video on YouTube.' });
        }
        
        const videoDetails = youtubeResponse.data.items[0].snippet;
        const user = req.user;
        const videoCount = await Video.countDocuments({ owner: user._id });
        
        if (videoCount >= FREE_VIDEO_SLOTS) {
            if (user.awaqiCoins < EXTRA_SLOT_COST) {
                return res.status(400).json({ message: `You need ${EXTRA_SLOT_COST} AwaqiCoins for another video slot.` });
            }
            user.awaqiCoins -= EXTRA_SLOT_COST;
        }

        const newVideo = new Video({
            youtubeId: videoId,
            videoTitle: videoDetails.title,
            channelName: videoDetails.channelTitle,
            channelId: videoDetails.channelId,
            owner: user._id,
        });
        
        await newVideo.save();

        if (!user.youtubeChannelId) {
            user.youtubeChannelId = videoDetails.channelId;
        }
        await user.save();

        res.status(201).json({ 
            message: 'Video added successfully!',
            newCoins: user.awaqiCoins,
            newVideo 
        });
    } catch (error) {
        console.error('Add Video Error:', error.response ? error.response.data : error.message);
        if (error.response && error.response.data.error.message.includes('API key')) {
            return res.status(500).json({ message: 'Server configuration error: The YouTube API key is invalid or missing.' });
        }
        res.status(500).json({ message: 'A server error occurred while adding the video.' });
    }
});

// @desc    Delete a video
router.delete('/my-videos/:id', protect, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video || !video.owner.equals(req.user.id)) {
            return res.status(404).json({ message: 'Video not found.' });
        }
        await video.deleteOne();
        res.json({ message: 'Video deleted.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error while deleting video.' });
    }
});

// @desc    Boost a video
router.post('/my-videos/:id/boost', protect, async (req, res) => {
    try {
        const { boostAmount } = req.body;
        const user = req.user;

        const selectedBoost = boostOptions[boostAmount];
        if (!selectedBoost) {
            return res.status(400).json({ message: 'Invalid boost level selected.' });
        }

        if (user.awaqiCoins < selectedBoost.cost) {
            return res.status(400).json({ message: 'Insufficient AwaqiCoins for this boost.' });
        }

        const videoToBoost = await Video.findById(req.params.id);
        if (!videoToBoost || !videoToBoost.owner.equals(user._id)) {
            return res.status(404).json({ message: 'Video not found.' });
        }

        user.awaqiCoins -= selectedBoost.cost;
        await user.save();
        
        videoToBoost.isBoosted = true;
        videoToBoost.boostExpiresAt = new Date(Date.now() + selectedBoost.durationDays * 24 * 60 * 60 * 1000);
        videoToBoost.boostTarget = parseInt(boostAmount, 10);
        videoToBoost.boostImpressions = 0;
        videoToBoost.viewedBy = [];
        await videoToBoost.save();

        res.json({ message: 'Video boosted successfully!', newCoins: user.awaqiCoins });
    } catch (error) {
        console.error('Boost Video Error:', error);
        res.status(500).json({ message: 'Server error while boosting video.' });
    }
});

module.exports = router;