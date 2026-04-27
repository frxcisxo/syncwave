import { SyncMessage } from './types';
import { SyncMessageCodec } from './syncmanager';

export interface EncryptedSyncPayload {
  algorithm: 'AES-GCM';
  salt: string;
  iv: string;
  data: string;
}

function getCryptoApi(): Crypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
    throw new Error('Web Crypto API is required for encrypted sync');
  }

  return globalThis.crypto;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const cryptoApi = getCryptoApi();
  const baseKey = await cryptoApi.subtle.importKey(
    'raw',
    toArrayBuffer(new TextEncoder().encode(secret)),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return cryptoApi.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: 250000,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptSyncMessage(
  message: SyncMessage,
  secret: string
): Promise<EncryptedSyncPayload> {
  const cryptoApi = getCryptoApi();
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(secret, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(message));
  const cipherBuffer = await cryptoApi.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(encoded)
  );

  return {
    algorithm: 'AES-GCM',
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(cipherBuffer)),
  };
}

export async function decryptSyncMessage(
  payload: EncryptedSyncPayload,
  secret: string
): Promise<SyncMessage> {
  const cryptoApi = getCryptoApi();
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const data = base64ToBytes(payload.data);
  const key = await deriveKey(secret, salt);
  const plainBuffer = await cryptoApi.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(data)
  );

  return JSON.parse(new TextDecoder().decode(plainBuffer)) as SyncMessage;
}

export class EncryptedSyncCodec implements SyncMessageCodec {
  constructor(private secret: string) {}

  async encode(message: SyncMessage): Promise<string> {
    return JSON.stringify(await encryptSyncMessage(message, this.secret));
  }

  async decode(payload: string): Promise<SyncMessage> {
    return decryptSyncMessage(
      JSON.parse(payload) as EncryptedSyncPayload,
      this.secret
    );
  }
}

export function createEncryptedSyncCodec(secret: string): SyncMessageCodec {
  return new EncryptedSyncCodec(secret);
}
