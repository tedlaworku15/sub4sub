const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    channelName: { type: String, required: true, trim: true },
    youtubeChannelId: { type: String, unique: true, sparse: true },
    password: { type: String, required: true },
    // --- CHANGE --- Default coins for new users changed from 10 to 0.
    awaqiCoins: { type: Number, default: 0 },
    referralCode: { type: String, unique: true },
    referredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    isBoosted: { type: Boolean, default: false },
    boostExpiresAt: { type: Date, default: null },
    isNewUser: { type: Boolean, default: true },
}, { timestamps: true });

// Pre-save hook to generate a unique referral code
userSchema.pre('save', function(next) {
    if (this.isNew && !this.referralCode) {
        this.referralCode = `SUB_${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    }
    next();
});

module.exports = mongoose.model('User', userSchema);