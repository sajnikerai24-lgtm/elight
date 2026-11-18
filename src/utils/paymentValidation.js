const MPESA_REF_REGEX = /^[A-Z0-9]{1,10}$/;
const BANK_NUM_REGEX = /^[0-9]{1,12}$/;

function isMpesaMethod(method) {
  return /m-pesa|mpesa|paybill|till|buy\s*goods|send\s*money|split/i.test(String(method || ''));
}

function isBankMethod(method) {
  return /bank|eft|wire|rtgs/i.test(String(method || ''));
}

/**
 * Validates payment transaction references:
 * - M-Pesa: up to 10 alphanumeric characters (A-Z, 0-9)
 * - Bank Transfer / EFT: up to 12 numeric digits (0-9 only)
 */
function validatePaymentReference(paymentMethod, rawRef, options = {}) {
  const { required = false, label = 'Transaction reference' } = options;
  const trimmed = String(rawRef === undefined || rawRef === null ? '' : rawRef).trim();

  if (!trimmed) {
    if (required) {
      return { valid: false, value: '', message: `${label} is required.` };
    }
    return { valid: true, value: '' };
  }

  if (isMpesaMethod(paymentMethod)) {
    const normalized = trimmed.toUpperCase();
    if (!MPESA_REF_REGEX.test(normalized)) {
      return {
        valid: false,
        value: normalized,
        message: 'M-Pesa reference must be up to 10 alphanumeric characters (letters & numbers only, e.g. SLK884290Q).'
      };
    }
    return { valid: true, value: normalized };
  }

  if (isBankMethod(paymentMethod)) {
    if (!BANK_NUM_REGEX.test(trimmed)) {
      return {
        valid: false,
        value: trimmed,
        message: 'Bank transfer reference must contain numbers only (0–9), up to 12 digits max.'
      };
    }
    return { valid: true, value: trimmed };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validates Bank Account Numbers (numbers only, up to 12 digits max)
 * when method/provider indicates a Bank account.
 */
function validateBankAccountNumber(rawAccount, methodOrProvider = 'Bank', options = {}) {
  const { required = true, label = 'Bank account number' } = options;
  const trimmed = String(rawAccount === undefined || rawAccount === null ? '' : rawAccount).trim();

  if (!trimmed) {
    if (required) {
      return { valid: false, value: '', message: `${label} is required.` };
    }
    return { valid: true, value: '' };
  }

  if (isBankMethod(methodOrProvider)) {
    if (!BANK_NUM_REGEX.test(trimmed)) {
      return {
        valid: false,
        value: trimmed,
        message: 'Bank account number must contain numbers only (0–9), up to 12 digits max.'
      };
    }
  }

  return { valid: true, value: trimmed };
}

module.exports = {
  MPESA_REF_REGEX,
  BANK_NUM_REGEX,
  isMpesaMethod,
  isBankMethod,
  validatePaymentReference,
  validateBankAccountNumber
};
