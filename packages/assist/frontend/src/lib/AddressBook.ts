export type EmailAddress = {
  name: string;
  address: string;
};

/**
 * Determines whether `val` is of type `EmailAddress`
 */
export function isEmailAddressObject(val: any): val is EmailAddress {
  return (
    typeof val === 'object' &&
    val !== null &&
    typeof val.name === 'string' &&
    typeof val.address === 'string'
  );
}
export async function getAddressBookEmailArray(): Promise<Set<string>> {
  let emailArray: string[] = [];
  const addressBooks = await messenger.addressBooks.list(true);
  for (const book of addressBooks) {
    const contacts = book.contacts;
    if (contacts) {
      const emails = contacts
        .map((contact) => {
          const email = contact.properties.PrimaryEmail;
          if (!email) {
            return null;
          }
          return email.trim().toLocaleLowerCase();
        })
        .filter((email) => !!email);
      emailArray = emailArray.concat(emails as string[]);
    }
  }
  return new Set(emailArray);
}

// Handles emails in the form of "firstname lastname <someone@address.com>"
export function parseEmailAddress(formattedAddress: string): EmailAddress {
  const address = {
    name: '',
    address: '',
  };
  const leftBracketIndex = formattedAddress.lastIndexOf('<');
  const rightBracketIndex = formattedAddress.lastIndexOf('>');

  if (leftBracketIndex >= 0 && rightBracketIndex > leftBracketIndex) {
    address.name = formattedAddress.substring(0, leftBracketIndex);
    address.address = formattedAddress
      .substring(leftBracketIndex + 1, rightBracketIndex)
      .toLowerCase();
  } else {
    const email = formattedAddress
      .toLowerCase()
      .match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi);
    address.address = email ? email[0] : '';
    if (address.address.length === 0) {
      console.error(`Blank email address from ${formattedAddress}`);
    }
  }
  return address;
}
