export const PHRASE_SIZE = 6;
export const BASE_URL = import.meta.env.VITE_SEND_CLIENT_URL;
const IS_PROD = BASE_URL.includes('send.tb.pro');

export const DASHBOARD_URL = 'https://accounts.tb.pro/send/dashboard';
export const SUPPORT_URL = 'https://support.tb.pro';
export const PRIVACY_POLICY_URL = 'https://tb.pro/privacy';
export const THUNDERMAIL_URL = `https://accounts${!IS_PROD ? '-stage' : ''}.tb.pro/mail`;
export const APPOINTMENT_URL = `https://accounts${!IS_PROD ? '-stage' : ''}.tb.pro/appointment`;
export const ACCOUNTS_URL = `https://accounts${!IS_PROD ? '-stage' : ''}.tb.pro`;
export const CONTACT_FORM_URL = 'https://accounts.tb.pro/contact';
export const TERMS_OF_SERVICE_URL = 'https://tb.pro/terms';
