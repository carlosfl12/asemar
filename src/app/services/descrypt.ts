import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class Descrypt {
  async decryptPhpAes256Gcm(
    encryptedData: string,
    key: string,
  ): Promise<string | null> {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return null;

    const iv = this.b64ToBytes(parts[0]);
    const ciphertext = this.b64ToBytes(parts[1]);
    const tag = this.b64ToBytes(parts[2]);

    const rawKey32 = this.normalizeKeyTo32BytesUtf8(key) as any;

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      rawKey32,
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );

    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext, 0);
    combined.set(tag, ciphertext.length);

    try {
      const plainBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as any, tagLength: 128 },
        cryptoKey,
        combined,
      );

      return new TextDecoder().decode(new Uint8Array(plainBuffer));
    } catch {
      return null;
    }
  }

  private b64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  private normalizeKeyTo32BytesUtf8(key: string): Uint8Array {
    const keyBytes = new TextEncoder().encode(key);
    const out = new Uint8Array(32);
    out.set(keyBytes.subarray(0, 32));
    return out;
  }
}
