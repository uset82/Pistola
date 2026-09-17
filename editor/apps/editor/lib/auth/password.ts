import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const SCRYPT_KEY_LENGTH = 64

const parseStoredPasswordHash = (value: string) => {
  const [algorithm, salt, digest] = value.split(':')
  if (algorithm !== 'scrypt' || !salt || !digest) {
    return null
  }

  return {
    salt,
    digest,
  }
}

export const hashAuthPassword = async (password: string) => {
  const salt = randomBytes(16).toString('base64url')
  const derived = (await scrypt(password, salt, SCRYPT_KEY_LENGTH)) as Buffer
  return `scrypt:${salt}:${derived.toString('base64url')}`
}

export const verifyAuthPassword = async (password: string, storedHash: string) => {
  const parsed = parseStoredPasswordHash(storedHash)
  if (!parsed) return false

  const expected = Buffer.from(parsed.digest, 'base64url')
  const actual = (await scrypt(password, parsed.salt, expected.length)) as Buffer

  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
