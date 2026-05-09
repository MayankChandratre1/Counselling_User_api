import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

function isOtpTestEnabled() {
  const v = process.env.OTP_TEST;
  if (v == null || String(v).trim() === '') return false;
  return ['1', 'true', 'yes', 'on'].includes(String(v).trim().toLowerCase());
}

/** Reduce any phone string to the last 10 digits so 10-digit, 12-digit
 *  (with `91`) and `+91 ...` formats compare equal. */
function normalizePhone(p) {
  return String(p || '').replace(/\D/g, '').slice(-10);
}

/**
 * Phone-level test allowlist. Set `OTP_TEST_NUMBERS` in `.env` to a comma
 * separated list of phones (any common format works) that should always
 * receive the fixed `123456` OTP without hitting the SMS gateway.
 *   e.g. OTP_TEST_NUMBERS=9876543210, +91 9123456789, 919000000001
 */
function getTestNumbers() {
  const v = process.env.OTP_TEST_NUMBERS;
  if (!v) return new Set();
  return new Set(
    String(v)
      .split(',')
      .map((s) => normalizePhone(s))
      .filter(Boolean)
  );
}

function isTestNumber(phoneNumber) {
  const normalized = normalizePhone(phoneNumber);
  if (!normalized) return false;
  return getTestNumbers().has(normalized);
}

class OtpClient {
  constructor() {
    this.apiUrl = 'https://www.bulksmsplans.com/api/send_sms';
    this.apiId = process.env.SMS_API_ID;
    this.apiPassword = process.env.SMS_API_PASSWORD;
    this.senderId = process.env.SMS_SENDER_ID || 'YASHLC';
    this.templateId = process.env.SMS_TEMPLATE_ID || '176983';
  }

  /**
   * Send SMS to a phone number
   * @param {string} phoneNumber - Phone number to send OTP (without country code)
   * @param {string} message - Message content (must contain the OTP)
   * @returns {Promise<Object>} - Response from the SMS API
   */
  async sendSms(phoneNumber, message) {
    try {
      if (!this.apiId || !this.apiPassword) {
        throw new Error('SMS API credentials not set in environment variables');
      }

      // Clean up the phone number (remove spaces, +, etc.)
      const cleanPhoneNumber = phoneNumber.toString().replace(/\D/g, '');

      const params = {
        api_id: this.apiId,
        api_password: this.apiPassword,
        sms_type: 'Transactional',
        sms_encoding: 'text',
        sender: this.senderId,
        number: cleanPhoneNumber,
        message: message,
        template_id: this.templateId
      };

      const response = await axios.get(this.apiUrl, { params });

      console.log(`SMS sent to ${cleanPhoneNumber}: ${message}`);
      return response.data;
    } catch (error) {
      console.error('Error sending SMS:', error);
      throw new Error(`Failed to send SMS: ${error.message}`);
    }
  }

  /**
   * Generate and send OTP
   * @param {string} phoneNumber - Phone number to send OTP
   * @returns {string} - Generated OTP
   */
  async sendOtp(phoneNumber) {
    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Create message with OTP
    const message = `Dear user, your OTP for login to Yash Classes is ${otp}. Please do not share this OTP with anyone. This OTP is valid for 10 minutes. - Yash Classes`;

    try {
      if (isOtpTestEnabled()) {
        console.warn(
          '[OTP_TEST] global switch on; SMS skipped, returning fixed 123456 for every number.'
        );
        return '123456';
      }
      if (isTestNumber(phoneNumber)) {
        console.warn(
          `[OTP_TEST_NUMBERS] ${phoneNumber} is whitelisted; SMS skipped, returning fixed 123456.`
        );
        return '123456';
      }
      await this.sendSms(phoneNumber, message);
      return otp;
    } catch (error) {
      throw error;
    }
  }
}

export default new OtpClient();
