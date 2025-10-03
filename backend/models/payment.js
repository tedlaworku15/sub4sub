const mongoose = require('mongoose');
const { Schema } = mongoose;

const paymentSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amountETB: { type: Number, required: true },
    coinsPurchased: { type: Number, required: true },
    // --- CHANGE --- Added the phone number used for the deposit
    depositorPhoneNumber: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['pending', 'completed', 'failed'], 
        default: 'pending' 
    },
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);