export const MAX_MANUAL_SAVES = 16;

export class ManualSaveLimitError extends Error {
  constructor() { super(`Manual save limit reached (${MAX_MANUAL_SAVES}). Delete a save to create another.`); }
}
