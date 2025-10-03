const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationSchema = new Schema({
    // The user who will receive this notification
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    
    // The content of the notification
    message: { type: String, required: true },
    
    // To categorize notifications in the future (e.g., 'refusal', 'payment', 'system')
    type: { type: String, default: 'info' },
    
    // To track if the user has seen it
    isRead: { type: Boolean, default: false },
    
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);