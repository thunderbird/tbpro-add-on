import { UserTier } from '@prisma/client';

const ONE_KB_IN_BYTES = 1024;
const ONE_MB_IN_BYTES = ONE_KB_IN_BYTES * 1024;
const ONE_GB_IN_BYTES = ONE_MB_IN_BYTES * 1024;

const LIMITS = {
  // We default to free tier unless specified otherwise
  [UserTier.FREE]: ONE_GB_IN_BYTES * 300,
  // Other tiers (only used for testing)
  [UserTier.EPHEMERAL]:
    // We set this value using an env variable so we can test easily
    ONE_MB_IN_BYTES * (Number(process.env.EPHIMERAL_TIER_LIMIT_MB) || 5),
};

export const getStorageLimitForTier = (tier: UserTier): number => {
  if (!LIMITS[tier]) {
    return LIMITS[UserTier.FREE];
  }
  return LIMITS[tier];
};
