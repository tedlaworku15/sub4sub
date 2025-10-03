const mongoose = require('mongoose');
const { Schema } = mongoose;

const videoSchema = new Schema({
    youtubeId: { type: String, required: true },
    videoTitle: { type: String, required: true },
    channelName: { type: String, required: true },
    channelId: { type: String, required: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    views: { type: Number, default: 0 },
    
    // --- CHANGE --- A new field to identify system-sponsored links.
    isSponsored: { type: Boolean, default: false },

    isBoosted: { type: Boolean, default: false },
    boostExpiresAt: { type: Date, default: null },
    boostTarget: { type: Number, default: 0 },
    boostImpressions: { type: Number, default: 0 },
    viewedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

module.exports = mongoose.model('Video', videoSchema);