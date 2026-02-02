import { type Address, isAddress, parseEther, formatEther } from 'viem';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface PredictionValidationInput {
  title: string;
  description: string;
  creator: Address;
  stakeAmount: bigint;
  resolveAt: number;
  resolutionSource?: string;
}

// Validation constants
const VALIDATION_LIMITS = {
  MIN_TITLE_LENGTH: 10,
  MAX_TITLE_LENGTH: 280,
  MIN_DESCRIPTION_LENGTH: 20,
  MAX_DESCRIPTION_LENGTH: 5000,
  MIN_STAKE: parseEther('0.001'),
  MAX_STAKE: parseEther('1000'),
  MIN_RESOLUTION_TIME_HOURS: 1,
  MAX_RESOLUTION_TIME_DAYS: 365,
};

/**
 * Validates a prediction before creation
 */
export function validatePrediction(
  input: PredictionValidationInput
): ValidationResult {
  const errors: string[] = [];

  // Validate title
  if (!input.title || input.title.trim().length === 0) {
    errors.push('Title is required');
  } else if (input.title.length < VALIDATION_LIMITS.MIN_TITLE_LENGTH) {
    errors.push(
      `Title must be at least ${VALIDATION_LIMITS.MIN_TITLE_LENGTH} characters`
    );
  } else if (input.title.length > VALIDATION_LIMITS.MAX_TITLE_LENGTH) {
    errors.push(
      `Title must not exceed ${VALIDATION_LIMITS.MAX_TITLE_LENGTH} characters`
    );
  }

  // Validate description
  if (!input.description || input.description.trim().length === 0) {
    errors.push('Description is required');
  } else if (input.description.length < VALIDATION_LIMITS.MIN_DESCRIPTION_LENGTH) {
    errors.push(
      `Description must be at least ${VALIDATION_LIMITS.MIN_DESCRIPTION_LENGTH} characters`
    );
  } else if (input.description.length > VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH) {
    errors.push(
      `Description must not exceed ${VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH} characters`
    );
  }

  // Validate creator address
  if (!input.creator) {
    errors.push('Creator address is required');
  } else if (!isAddress(input.creator)) {
    errors.push('Invalid creator address format');
  }

  // Validate stake amount
  if (input.stakeAmount === undefined || input.stakeAmount === null) {
    errors.push('Stake amount is required');
  } else if (input.stakeAmount <= 0n) {
    errors.push('Stake amount must be greater than 0');
  } else if (input.stakeAmount < VALIDATION_LIMITS.MIN_STAKE) {
    errors.push(
      `Stake amount must be at least ${formatEther(VALIDATION_LIMITS.MIN_STAKE)} ETH`
    );
  } else if (input.stakeAmount > VALIDATION_LIMITS.MAX_STAKE) {
    errors.push(
      `Stake amount must not exceed ${formatEther(VALIDATION_LIMITS.MAX_STAKE)} ETH`
    );
  }

  // Validate resolution time
  const now = Math.floor(Date.now() / 1000);
  const minResolveAt = now + VALIDATION_LIMITS.MIN_RESOLUTION_TIME_HOURS * 3600;
  const maxResolveAt = now + VALIDATION_LIMITS.MAX_RESOLUTION_TIME_DAYS * 86400;

  if (!input.resolveAt) {
    errors.push('Resolution time is required');
  } else if (input.resolveAt <= now) {
    errors.push('Resolution time must be in the future');
  } else if (input.resolveAt < minResolveAt) {
    errors.push(
      `Resolution time must be at least ${VALIDATION_LIMITS.MIN_RESOLUTION_TIME_HOURS} hour(s) from now`
    );
  } else if (input.resolveAt > maxResolveAt) {
    errors.push(
      `Resolution time must not exceed ${VALIDATION_LIMITS.MAX_RESOLUTION_TIME_DAYS} days from now`
    );
  }

  // Validate resolution source (optional but validated if provided)
  if (input.resolutionSource) {
    try {
      const url = new URL(input.resolutionSource);
      if (!['http:', 'https:'].includes(url.protocol)) {
        errors.push('Resolution source must use HTTP or HTTPS protocol');
      }
    } catch {
      errors.push('Invalid resolution source URL');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates prediction outcome resolution
 */
export function validateResolution(
  predictionStatus: string,
  outcome: string
): ValidationResult {
  const errors: string[] = [];

  if (predictionStatus !== 'active') {
    errors.push('Only active predictions can be resolved');
  }

  const validOutcomes = ['yes', 'no', 'cancelled'];
  if (!validOutcomes.includes(outcome)) {
    errors.push(`Invalid outcome. Must be one of: ${validOutcomes.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a stake amount for an existing prediction
 */
export function validateStake(
  amount: bigint,
  userBalance: bigint,
  predictionMinStake: bigint,
  predictionMaxStake?: bigint
): ValidationResult {
  const errors: string[] = [];

  if (amount <= 0n) {
    errors.push('Stake amount must be greater than 0');
  }

  if (amount > userBalance) {
    errors.push('Insufficient balance for stake');
  }

  if (amount < predictionMinStake) {
    errors.push(`Stake must be at least ${formatEther(predictionMinStake)} ETH`);
  }

  if (predictionMaxStake && amount > predictionMaxStake) {
    errors.push(`Stake must not exceed ${formatEther(predictionMaxStake)} ETH`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates Ethereum address
 */
export function validateAddress(address: string): ValidationResult {
  const errors: string[] = [];

  if (!address) {
    errors.push('Address is required');
  } else if (!isAddress(address)) {
    errors.push('Invalid Ethereum address format');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Checks if a prediction is expired
 */
export function isPredictionExpired(resolveAt: number): boolean {
  return Math.floor(Date.now() / 1000) > resolveAt;
}

/**
 * Gets time remaining until prediction resolution
 */
export function getTimeUntilResolution(resolveAt: number): {
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
} {
  const now = Math.floor(Date.now() / 1000);
  const diff = resolveAt - now;

  if (diff <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0 };
  }

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);

  return { expired: false, days, hours, minutes };
}

/**
 * Sanitizes prediction text content
 */
export function sanitizeContent(content: string): string {
  return content
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .slice(0, VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH);
}
