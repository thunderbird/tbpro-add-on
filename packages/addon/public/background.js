// Creates three different accounts using different sample configurations.

// Sample AccountConfig for Gmail IMAP account
// const sampleAccountConfig = {
//     incoming: {
//         type: "imap",
//         hostname: "imap.gmail.com",
//         port: 993,
//         username: "testuser@gmail.com",
//         password: "your-app-password", // Use App Password for Gmail
//         socketType: 3, // SSL
//         auth: 10 // OAuth2 (or use 3 for plain text if using App Password)
//     },
//     outgoing: {
//         type: "smtp",
//         hostname: "smtp.gmail.com",
//         port: 587,
//         username: "testuser@gmail.com",
//         password: "your-app-password",
//         socketType: 2, // STARTTLS
//         auth: 10, // OAuth2 (or use 3 for plain text if using App Password)
//         addThisServer: true // Required: tells TB to create a new SMTP server
//     },
//     identity: {
//         realname: "Test User",
//         emailAddress: "testuser@gmail.com"
//     },
//     displayName: "Gmail Test Account"
// };

// browser.MailAccounts.createAccount(sampleAccountConfig).then(result => {
//     console.log(`Sample Gmail Account:`)
//     console.log(result);
// })

// Alternative sample for a generic IMAP provider
// const genericIMAPConfig = {
//     incoming: {
//         type: "imap",
//         hostname: "mail.example.com",
//         port: 993,
//         username: "user@example.com",
//         password: "userpassword",
//         socketType: 3, // SSL
//         auth: 3 // Plain text authentication
//     },
//     outgoing: {
//         type: "smtp",
//         hostname: "smtp.example.com",
//         port: 587,
//         username: "user@example.com",
//         password: "userpassword",
//         socketType: 2, // STARTTLS
//         auth: 3, // Plain text authentication
//         addThisServer: true // Required: tells TB to create a new SMTP server
//     },
//     identity: {
//         realname: "John Doe",
//         emailAddress: "user@example.com"
//     },
//     displayName: "Work Email"
// };

// browser.MailAccounts.createAccount(genericIMAPConfig).then(result => {
//     console.log(`Generic IMAP Account:`)
//     console.log(result);
// })

// Sample using existing SMTP server (common in corporate environments)
const reuseSmtpConfig = {
  incoming: {
    type: 'imap',
    hostname: 'imap.company.com',
    port: 993,
    username: 'example@tb.pro',
    password: 'employee-password',
    socketType: 3, // SSL
    auth: 3, // Plain text
  },
  outgoing: {
    useGlobalPreferredServer: true, // This will use the existing default SMTP server
  },
  identity: {
    realname: 'Employee Name',
    emailAddress: 'example@tb.pro',
  },
  displayName: 'Company Email',
};

