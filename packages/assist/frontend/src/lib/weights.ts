export const CONTACT_WEIGHTS = {
  CONTACT_IN_ADDRESSBOOK: 3,
  CONTACT_IN_SENT: 2,
  CONTACT_IN_JUNK: 3,
};

export const FREQUENCY_LABELS = {
  HIGH: 'HIGH',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
};

export const FREQUENCY_THRESHOLDS: Record<string, number> = {
  HIGH: 50,
  MEDIUM: 20,
  LOW: 10,
};

export const FREQUENCY_WEIGHTS: Record<string, number> = {
  HIGH: 5,
  MEDIUM: 3,
  LOW: 2,
};
