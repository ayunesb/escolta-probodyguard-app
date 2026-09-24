import i18n from '@/i18n';

export interface PasswordValidationResult {
  isValid: boolean;
  feedback: string[];
}

export const validatePasswordStrength = (password: string): PasswordValidationResult => {
  const feedback: string[] = [];
  
  if (password.length < 8) {
    feedback.push(i18n.t('auth:password.minLength'));
  }
  
  if (!/[A-Z]/.test(password)) {
    feedback.push(i18n.t('auth:password.uppercase'));
  }
  
  if (!/[a-z]/.test(password)) {
    feedback.push(i18n.t('auth:password.lowercase'));
  }
  
  if (!/[0-9]/.test(password)) {
    feedback.push(i18n.t('auth:password.number'));
  }
  
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    feedback.push(i18n.t('auth:password.special'));
  }
  
  const commonPasswords = ['password', '12345678', 'qwerty', 'abc123', 'password123'];
  if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
    feedback.push(i18n.t('auth:password.common'));
  }
  
  return {
    isValid: feedback.length === 0,
    feedback
  };
};
