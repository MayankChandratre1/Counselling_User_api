import mongoose from 'mongoose';
import {
    UserSchema,
    CounsellingFormSchema,
    RegistrationFormSchema,
    LandingPageContactSchema,
    LandingPageHomepageSchema,
    LandingPagePremiumPlansSchema,
    DynamicScreenSchema,
    MetadataSchema,
    PaymentLogSchema,
    UserListSchema,
    MasterListSchema,
    LandingPageReviewsSchema
} from './SchemasV3.js';

export const User = mongoose.models.User || mongoose.model('User', UserSchema, 'users');
export const CounsellingForm = mongoose.models.CounsellingForm || mongoose.model('CounsellingForm', CounsellingFormSchema, 'counsellingforms');
export const RegistrationForm = mongoose.models.RegistrationForm || mongoose.model('RegistrationForm', RegistrationFormSchema, 'registrationforms');

export const LandingPageContact = mongoose.models.LandingPageContact || mongoose.model('LandingPageContact', LandingPageContactSchema, 'landingpagecontacts');
export const LandingPageHomepage = mongoose.models.LandingPageHomepage || mongoose.model('LandingPageHomepage', LandingPageHomepageSchema, 'landingpagehomepages');
export const LandingPagePremiumPlans = mongoose.models.LandingPagePremiumPlans || mongoose.model('LandingPagePremiumPlans', LandingPagePremiumPlansSchema, 'landingpagepremiumplans');

export const DynamicScreen = mongoose.models.DynamicScreen || mongoose.model('DynamicScreen', DynamicScreenSchema, 'dynamicscreens');
export const Metadata = mongoose.models.Metadata || mongoose.model('Metadata', MetadataSchema, 'metadata');
export const PaymentLog = mongoose.models.PaymentLog || mongoose.model('PaymentLog', PaymentLogSchema, 'paymentlogs');
export const UserList = mongoose.models.UserList || mongoose.model('UserList', UserListSchema, 'userlists');
export const MasterList = mongoose.models.MasterList || mongoose.model('MasterList', MasterListSchema, 'masterlists');
export const LandingPageReviews = mongoose.models.LandingPageReviews || mongoose.model('LandingPageReviews', LandingPageReviewsSchema, 'landingpagereviews');
