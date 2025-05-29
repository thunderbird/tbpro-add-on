import { isEmailAddressObject } from '@/lib/AddressBook';
import type { EmailMessage } from '@/lib/Messages';

export type FrequencyMap = Map<string, number>;

/**
 * Creates a frequency map from the specified field given an array of `EmailMessage` objects.
 *
 * @template K - A key of `EmailMessage` that refers to a field to be used for the frequency calculation.
 * @param {EmailMessage[]} messages - An array of `EmailMessage` objects from which to build the frequency map.
 * @param {K} [k] - The optional key to extract values from the `EmailMessage`. Defaults to `'author'` if not provided.
 *
 * @returns {Map<string, number>} A frequency map where the keys are email addresses (strings) and the values are the count of occurrences of those addresses.
 *
 * The function handles cases where:
 * - The key `k` points to an `EmailAddress` object or an array of `EmailAddress` objects.
 * - The resulting addresses are used to create a frequency map, which is then ordered by frequency.
 */
export function frequencyMapForMessages<K extends keyof EmailMessage>(
  messages: EmailMessage[],
  k?: K
) {
  const key = k || 'author';

  // Extract the value, filtering out false-y values.
  const values = messages.map((email) => email[key]).filter((val) => !!val);
  let valuesArray: string[] = [];

  // We either have an array of EmailAddress
  // or we have an array of arrays of EmailAddress.
  for (const value of values) {
    if (Array.isArray(value)) {
      valuesArray = (valuesArray as string[]).concat(value.map((v) => v.address));
    } else if (isEmailAddressObject(value)) {
      valuesArray.push(value.address);
    }
  }

  const freqMap = stringArrayToFrequencyMap(valuesArray);
  const orderedMap = orderedFrequencyMap(freqMap);

  return orderedMap;
}

/**
 * Converts an array of strings into a frequency map, where each unique string is a key and its value is the number of occurrences in the array.
 *
 * @param {string[]} array - The array of strings to be converted into a frequency map.
 * @returns {FrequencyMap} A map where the keys are strings and the values are the number of times each string appears in the array.
 */
function stringArrayToFrequencyMap(array: string[]): FrequencyMap {
  const table: FrequencyMap = new Map();
  for (const str of array) {
    table.set(str, (table.get(str) ?? 0) + 1);
  }
  return table;
}

/**
 * Produces a FrequencyMap ordered by the number value.
 *
 * @param {FrequencyMap} map - A FrequencyMap.
 * @returns {FrequencyMap} A map ordered by frequency.
 */
function orderedFrequencyMap(map: FrequencyMap): FrequencyMap {
  // Convert the map to an array of [key, value] pairs
  const entries = Array.from(map.entries());

  // Sort the array by the frequency (the number value of each pair)
  const sortedEntries = entries.sort(([, valueA], [, valueB]) => valueB - valueA);

  // Convert the sorted array back into a map
  return new Map(sortedEntries);
}
