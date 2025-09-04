import dotenv from 'dotenv';
dotenv.config();

export const ID_FOR_PROD = `"id": "tbpro-addon@thunderbird.net"`;
export const ID_FOR_STAGE = ` "id": "tbpro-addon-stage@thunderbird.net"`;

export const NAME_FOR_PROD = `"name": "Tbpro Addon"`;
export const NAME_FOR_STAGE = `"name": "Tbpro Addon [STAGE]"`;

export const PACKAGE_NAME = {
  production: 'tbpro-addon',
  stage: 'tbpro-addon-stage',
};

export const getIsEnvProd = () => {
  return process.env.BASE_URL.includes('https://send.tb.pro') || false;
};
