import { describe, expect, it } from 'vitest';
import { checkVerifier, createVerifier, decrypt, deriveKey, encrypt, generatePassword, randomBytes } from './crypto';

describe('vault crypto', () => {
  it('round-trips and rejects the wrong password', async () => {
    const salt = randomBytes(16);
    const key = await deriveKey('correct horse battery staple', salt, 1000);
    const { ciphertext, iv } = await encrypt(key, JSON.stringify({ password: 'hunter2' }));
    expect(ciphertext).not.toContain('hunter2');
    expect(JSON.parse(await decrypt(key, ciphertext, iv))).toEqual({ password: 'hunter2' });
    const v = await createVerifier(key);
    expect(await checkVerifier(key, v.verifier, v.verifierIv)).toBe(true);
    const wrong = await deriveKey('wrong password', salt, 1000);
    expect(await checkVerifier(wrong, v.verifier, v.verifierIv)).toBe(false);
    await expect(decrypt(wrong, ciphertext, iv)).rejects.toThrow();
  });
  it('uses a fresh IV for every encryption', async () => {
    const key = await deriveKey('pw', randomBytes(16), 1000);
    const a = await encrypt(key, 'same');
    const b = await encrypt(key, 'same');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
  it('generates strong passwords with every character class', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword(20);
      expect(p).toHaveLength(20);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[!@#$%^&*\-_=+?]/);
    }
    expect(new Set(Array.from({ length: 100 }, () => generatePassword(16))).size).toBe(100);
  });
});
