import type { ValidationResult } from '@/routes/analysis/utils/types';

export function validateAnalysisParams(params: {
  start_date?: string;
  end_date?: string;
  customer_code?: string;
  product_model?: string;
}): ValidationResult {
  const { start_date, end_date } = params;
  if (!start_date || !end_date) {
    return {
      isValid: false,
      error: 'The start date and end date cannot be left blank',
    };
  }
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(start_date) || !dateRegex.test(end_date)) {
    return {
      isValid: false,
      error: 'Invalid date format. Please use the YYYY-MM-DD format.',
    };
  }
  if (new Date(start_date) > new Date(end_date)) {
    return {
      isValid: false,
      error: 'The start date cannot be later than the end date.',
    };
  }
  return { isValid: true };
}

/**
 * Verify fundamental analysis parameters (only the time interval is required)
 */
export function validateBasicParams(params: {
  start_date?: string;
  end_date?: string;
}): ValidationResult {
  const { start_date, end_date } = params;
  if (!start_date || !end_date) {
    return {
      isValid: false,
      error: 'The start date and end date cannot be left blank.',
    };
  }
  return { isValid: true };
}
