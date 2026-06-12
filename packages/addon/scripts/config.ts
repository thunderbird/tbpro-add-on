import dotenv from 'dotenv';
import { ADDON_ID_PROD, ADDON_ID_STAGE } from '../src/addonIds';
dotenv.config();

export const ID_FOR_PROD = `"id": "${ADDON_ID_PROD}"`;
export const ID_FOR_STAGE = ` "id": "${ADDON_ID_STAGE}"`;

export const NAME_FOR_PROD = `"name": "__MSG_thunderbirdPro__"`;
export const NAME_FOR_STAGE = `"name": "Thunderbird Pro [STAGE]"`;

export const PACKAGE_NAME = {
  production: 'tbpro-addon',
  stage: 'tbpro-addon-stage',
};

export const getIsEnvProd = () => {
  return process.env.BASE_URL.includes('https://send.tb.pro') || false;
};
