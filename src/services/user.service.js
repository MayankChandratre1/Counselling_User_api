import { db } from '../../config/firebase.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import redis from '../config/redisClient.js';
import otpClient from '../utils/otpClient.js';
import axios from 'axios';

class UserService {
  constructor() {
    this.collection = db.collection('users');
    this.formCollection = db.collection('counsellingForms');
    this.registrationForm = db.collection('registrationForm');
    this.landingPage = db.collection('landingPage');
    this.dynamicScreens = db.collection('dynamicScreens');
    this.metadata = db.collection('metadata');
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
      this.sendOneSignalNotification(playerId, title, body, notification);
      return {notification };
    } catch (error) {
      throw new Error(`Error sending push notification: ${error.message}`);
    }
  }

  async createUser(userData) {
    try {
      const user = {
        name: userData.name,
        phone: userData.phone,
        isPremium: false,
        createdAt: new Date(),
        premiumPlan: null,
        hasLoggedIn: true
      };
      const snapshot = await this.collection.where('phone', '==', user.phone).get();
      if (!snapshot.empty) {
        throw new Error('User With this phone number already exists');
      }
      const docRef = await this.collection.add(user);
      return { id: docRef.id, ...user };
    } catch (error) {
      throw new Error(`Error creating user: ${error.message}`);
    }
  }

  async sendOTPForPremiumLogin(phone) {
    try {
      const snapshot = await this.collection
        .where("phone", "==", phone.toString())
        .get();
        
      if (snapshot.empty) {
        throw new Error('User not found');
      }
      
      const doc = snapshot.docs[0];
      const userData = doc.data();
      
      if (userData.isPremium) {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = new Date();
        otpExpiry.setMinutes(otpExpiry.getMinutes() + 5);
        
        await this.collection.doc(doc.id).update({
          otp,
          otpExpiry
        });
        
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
      const snapshot = await this.collection
        .where("phone", "==", phone.toString())
        .get();

        
      if (snapshot.empty) {
        //create a new user
        const user = {
          name: phone,
          phone: phone,
          isPremium: false,
          createdAt: new Date(),
          premiumPlan: null,
          hasLoggedIn: true,
          currentDeviceId: deviceId,
          firstLogin: true,
          batch:'online'
        };

        const otp = await otpClient.sendOtp(phone);
        console.log(`SMS to ${phone}: Your verification code is: ${otp}`);

        
        const docRef = await this.collection.add({
          ...user,
          otp: otp,
          otpExpiry: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes expiry
        });
        const addUserList = await this.metadata.doc('allUserIdLists').get();
        
        if(addUserList){
          const data = addUserList.data();
          if(data && data.userIdList){
            const userIdList = data.userIdList;
            userIdList.push(docRef.id);
            await this.metadata.doc('allUserIdLists').update({
              userIdList: userIdList
            });
          }else{
            await this.metadata.doc('allUserIdLists').set({
              userIdList: [docRef.id]
            });
          }
        }
        return { id: docRef.id, ...user, firstLogin: true };
      }
      
      const doc = snapshot.docs[0];
      const userData = doc.data();
      

      if (userData.hasLoggedIn) {
          if ( userData.currentDeviceId && userData.currentDeviceId !== deviceId)
          throw new Error('User already logged in on another device');
      }

      const otp = await otpClient.sendOtp(phone);
      console.log(`SMS to ${phone}: Your verification code is: ${otp}`);

       await this.collection.doc(doc.id).update({
          currentDeviceId: deviceId,
          hasLoggedIn: true,
          otp: otp,
          otpExpiry: new Date(Date.now() + 5 * 60 * 1000)
        });

      const token = jwt.sign({ id: doc.id, phone }, process.env.USER_JWT);
      
      return { id: doc.id, ...userData, token };
    } catch (error) {
      throw new Error(`Error during login: ${error.message}`);
    }
  }

  async logout(userId) {
    try {
      await this.collection.doc(userId).update({
        hasLoggedIn: false
      });
    } catch (error) {
      throw new Error(`Error during logout: ${error.message}`);
    }
  }
  
  async getUserById(id) {
    try {
      const doc = await this.collection.doc(id).get();
      if (!doc.exists) {
        throw new Error('User not found');
      }
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      throw new Error(`Error getting user: ${error.message}`);
    }
  }
  async getUserByPhone(phone) {
    try {
      
      const snapshot = await this.collection.where('phone', '==', phone).get();
      if (snapshot.empty) {
        throw new Error('User not found');
      }
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
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

      await this.collection.doc(userId).update({
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
      await this.collection.doc(userId).update({
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
      const expiryDate = user.premiumPlan.expiryDate.toDate();

      if (expiryDate < now) {
        await this.collection.doc(userId).update({
          isPremium: false
        });
        return this.getUserById(userId);
      }

      return user;
    } catch (error) {
      throw new Error(`Error checking premium status: ${error.message}`);
    }
  }
  async checkPremiumStatusByPhone(phone) {
    try {
      const user = await this.collection.where('phone', '==', phone).get();
      
      if (user.empty) {
        return {
          isPremium: false
        }
      }
      const doc = user.docs[0];
      const data = {id: doc.id, ...doc.data()};

      if (!data) {
        return {
          isPremium: false
        }
      }

      if (!data.premiumPlan) return {
        isPremium: false
      };

      console.log(data.premiumPlan);
      

      const now = new Date();
      const expiryDate = data.premiumPlan.expiryDate.toDate();

      

      if (expiryDate < now) {
        await this.collection.doc(data.id).update({
          isPremium: false
        });
        return {
          isPremium: false
        };
      }

      return {
        isPremium: true,
        plan: data.premiumPlan
      };
    } catch (error) {
      throw new Error(`Error checking premium status: ${error.message}`);
    }
  }

  async createFormSteps(formData) {
    try {
      const form = {
        steps: formData.steps.map(step => ({
          number: step.number,
          title: step.title,
          status: step.status || null
        }))
      };
      const docRef = await this.formCollection.add(form);
      return { id: docRef.id, ...form };
    } catch (error) {
      throw new Error(`Error creating form steps: ${error.message}`);
    }
  }

  async getFormSteps() {
    try {
      const snapshot = await this.formCollection.get();
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      throw new Error(`Error getting form steps: ${error.message}`);
    }
  }

  async getFormStepsById(formId) {
    try {
      const doc = await this.formCollection.doc(formId).get();
      if (!doc.exists) {
        throw new Error('Form not found');
      }
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      throw new Error(`Error getting form steps: ${error.message}`);
    }
  }

  async updateFormSteps(formId, updateData) {
    try {
      await this.formCollection.doc(formId).update({
        steps: updateData.steps
      });
      return this.getFormStepsById(formId);
    } catch (error) {
      throw new Error(`Error updating form steps: ${error.message}`);
    }
  }

  async deleteFormSteps(formId) {
    try {
      await this.formCollection.doc(formId).delete();
      return { id: formId, message: 'Form deleted successfully' };
    } catch (error) {
      throw new Error(`Error deleting form steps: ${error.message}`);
    }
  }

  async setUserFormData(phone, formSteps) {
    try {
      const user = await this.getUserByPhone(phone);
      if (!user) throw new Error('User not found');

      // Get generic form data
      const formDoc = await this.formCollection.doc(formSteps.id).get();
      if (!formDoc.exists) throw new Error('Form template not found');

      const genericForm = formDoc.data();
      
      // Merge generic steps with user data
      const mergedSteps = genericForm.steps.map(genericStep => {
        const userStep = formSteps.steps.find(s => s.number === genericStep.number);
        return {
          ...genericStep,
          data: userStep?.data || null,
          status: userStep?.status || genericStep.status || null
        };
      });

      // Update user's stepsData
      await this.collection.doc(user.id).update({
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
      const user = await this.getUserByPhone(phone);
      if (!user) throw new Error('User not found');

      // Get generic form data
      const formDoc = await this.formCollection.doc(formId).get();
      if (!formDoc.exists) throw new Error('Form template not found');

      const genericForm = formDoc.data();
      const userData = user.stepsData;

      if (!userData || userData.id !== formId) {
        return { id: formId, steps: genericForm.steps };
      }

      // Merge generic form with user data
      const mergedSteps = genericForm.steps.map(genericStep => {
        const userStep = userData.steps.find(s => s.number === genericStep.number);
        console.log( {
          ...genericStep,
          data: userStep?.data || null,
          status: userStep?.status || genericStep.status || null,
          ...userStep
        });
        
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
      const user = await this.getUserByPhone(phone);
      if (!user) throw new Error('User not found');

      // Get generic form data to validate step numbers
      const formDoc = await this.formCollection.doc(formId).get();
      if (!formDoc.exists) throw new Error('Form template not found');
      
      const genericForm = formDoc.data();
      
      // Convert step numbers to numbers and validate
      const validStepNumbers = new Set(genericForm.steps.map(s => s.number));
      const processedSteps = updatedSteps.map(step => ({
        ...step,
        number: parseInt(step.number) // Convert to number
      }));
      
      const invalidSteps = processedSteps.filter(s => !validStepNumbers.has(s.number));
      if (invalidSteps.length > 0) {
        throw new Error(`Invalid step numbers: ${invalidSteps.map(s => s.number).join(', ')}`);
      }

      // Get current user form data or initialize if doesn't exist
      const currentUserData = user.stepsData?.id === formId ? 
        user.stepsData : 
        { id: formId, steps: genericForm.steps };

      // Update only user-specific fields (status and remark) for provided steps
      const mergedSteps = currentUserData.steps.map(currentStep => {
        const updatedStep = processedSteps.find(s => s.number === currentStep.number);
        if (!updatedStep) return currentStep;

        return {
          ...currentStep,
          ...updatedStep,
          number: currentStep.number, 
          status: updatedStep.status || null,
          remark: updatedStep.remark || null // Add remark field
        };
      });

      const mergedSteps2 = genericForm.steps.map(step => {
        const currentStep = currentUserData.steps.find(s => s.number === step.number);
        if(!currentStep) return step;
        const updatedStep = processedSteps.find(s => s.number === currentStep.number);
        if (!updatedStep) return currentStep;

        return {
          ...currentStep,
          ...updatedStep,
          status: updatedStep.status || null,
          remark: updatedStep.remark || null // Add remark field
        };
      });

      // Update user's stepsData with clean data
      const updateData = {
        stepsData: {
          id: formId,
          steps: mergedSteps2
        }
      };

      console.dir(mergedSteps2, {depth: null});
      

      await this.collection.doc(user.id).update(updateData);
      return { id: formId, steps: mergedSteps };
    } catch (error) {
      console.log(error);
      throw new Error(`Error updating user form data: ${error.message}`);
    }
  }

  async getUserLists(id) {
    try {
      const user = await this.getUserById(id);
      if (!user) throw new Error('User not found');
      return user.lists ?? []
    } catch (error) {
      throw new Error(`Error getting form steps: ${error.message}`);
    }
  }

  async getRegistrationForm(userId) {
    try {      
      const user = await this.getUserById(userId);
      const formDoc = await this.registrationForm.doc('Form1').get();
      const formData = formDoc.data();
      if (!formData) throw new Error('Form not found');

      const form = {
        userData : user.counsellingData,
        formData: formData,
      }

      return form?? {}
    } catch (error) {
      throw new Error(`Error getting registration form: ${error.message}`);
    }
  }

  async getLandingPageData() {
    try {      
      const formDoc = await this.landingPage.doc('landingPage').get();
      const formData = formDoc.data();
      if (!formData) throw new Error('Form not found');
      return formData?? {}
    } catch (error) {
      throw new Error(`Error getting landing page data: ${error.message}`);
    }
  }

  async updateName(phone, name, email) {
    try {
      const docRef = await this.collection.where("phone","==",phone).get();
      if (docRef.empty) {
        throw new Error('User not found');
      }
      const doc = docRef.docs[0];
      const userData = doc.data();
      if (!name) {
        throw new Error('Name is required');
      }
      await this.collection.doc(doc.id).update({
        name: name,
        email: email,
        hasLoggedIn: true,
        firstLogin: false
      });
      await this.invalidateCache(`user:${doc.id}`);
      const token = jwt.sign({ id: doc.id, phone }, process.env.USER_JWT);
      return { id: doc.id, ...userData,name, token };
    } catch (error) {
      throw new Error(`Error updating user name: ${error.message}`);
    }
  }

  async invalidateCache(pattern) {
    if (!redis) {
      return;
    }

    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
        await redis.del(keys);
    }
}

  async verifyPhone(phone, otp) {
    try {
      const docRef = await this.collection.where("phone","==",phone).get();
      if (docRef.empty) {
        throw new Error('User not found');
      }
      const doc = docRef.docs[0];
      const userData = doc.data();
      if (!otp) {
        throw new Error('OTP is required');
      }
      if (userData.otp !== otp) {
        throw new Error('Invalid OTP');
      }
      let firstLogin = false;
      if(userData.firstLogin){
        firstLogin = true;
      }
      await this.collection.doc(doc.id).update({
        hasLoggedIn: true,
        otp: null,
        otpExpiry: null,
        firstLogin: false,
        phoneVerified:true
      });
      await this.invalidateCache(`user:${doc.id}`);
      return { id: doc.id, ...userData, phoneVerified:true, verified:true, firstLogin  };
    } catch (error) {
      throw new Error(`Error verifying phone: ${error.message}`);
    }
  }

  async sendOtp(phone){
    try {
      const docRef = await this.collection.where("phone","==",phone).get();
      if (docRef.empty) {
        throw new Error('User not found');
      }
      const doc = docRef.docs[0];
      const userData = doc.data();
      if (!userData) {
        throw new Error('User not found');
      }
      const otp = await otpClient.sendOtp(phone);
      console.log(`SMS to ${phone}: Your verification code is: ${otp}`);
      await this.collection.doc(doc.id).update({
        otp: otp,
        otpExpiry: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes expiry
      });
    } catch (error) {
      throw new Error(`Error sending OTP: ${error.message}`);
    }
  }

  async saveOneSignalId(phone, playerId) {
    try {
      const docRef = await this.collection.where("phone","==",phone).get();
      if (docRef.empty) {
        throw new Error('User not found');
      }
      const doc = docRef.docs[0];
      await this.collection.doc(doc.id).update({
        oneSignalId: playerId
      });
      return { id: doc.id, ...doc.data(), oneSignalId: playerId };
    } catch (error) {
      throw new Error(`Error saving OneSignal ID: ${error.message}`);
    }
  }

  async getHomePageData() {
    try {      
      const formDoc = await this.landingPage.doc('homepage').get();
      const formData = formDoc.data();
      if (!formData) throw new Error('Form not found');
      return formData?? {}
    } catch (error) {
      throw new Error(`Error getting home page data: ${error.message}`);
    }
  }

  async getPremiumPlans() {
    try {      
      const formDoc = await this.landingPage.doc('premiumPlans').get();
      const formData = formDoc.data();
      if (!formData) throw new Error('Form not found');
      return formData?? {}
    } catch (error) {
      throw new Error(`Error getting premium plans: ${error.message}`);
    }
  }
  
  async getContactData() {
    try {      
      const formDoc = await this.landingPage.doc('contact').get();
      const formData = formDoc.data();
      if (!formData) throw new Error('Form not found');
      return formData?? {}
    } catch (error) {
      throw new Error(`Error getting contact data: ${error.message}`);
    }
  }
  async getDynamicContent() {
    try {      
      const formDoc = await this.dynamicScreens.doc('screens').get();
      const formData = formDoc.data();
      if (!formData) throw new Error('Form not found');
      return formData?? {}
    } catch (error) {
      throw new Error(`Error getting dynamic content: ${error.message}`);
    }
  }

  async forgotPasswordOTP(phone) {
    try {
      const docRef = await this.collection.where("phone","==",phone).get();
      if (docRef.empty) {
        throw new Error('User not found');
      }
      const doc = docRef.docs[0];
      const userData = doc.data();
      if (!userData) {
        throw new Error('User not found');
      }
      const otp = await otpClient.sendOtp(phone);
      console.log(`SMS to ${phone}: Your verification code is: ${otp}`);
      await this.collection.doc(doc.id).update({
        otp: otp,
        otpExpiry: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes expiry
      });
    } catch (error) {
      throw new Error(`Error sending OTP: ${error.message}`);
    }
  }

  async verifyForgotPasswordOTP(phone, otp) {
    try {
      const docRef = await this.collection.where("phone","==",phone).get();
      if (docRef.empty) {
        throw new Error('User not found');
      }
      const doc = docRef.docs[0];
      const userData = doc.data();
      if (!userData) {
        throw new Error('User not found');
      }
      if (!otp) {
        throw new Error('OTP is required');
      }
      if (userData.otp !== otp) {
        throw new Error('Invalid OTP');
      }
      await this.collection.doc(doc.id).update({
        otp: null,
        otpExpiry: null,
        phoneVerified:true
      });
      return { id: doc.id, ...userData, phoneVerified:true, verified:true };
    } catch (error) {
      throw new Error(`Error verifying phone: ${error.message}`);
    }
  }

  async newPassword(phone, password) {
    try {
      const docRef = await this.collection.where("phone","==",phone).get();
      if (docRef.empty) {
        throw new Error('User not found');
      }
      const doc = docRef.docs[0];
      const userData = doc.data();
      if (!userData) {
        throw new Error('User not found');
      }
      if (!password) {
        throw new Error('Password is required');
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      await this.collection.doc(doc.id).update({
        password: hashedPassword,
        otp: null,
        otpExpiry: null,
        phoneVerified:true
      });
      return { id: doc.id, ...userData, phoneVerified:true, verified:true };
    } catch (error) {
      throw new Error(`Error verifying phone: ${error.message}`);
    }
  }

  async getEnabledFeatures() {
    try {      
      const formDoc = await this.metadata.doc('toggleableFeatured').get();
      const formData = formDoc.data();
      if (!formData) throw new Error('Form not found');
      return formData?? {}
    } catch (error) {
      throw new Error(`Error getting enabled features: ${error.message}`);
    }
  }



}

export default new UserService();