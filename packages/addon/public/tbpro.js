const btnSignIn = document.querySelector('#signin');

btnSignIn.addEventListener('click', (event) => {
  event.preventDefault();

  console.log(`You clicked sign in, and tbpro.js is handling it.`)

  browser.runtime.sendMessage({
    type: 'SIGN_IN',
  });

  window.close();
});
