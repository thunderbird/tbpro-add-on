import { downloadTxt } from './filesync';

export const downloadPassPhrase = async (
  passphraseFromLocalStorage: string,
  email: string
) => {
  const isTbproExtension = navigator.userAgent.includes('Thunderbird');
  if (!isTbproExtension) {
    window.open('/passphrase?print=true', '_blank')?.focus();
  } else {
    const words = passphraseFromLocalStorage.split(' ');
    await downloadTxt(words.join(' - '), `tb-send-passphrase-${email}-key.txt`);
  }
};
