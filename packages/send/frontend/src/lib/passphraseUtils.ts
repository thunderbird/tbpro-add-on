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

export const parsePassphrase = (passphrase: string) => {
  // Trim leading and trailing spaces
  const trimmed = passphrase.trim();

  // Split by spaces or hyphens, filtering out empty strings
  const words = trimmed.split(/[\s-]+/).filter((word) => word.length > 0);

  // Ensure we have exactly 6 words
  if (words.length !== 6) {
    throw new Error(`Expected 6 words, got ${words.length}`);
  }

  // Join with hyphens
  return words.join('-');
};
