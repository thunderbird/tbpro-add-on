import { downloadTxt } from './filesync';

export const downloadPassPhrase = async (
  passphraseFromLocalStorage: string,
  email: string
) => {
  const words = passphraseFromLocalStorage.split(' ');
  await downloadTxt(words.join(' - '), `tb-send-passphrase-${email}-key.txt`);
};
