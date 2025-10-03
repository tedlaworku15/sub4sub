const mongoose = require('mongoose');
const { Schema } = mongoose;

const subscriptionSchema = new Schema({
    subscriber: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subscribedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { 
        type: String, 
        enum: ['pending', 'confirmed', 'refused'], 
        default: 'pending' 
    },
    refusalReason: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);