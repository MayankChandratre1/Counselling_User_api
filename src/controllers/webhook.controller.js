import WebhookService from '../services/mongo/webhook.services.js';
import crypto from 'crypto';

class WebhookController {
  async handlePaymentEvent(req, res) {
    try {
      // Verify webhook signature
      const webhookSignature = req.headers['x-razorpay-signature'];

      if (!webhookSignature) {
        return res.status(400).json({ error: 'Webhook signature missing' });
      }

      // Verify webhook signature
      const isValid = this.verifyWebhookSignature(
        JSON.stringify(req.body),
        webhookSignature,
        process.env.RAZ_WEBHOOK_SECRET
      );

      if (!isValid) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }

      // Process the webhook event based on its type
      const event = req.body;

      // Handle different event types
      switch (event.event) {
        case 'payment.captured':
          await WebhookService.handlePaymentCaptured(event.payload.payment.entity);
          break;

        case 'payment.failed':
          await WebhookService.handlePaymentFailed(event.payload.payment.entity);
          break;

        case 'order.paid':
          await WebhookService.handleOrderPaid(event.payload.order.entity);
          break;

        case 'refund.created':
          await WebhookService.handleRefundCreated(event.payload.refund.entity);
          break;

        default:
          // Log unhandled event type
          console.log(`Unhandled webhook event: ${event.event}`);
      }

      // Return 200 response quickly for webhook
      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Webhook error:', error);

      // Always return 200 to prevent webhook retries
      res.status(200).json({
        received: true,
        error: error.message
      });
    }
  }

  verifyWebhookSignature(body, signature, secret) {
    console.log('Verifying webhook signature...');
    console.log('Body:', body);
    console.log('Signature:', signature);
    console.log('Secret:', secret);

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );
  }
}

export default new WebhookController();
