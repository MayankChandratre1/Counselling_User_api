import PaymentService from '../services/mongo/payment.service.js';

class PaymentController {
  async createOrder(req, res) {
    try {
      const { amount, currency, receipt, notes } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Valid amount is required' });
      }

      const userId = req.user.id;
      const order = await PaymentService.createOrder(userId, amount, currency, receipt, notes);

      res.status(201).json(order);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getOrderById(req, res) {
    try {
      const { orderId } = req.params;

      if (!orderId) {
        return res.status(400).json({ error: 'Order ID is required' });
      }

      const order = await PaymentService.getOrderById(orderId);
      res.status(200).json(order);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  }

  async verifyPayment(req, res) {
    try {
      const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

      if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
        return res.status(400).json({ error: 'Payment details are required' });
      }

      const result = await PaymentService.verifyPayment({
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature,
      });

      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getRazorpayKey(req, res) {
    try {
      const key = PaymentService.getRazorpayKey();
      res.status(200).json(key);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getUserOrders(req, res) {
    try {
      const userId = req.user.id;
      const orders = await PaymentService.getUserOrders(userId);
      res.status(200).json(orders);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  }

  async getUserOrderById(req, res) {
    try {
      const { orderId } = req.params;
      const userId = req.user.id;

      if (!orderId) {
        return res.status(400).json({ error: 'Order ID is required' });
      }

      const order = await PaymentService.getUserOrderById(userId, orderId);
      res.status(200).json(order);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  }

  async getUserPaymentById(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const payments = await PaymentService.getUserPaymentByUserId(userId);
      res.status(200).json(payments);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  }
}

export default new PaymentController();
