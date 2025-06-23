/* This utility helps us serialize bigint numbers used by prisma but not serialized correctly by default */

// BigInt JSON serialization support
declare global {
  interface BigInt {
    toJSON(): number;
  }
}

BigInt.prototype.toJSON = function () {
  return Number(this);
};

// Export to make this an external module
export {};
