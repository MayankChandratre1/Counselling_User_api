import { User } from '../../models/index.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';

class PaymentService {
    constructor() {
        this.razorpay = new Razorpay({
            key_id: process.env.RAZ_KEY_ID,
            key_secret: process.env.RAZ_KEY_SECRET,
        });
    }

    async createOrder(userId, amount, currency = 'INR', receipt = 'Receipt', notes = {}) {
        try {
            // Find user
            const user = await User.findOne({ id: userId });
            if (!user) {
                throw new Error('User not found');
            }

            const orderOptions = {
                amount: amount * 100, // Amount in paise
                currency,
                receipt,
                notes,
            };

            const order = await this.razorpay.orders.create(orderOptions);

            const orderData = {
                orderId: order.id,
                amount: order.amount / 100, // Store in rupees
                currency: order.currency,
                receipt: order.receipt,
                status: order.status,
                notes: order.notes,
                createdAt: new Date(),
                paymentStatus: 'pending',
            };

            // Update user document with new order
            user.currentOrderId = order.id;
            if (!user.orders) user.orders = [];
            user.orders.push(orderData);
            user.markModified('orders');
            await user.save();

            return { ...order, key_id: process.env.RAZ_KEY_ID };
        } catch (error) {
            throw new Error(`Error creating order: ${error.message}`);
        }
    }

    async getOrderById(orderId) {
        try {
            const order = await this.razorpay.orders.fetch(orderId);
            return order;
        } catch (error) {
            throw new Error(`Error fetching order: ${error.message}`);
        }
    }

    async verifyPayment(paymentData) {
        try {
            const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = paymentData;

            // Generate signature for verification
            const text = `${razorpay_order_id}|${razorpay_payment_id}`;
            const generated_signature = crypto
                .createHmac('sha256', process.env.RAZ_KEY_SECRET)
                .update(text)
                .digest('hex');

            // Verify signature
            if (generated_signature !== razorpay_signature) {
                throw new Error('Invalid payment signature');
            }

            // Get payment details
            const payment = await this.razorpay.payments.fetch(razorpay_payment_id);

            // Find user with this order
            const user = await User.findOne({ 'orders.orderId': razorpay_order_id });
            if (!user) {
                throw new Error('Order not found in user records');
            }

            // Update order in user's array
            const order = user.orders.find(o => o.orderId === razorpay_order_id);
            if (order) {
                order.paymentStatus = 'completed';
                order.paymentId = razorpay_payment_id;
                order.paymentDetails = payment;
                order.updatedAt = new Date();
            }
            user.markModified('orders');
            await user.save();

            return { success: true, payment };
        } catch (error) {
            throw new Error(`Payment verification failed: ${error.message}`);
        }
    }

    async getUserOrders(userId) {
        try {
            const user = await User.findOne({ id: userId });
            if (!user) {
                throw new Error('User not found');
            }
            return user.orders || [];
        } catch (error) {
            throw new Error(`Error fetching user orders: ${error.message}`);
        }
    }

    async getUserOrderById(userId, orderId) {
        try {
            const user = await User.findOne({ id: userId });
            if (!user) {
                throw new Error('User not found');
            }

            const order = user.orders?.find(o => o.orderId === orderId);
            if (!order) {
                throw new Error('Order not found');
            }
            return order;
        } catch (error) {
            throw new Error(`Error fetching user order: ${error.message}`);
        }
    }

    async getUserPaymentByUserId(userId) {
        try {
            const user = await User.findOne({ id: userId });
            if (!user) {
                throw new Error('User not found');
            }

            const completedOrders = user.orders?.filter(o => o.paymentStatus === 'completed') || [];
            return completedOrders;
        } catch (error) {
            throw new Error(`Error fetching user payments: ${error.message}`);
        }
    }

    getRazorpayKey() {
        return { key_id: process.env.RAZ_KEY_ID };
    }
}

export default new PaymentService();
