import test from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword, verifyPassword, hashToken, encryptSecret, decryptSecret, validateProviderUrl, isPrivateHost } from './security.js'

test('password hashing verifies correctly', () => {
  const hash = hashPassword('StrongTestPassword!123')
  assert.notEqual(hash, 'StrongTestPassword!123')
  assert.equal(verifyPassword('StrongTestPassword!123', hash), true)
  assert.equal(verifyPassword('wrong-password', hash), false)
})

test('tokens are one-way hashed', () => {
  const token = 'test-token'
  assert.notEqual(hashToken(token), token)
  assert.equal(hashToken(token), hashToken(token))
})

test('provider credentials encrypt and decrypt', () => {
  process.env.PROVIDER_CREDENTIAL_KEY = Buffer.alloc(32, 7).toString('base64')
  const encrypted = encryptSecret('provider-secret')
  assert.notEqual(encrypted, 'provider-secret')
  assert.equal(decryptSecret(encrypted), 'provider-secret')
})

test('private provider addresses are blocked', () => {
  assert.equal(isPrivateHost('127.0.0.1'), true)
  assert.equal(isPrivateHost('10.0.0.4'), true)
  assert.throws(() => validateProviderUrl('http://127.0.0.1:4000'))
})

test('production provider URLs require HTTPS', () => {
  assert.throws(() => validateProviderUrl('http://example.com', { production: true }))
  assert.doesNotThrow(() => validateProviderUrl('https://example.com', { production: true }))
})
