import crypto from 'node:crypto'

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LEN = 64

export function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const derived = crypto.scryptSync(String(password), salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 32 * 1024 * 1024 })
  return `scrypt$N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}$${salt.toString('base64')}$${derived.toString('base64')}`
}

export function verifyPassword(password, encoded) {
  try {
    const [scheme, params, saltB64, hashB64] = String(encoded || '').split('$')
    if (scheme !== 'scrypt') return false
    const values = Object.fromEntries(params.split(',').map((item) => item.split('=')))
    const salt = Buffer.from(saltB64, 'base64')
    const expected = Buffer.from(hashB64, 'base64')
    const derived = crypto.scryptSync(String(password), salt, expected.length, {
      N: Number(values.N) || SCRYPT_N,
      r: Number(values.r) || SCRYPT_R,
      p: Number(values.p) || SCRYPT_P,
      maxmem: 32 * 1024 * 1024,
    })
    return expected.length === derived.length && crypto.timingSafeEqual(expected, derived)
  } catch {
    return false
  }
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

function encryptionKey() {
  const raw = process.env.PROVIDER_CREDENTIAL_KEY
  if (!raw) return null
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('PROVIDER_CREDENTIAL_KEY must be a base64-encoded 32-byte key.')
  return key
}

export function encryptSecret(value) {
  if (!value) return null
  const key = encryptionKey()
  if (!key) throw new Error('PROVIDER_CREDENTIAL_KEY is required to store provider credentials securely.')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  return `enc:v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`
}

export function decryptSecret(value) {
  if (!value) return null
  if (!String(value).startsWith('enc:v1:')) return value
  const key = encryptionKey()
  if (!key) throw new Error('PROVIDER_CREDENTIAL_KEY is required to decrypt provider credentials.')
  const [, , ivB64, tagB64, dataB64] = String(value).split(':')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}

export function isPrivateHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host === '127.0.0.1') return true
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
  if (/^\[?fc|^\[?fd/i.test(host)) return true
  return false
}

export function validateProviderUrl(value, { production = process.env.NODE_ENV === 'production' } = {}) {
  const url = new URL(String(value))
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Provider API URL must use HTTP or HTTPS.')
  if (production && url.protocol !== 'https:') throw new Error('Provider API URL must use HTTPS in production.')
  if (isPrivateHost(url.hostname)) throw new Error('Private or local provider API addresses are not allowed.')
  return url
}

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim()
}
