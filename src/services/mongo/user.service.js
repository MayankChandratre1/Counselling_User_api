import { User, CounsellingForm, RegistrationForm, LandingPageContact, LandingPageHomepage, LandingPagePremiumPlans, DynamicScreen, Metadata, UserList, LandingPageReviews } from '../../models/index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import redis from '../../config/redisClient.js';
import otpClient from '../../utils/otpClient.js';
import axios from 'axios';
import crypto from 'crypto';

class UserService {
    // Helper to generate IDs
    generateId() {
        return crypto.randomUUID().replace(/-/g, '').substring(0, 20);
    }

    async sendOneSignalNotification(playerId, title, message, additionalData = {}) {
        try {
            const response = await axios.post(
                'https://onesignal.com/api/v1/notifications',
                {
                    app_id: process.env.ONESIGNAL_APP_ID, // Store this in your .env file
                    include_player_ids: [playerId],
                    headings: { en: title },
                    contents: { en: message },
                    data: additionalData
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Basic ${process.env.ONESIGNAL_REST_API_KEY}` // Store this in your .env file
                    }
                }
            );

            console.log(response.data);

            return response.data;
        } catch (error) {
            console.error('Error sending OneSignal notification:', error.response?.data || error.message);
            throw error;
        }
    }

    async sendPushNotification(phone, playerId, title, body) {
        try {
            const notification = {
                title: title,
                body: body,
                phone: phone,
                createdAt: new Date()
            };
            await this.sendOneSignalNotification(playerId, title, body, notification);
            return { notification };
        } catch (error) {
            throw new Error(`Error sending push notification: ${error.message}`);
        }
    }

    async createUser(userData) {
        try {
            const existingUser = await User.findOne({ phone: userData.phone });
            if (existingUser) {
                throw new Error('User With this phone number already exists');
            }

            const id = this.generateId();
            const user = new User({
                id,
                name: userData.name,
                phone: userData.phone,
                isPremium: false,
                premiumPlan: null,
                hasLoggedIn: true
            });

            await user.save();
            return user.toObject();
        } catch (error) {
            throw new Error(`Error creating user: ${error.message}`);
        }
    }

    async sendOTPForPremiumLogin(phone) {
        try {
            const user = await User.findOne({ phone: phone.toString() });

            if (!user) {
                throw new Error('User not found');
            }

            if (user.isPremium) {
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                const otpExpiry = new Date();
                otpExpiry.setMinutes(otpExpiry.getMinutes() + 5);

                user.otp = otp;
                user.otpExpiry = otpExpiry;
                await user.save();

                // TODO: Implement actual SMS service
                console.log(`SMS to ${phone}: Your verification code is: ${otp}`);

                return true;
            }
            return false;
        } catch (error) {
            throw new Error(`Error sending OTP: ${error.message}`);
        }
    }

    async login(phone, password = null, deviceId = null) {
        try {
            let user = await User.findOne({ phone: phone.toString() });

            if (!user) {
                // create a new user
                const otp = await otpClient.sendOtp(phone);
                console.log(`SMS to ${phone}: Your verification code is: ${otp}`);

                const id = this.generateId();

                const newUserObj = {
                    id,
                    name: phone,
                    phone: phone,
                    isPremium: false,
                    premiumPlan: null,
                    hasLoggedIn: true,
                    currentDeviceId: deviceId,
                    firstLogin: true,
                    batch: 'online',
                    otp: otp,
                    otpExpiry: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes expiry
                };

                user = await User.create(newUserObj);

                // Update allUserIdLists metadata
                let metadata = await Metadata.findOne({ id: 'allUserIdLists' });
                if (metadata) {
                    if (!metadata.userIdList) metadata.userIdList = [];
                    metadata.userIdList.push(id);
                    metadata.markModified('userIdList');
                    await metadata.save();
                } else {
                    await Metadata.create({ id: 'allUserIdLists', userIdList: [id] });
                }

                return { ...user.toObject(), firstLogin: true };
            }

            if (user.hasLoggedIn) {
                if (user.currentDeviceId && user.currentDeviceId !== deviceId)
                    throw new Error('User already logged in on another device');
            }

            const otp = await otpClient.sendOtp(phone);
            console.log(`SMS to ${phone}: Your verification code is: ${otp}`);

            user.currentDeviceId = deviceId;
            user.hasLoggedIn = true;
            user.otp = otp;
            user.otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
            await user.save();

            const token = jwt.sign({ id: user.id, phone }, process.env.USER_JWT);

            return { ...user.toObject(), token };
        } catch (error) {
            throw new Error(`Error during login: ${error.message}`);
        }
    }

    async logout(userId) {
        try {
            await User.updateOne({ id: userId }, { hasLoggedIn: false });
        } catch (error) {
            throw new Error(`Error during logout: ${error.message}`);
        }
    }

    async getUserById(id) {
        try {
            const user = await User.findOne({ id });
            if (!user) {
                throw new Error('User not found');
            }
            return user.toObject();
        } catch (error) {
            throw new Error(`Error getting user: ${error.message}`);
        }
    }

    async getUserByPhone(phone) {
        try {
            const user = await User.findOne({ phone });
            if (!user) {
                throw new Error('User not found');
            }
            return user.toObject();
        } catch (error) {
            throw new Error(`Error getting user: ${error.message}`);
        }
    }

    async updatePremiumPlan(userId, planData) {
        try {
            const premiumPlan = {
                planTitle: planData.planTitle,
                purchasedDate: new Date(),
                expiryDate: planData.expiryDate,
            };

            const password = planData.registrationData.confirmPassword;
            if (password.length < 6) {
                throw new Error('Password must be at least 6 characters long');
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            planData.registrationData.password = hashedPassword;
            planData.registrationData.confirmPassword = null;

            await User.updateOne({ id: userId }, {
                isPremium: true,
                premiumPlan,
                counsellingData: planData.registrationData,
                password: hashedPassword
            });

            return this.getUserById(userId);
        } catch (error) {
            throw new Error(`Error updating premium plan: ${error.message}`);
        }
    }

    async updateCounsellingData(userId, registrationData) {
        try {
            await User.updateOne({ id: userId }, {
                counsellingData: registrationData,
            });
            return this.getUserById(userId);
        } catch (error) {
            throw new Error(`Error updating counselling data: ${error.message}`);
        }
    }

    async checkPremiumStatus(userId) {
        try {
            const user = await this.getUserById(userId);
            if (!user.premiumPlan) return user;

            const now = new Date();
            const expiryDate = new Date(user.premiumPlan.expiryDate);

            if (expiryDate < now) {
                await User.updateOne({ id: userId }, { isPremium: false });
                return this.getUserById(userId);
            }

            return user;
        } catch (error) {
            throw new Error(`Error checking premium status: ${error.message}`);
        }
    }

    async checkPremiumStatusByPhone(phone) {
        try {
            const user = await User.findOne({ phone });

            if (!user) {
                return { isPremium: false };
            }

            if (!user.premiumPlan || !user.premiumPlan.expiryDate) return {
                isPremium: false
            };

            const now = new Date();
            const expiryDate = new Date(user.premiumPlan.expiryDate);

            if (expiryDate < now) {
                await User.updateOne({ id: user.id }, { isPremium: false });
                return { isPremium: false };
            }

            return {
                isPremium: true,
                plan: user.premiumPlan
            };
        } catch (error) {
            throw new Error(`Error checking premium status: ${error.message}`);
        }
    }

    async createFormSteps(formData) {
        try {
            const id = this.generateId();
            const form = {
                id,
                steps: formData.steps.map(step => ({
                    number: step.number,
                    title: step.title,
                    status: step.status || null
                }))
            };
            const createdForm = await CounsellingForm.create(form);
            return createdForm.toObject();
        } catch (error) {
            throw new Error(`Error creating form steps: ${error.message}`);
        }
    }

    async getFormSteps() {
        try {
            const forms = await CounsellingForm.find();
            return forms.map(doc => doc.toObject());
        } catch (error) {
            throw new Error(`Error getting form steps: ${error.message}`);
        }
    }

    async getFormStepsById(formId) {
        try {
            const form = await CounsellingForm.findOne({ id: formId });
            if (!form) {
                throw new Error('Form not found');
            }
            return form.toObject();
        } catch (error) {
            throw new Error(`Error getting form steps: ${error.message}`);
        }
    }

    async updateFormSteps(formId, updateData) {
        try {
            await CounsellingForm.updateOne({ id: formId }, { steps: updateData.steps });
            return this.getFormStepsById(formId);
        } catch (error) {
            throw new Error(`Error updating form steps: ${error.message}`);
        }
    }

    async deleteFormSteps(formId) {
        try {
            await CounsellingForm.deleteOne({ id: formId });
            return { id: formId, message: 'Form deleted successfully' };
        } catch (error) {
            throw new Error(`Error deleting form steps: ${error.message}`);
        }
    }

    async setUserFormData(phone, formSteps) {
        try {
            const user = await User.findOne({ phone });
            if (!user) throw new Error('User not found');

            const formDoc = await CounsellingForm.findOne({ id: formSteps.id });
            if (!formDoc) throw new Error('Form template not found');

            const genericForm = formDoc.toObject();

            const mergedSteps = genericForm.steps.map(genericStep => {
                const userStep = formSteps.steps.find(s => s.number === genericStep.number);
                return {
                    ...genericStep,
                    data: userStep?.data || null,
                    status: userStep?.status || genericStep.status || null
                };
            });

            await User.updateOne({ id: user.id }, {
                stepsData: {
                    id: formSteps.id,
                    steps: mergedSteps
                }
            });

            return { id: formSteps.id, steps: mergedSteps };
        } catch (error) {
            throw new Error(`Error setting user form data: ${error.message}`);
        }
    }

    async getUserFormData(phone, formId) {
        try {
            const user = await User.findOne({ phone });
            if (!user) throw new Error('User not found');

            const formDoc = await CounsellingForm.findOne({ id: formId });
            if (!formDoc) throw new Error('Form template not found');

            const genericForm = formDoc.toObject();
            const userData = user.stepsData;

            if (!userData || userData.id !== formId) {
                return { id: formId, steps: genericForm.steps };
            }

            const mergedSteps = genericForm.steps.map(genericStep => {
                const userStep = userData.steps.find(s => s.number === genericStep.number);

                return {
                    ...genericStep,
                    data: userStep?.data || null,
                    status: userStep?.status || genericStep.status || null,
                    ...userStep
                };
            });

            return { id: formId, steps: mergedSteps };
        } catch (error) {
            throw new Error(`Error getting user form data: ${error.message}`);
        }
    }

    async updateUserFormData(phone, formId, updatedSteps) {
        try {
            const user = await User.findOne({ phone });
            if (!user) throw new Error('User not found');

            const formDoc = await CounsellingForm.findOne({ id: formId });
            if (!formDoc) throw new Error('Form template not found');

            const genericForm = formDoc.toObject();

            const validStepNumbers = new Set(genericForm.steps.map(s => s.number));
            const processedSteps = updatedSteps.map(step => ({
                ...step,
                number: parseInt(step.number) // Convert to number
            }));

            const invalidSteps = processedSteps.filter(s => !validStepNumbers.has(s.number));
            if (invalidSteps.length > 0) {
                throw new Error(`Invalid step numbers: ${invalidSteps.map(s => s.number).join(', ')}`);
            }

            const currentUserData = user.stepsData?.id === formId ?
                user.stepsData :
                { id: formId, steps: genericForm.steps };

            const mergedSteps2 = genericForm.steps.map(step => {
                const currentStep = currentUserData.steps.find(s => s.number === step.number);
                if (!currentStep) return step;
                const updatedStep = processedSteps.find(s => s.number === currentStep.number);
                if (!updatedStep) return currentStep;

                return {
                    ...currentStep,
                    ...updatedStep,
                    status: updatedStep.status || null,
                    remark: updatedStep.remark || null
                };
            });

            // Update user's stepsData
            user.stepsData = {
                id: formId,
                steps: mergedSteps2
            };

            user.markModified('stepsData');
            await user.save();

            return { id: formId, steps: mergedSteps2 };
        } catch (error) {
            console.log(error);
            throw new Error(`Error updating user form data: ${error.message}`);
        }
    }

    async getUserLists(id) {
        try {

            const user = await User.findOne({ id });

            if (!user) throw new Error('User not found');
            const userlists = await UserList.find({ userId: user.id });
            console.log(userlists.length);

            return userlists ?? [];
        } catch (error) {
            throw new Error(`Error getting user lists: ${error.message}`);
        }
    }

    async getRegistrationForm(userId) {
        try {
            const user = await User.findOne({ id: userId });
            const formDoc = await RegistrationForm.findOne({ id: 'Form1' });

            if (!formDoc) throw new Error('Form not found');

            const form = {
                userData: user?.counsellingData,
                formData: formDoc.toObject(),
            }

            return form ?? {};
        } catch (error) {
            throw new Error(`Error getting registration form: ${error.message}`);
        }
    }

    async getLandingPageData() {
        try {
            const formDoc = await LandingPageHomepage.findOne({ id: 'homepage' });
            if (!formDoc) throw new Error('Form not found');
            return formDoc.toObject() ?? {};
        } catch (error) {
            throw new Error(`Error getting landing page data: ${error.message}`);
        }
    }

    async updateName(phone, name, email) {
        try {
            const user = await User.findOne({ phone });
            if (!user) {
                throw new Error('User not found');
            }
            if (!name) {
                throw new Error('Name is required');
            }

            user.name = name;
            user.email = email;
            user.hasLoggedIn = true;
            user.firstLogin = false;
            await user.save();

            await this.invalidateCache(`user:${user.id}`);
            const token = jwt.sign({ id: user.id, phone }, process.env.USER_JWT);

            return { ...user.toObject(), name, token };
        } catch (error) {
            throw new Error(`Error updating user name: ${error.message}`);
        }
    }

    async invalidateCache(pattern) {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
            await redis.del(keys);
        }
    }

    async verifyPhone(phone, otp) {
        try {
            const user = await User.findOne({ phone });
            if (!user) {
                throw new Error('User not found');
            }
            if (!otp) {
                throw new Error('OTP is required');
            }
            if (user.otp !== otp) {
                throw new Error('Invalid OTP');
            }
            let firstLogin = false;
            if (user.firstLogin) {
                firstLogin = true;
            }

            user.hasLoggedIn = true;
            user.otp = null;
            user.otpExpiry = null;
            user.firstLogin = false;
            user.phoneVerified = true;
            await user.save();

            await this.invalidateCache(`user:${user.id}`);
            return { ...user.toObject(), phoneVerified: true, verified: true, firstLogin };
        } catch (error) {
            throw new Error(`Error verifying phone: ${error.message}`);
        }
    }

    async sendOtp(phone) {
        try {
            const user = await User.findOne({ phone });
            if (!user) {
                throw new Error('User not found');
            }

            const otp = await otpClient.sendOtp(phone);
            console.log(`SMS to ${phone}: Your verification code is: ${otp}`);

            user.otp = otp;
            user.otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
            await user.save();
        } catch (error) {
            throw new Error(`Error sending OTP: ${error.message}`);
        }
    }

    async saveOneSignalId(phone, playerId) {
        try {
            const user = await User.findOne({ phone });
            if (!user) {
                throw new Error('User not found');
            }

            user.oneSignalId = playerId;
            await user.save();

            return { ...user.toObject(), oneSignalId: playerId };
        } catch (error) {
            throw new Error(`Error saving OneSignal ID: ${error.message}`);
        }
    }

    async getHomePageData() {
        try {
            const formDoc = await LandingPageHomepage.findOne({ id: 'homepage' });
            if (!formDoc) throw new Error('Form not found');
            return formDoc.toObject() ?? {};
        } catch (error) {
            throw new Error(`Error getting home page data: ${error.message}`);
        }
    }

    async getPremiumPlans() {
        try {
            const formDoc = await LandingPagePremiumPlans.findOne({ id: 'premiumPlans' });
            if (!formDoc) throw new Error('Form not found');
            return formDoc.toObject() ?? {};
        } catch (error) {
            throw new Error(`Error getting premium plans: ${error.message}`);
        }
    }

    async getContactData() {
        try {
            const formDoc = await LandingPageContact.findOne({ id: 'contact' });
            if (!formDoc) throw new Error('Form not found');
            return formDoc.toObject() ?? {};
        } catch (error) {
            throw new Error(`Error getting contact data: ${error.message}`);
        }
    }

    async getDynamicContent() {
        try {
            const formDoc = await DynamicScreen.findOne({ id: 'screens' });
            if (!formDoc) throw new Error('Form not found');
            return formDoc.toObject() ?? {};
        } catch (error) {
            throw new Error(`Error getting dynamic content: ${error.message}`);
        }
    }

    async forgotPasswordOTP(phone) {
        try {
            const user = await User.findOne({ phone });
            if (!user) {
                throw new Error('User not found');
            }

            const otp = await otpClient.sendOtp(phone);
            console.log(`SMS to ${phone}: Your verification code is: ${otp}`);

            user.otp = otp;
            user.otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
            await user.save();
        } catch (error) {
            throw new Error(`Error sending OTP: ${error.message}`);
        }
    }

    async verifyForgotPasswordOTP(phone, otp) {
        try {
            const user = await User.findOne({ phone });
            if (!user) {
                throw new Error('User not found');
            }
            if (!otp) {
                throw new Error('OTP is required');
            }
            if (user.otp !== otp) {
                throw new Error('Invalid OTP');
            }

            user.otp = null;
            user.otpExpiry = null;
            user.phoneVerified = true;
            await user.save();

            return { ...user.toObject(), phoneVerified: true, verified: true };
        } catch (error) {
            throw new Error(`Error verifying phone: ${error.message}`);
        }
    }

    async newPassword(phone, password) {
        try {
            const user = await User.findOne({ phone });
            if (!user) {
                throw new Error('User not found');
            }
            if (!password) {
                throw new Error('Password is required');
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            user.password = hashedPassword;
            user.otp = null;
            user.otpExpiry = null;
            user.phoneVerified = true;
            await user.save();

            return { ...user.toObject(), phoneVerified: true, verified: true };
        } catch (error) {
            throw new Error(`Error setting new password: ${error.message}`);
        }
    }

    async getEnabledFeatures() {
        try {
            const formDoc = await Metadata.findOne({ id: 'toggleableFeatured' });
            if (!formDoc) throw new Error('Form not found');
            return formDoc.toObject() ?? {};
        } catch (error) {
            throw new Error(`Error getting enabled features: ${error.message}`);
        }
    }

    async getReviews() {
        try {
            const formDoc = await LandingPageReviews.findOne({ id: 'reviews' });
            if (!formDoc) throw new Error('Reviews not found');
            return formDoc.toObject() ?? {};
        } catch (error) {
            throw new Error(`Error getting reviews: ${error.message}`);
        }
    }

}

export default new UserService();
