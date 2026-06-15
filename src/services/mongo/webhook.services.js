import crypto from 'crypto';
import { User, PaymentLog } from '../../models/index.js';
import { DEFAULT_PAYMENT_SOURCE } from '../../constants/paymentSource.js';

class WebhookService {
    async handlePaymentCaptured(payment) {
        try {
            const orderId = payment.order_id;
            const paymentId = payment.id;
            console.log('Payment captured:', payment);

            // Log payment event
            await this.logPaymentEvent('payment.captured', payment);

            // Find user with this order
            const user = await User.findOne({ currentOrderId: orderId });

            if (!user) {
                throw new Error(`No user found with order ${orderId}`);
            }

            // Update the specific order in user's array
            const order = user.orders.find(o => o.orderId === orderId);
            if (order) {
                order.paymentStatus = 'completed';
                order.paymentId = paymentId;
                order.paymentDetails = payment;
                order.updatedAt = new Date();
            }

            // Check if this payment is for a premium plan upgrade
            const isPremiumPayment = user.orders.some(o =>
                o.orderId === orderId && o.notes?.planDetails
            );

            if (isPremiumPayment) {
                const premiumOrder = user.orders.find(o => o.orderId === orderId);
                const planDetails = JSON.parse(premiumOrder.notes?.planDetails ?? '{}');

                // Frontend-only ₹5 test plan: record payment, do not grant premium
                if (planDetails?.isTestPlan) {
                    console.log('Test payment captured — skipping premium upgrade for order', orderId);
                } else if (planDetails) {
                    const premiumPlan = {
                        planTitle: planDetails.plan ?? "Counselling",
                        purchasedDate: new Date(),
                        form: planDetails.form ?? "Sarathi-Online",
                        expiryDate: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000), // ~6 months
                        paymentSource: DEFAULT_PAYMENT_SOURCE,
                    };

                    user.isPremium = true;
                    user.premiumPlan = premiumPlan;
                }
            }

            user.markModified('orders');
            await user.save();

            return { success: true };
        } catch (error) {
            console.error('Error handling payment captured:', error);
            throw error;
        }
    }

    async handlePaymentFailed(payment) {
        try {
            const orderId = payment.order_id;

            // Log payment event
            await this.logPaymentEvent('payment.failed', payment);

            // Find user with this order
            const user = await User.findOne({ currentOrderId: orderId });

            if (user) {
                // Update the specific order in user's array
                const order = user.orders.find(o => o.orderId === orderId);
                if (order) {
                    order.paymentStatus = 'failed';
                    order.paymentFailureDetails = payment;
                    order.updatedAt = new Date();
                }

                user.markModified('orders');
                await user.save();
            }

            return { success: true };
        } catch (error) {
            console.error('Error handling payment failed:', error);
            throw error;
        }
    }

    async handleOrderPaid(order) {
        try {
            // Log order event
            await this.logPaymentEvent('order.paid', order);
            return { success: true };
        } catch (error) {
            console.error('Error handling order paid:', error);
            throw error;
        }
    }

    async handleRefundCreated(refund) {
        try {
            const paymentId = refund.payment_id;

            // Log refund event
            await this.logPaymentEvent('refund.created', refund);

            // Find user with this payment
            const user = await User.findOne({ 'orders.paymentId': paymentId });

            if (user) {
                // Update order with refund information
                const order = user.orders.find(o => o.paymentId === paymentId);
                if (order) {
                    order.refundStatus = 'refunded';
                    order.refundDetails = refund;
                    order.refundedAt = new Date();
                }

                user.markModified('orders');
                await user.save();
            }

            return { success: true };
        } catch (error) {
            console.error('Error handling refund created:', error);
            throw error;
        }
    }

    async logPaymentEvent(eventType, data) {
        try {
            const sourceId = data?.id || data?.order_id;
            const id = sourceId
                ? `plog_${sourceId}_${eventType}`
                : `plog_${crypto.randomUUID()}`;

            await PaymentLog.create({
                id,
                eventType,
                data,
                timestamp: new Date(),
            });
        } catch (error) {
            // Razorpay may retry the same webhook — treat duplicate log id as OK
            if (error?.code === 11000) {
                console.warn('Payment log already recorded, skipping duplicate:', eventType);
                return;
            }
            console.error('Error logging payment event:', error);
        }
    }
}

export default new WebhookService();
