const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 256

export const normalizeAuthEmail = (email: string) => email.trim().toLowerCase()

export const validateAuthEmail = (email: string) => {
  if (!email.trim()) {
    return 'Email is required.'
  }

  if (!EMAIL_PATTERN.test(normalizeAuthEmail(email))) {
    return 'Enter a valid email address.'
  }

  return null
}

export const validateAuthPassword = (password: string) => {
  if (!password) {
    return 'Password is required.'
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`
  }

  return null
}

