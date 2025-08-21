/* 
  TODO: We have to replace send for lockbox because fxa isn't enabled for send
  We should remove this and return the actual url once fxa is enabled 
  https://github.com/thunderbird/send-suite/issues/216
*/
export const formatLoginURL = (url: string) => {
  if (url.includes('localhost')) {
    return url;
  }
  return url.replace('%2Flockbox%2Ffxa', '%2Ffxa');
};
