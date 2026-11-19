/**
 * Passkeys (WebAuthn) im Browser. Der Server schickt die Optionen als JSON mit
 * base64url-Werten; der Browser braucht dafür ArrayBuffer und umgekehrt.
 */
import { api } from './client';
import type { Me } from './types';

function fromBase64url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function toBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface DescriptorJSON {
  id: string;
  type: 'public-key';
  transports?: string[];
}

interface CreationOptionsJSON {
  challenge: string;
  rp: PublicKeyCredentialRpEntity;
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout?: number;
  excludeCredentials?: DescriptorJSON[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  attestation?: AttestationConveyancePreference;
}

interface RequestOptionsJSON {
  challenge: string;
  timeout?: number;
  rpId?: string;
  allowCredentials?: DescriptorJSON[];
  userVerification?: UserVerificationRequirement;
}

function descriptor(d: DescriptorJSON): PublicKeyCredentialDescriptor {
  return { id: fromBase64url(d.id), type: 'public-key', transports: d.transports as AuthenticatorTransport[] | undefined };
}

export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window && Boolean(navigator.credentials);
}

/** Legt für das angemeldete Konto einen Passkey auf diesem Gerät an. */
export async function createPasskey(): Promise<void> {
  const options = await api<CreationOptionsJSON>('/auth/passkey/register/options', { method: 'POST' });
  const publicKey: PublicKeyCredentialCreationOptions = {
    rp: options.rp,
    user: { ...options.user, id: fromBase64url(options.user.id) },
    challenge: fromBase64url(options.challenge),
    pubKeyCredParams: options.pubKeyCredParams,
    timeout: options.timeout,
    excludeCredentials: (options.excludeCredentials ?? []).map(descriptor),
    authenticatorSelection: options.authenticatorSelection,
    attestation: options.attestation,
  };
  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!credential) throw new Error('Abgebrochen');
  const response = credential.response as AuthenticatorAttestationResponse;
  await api('/auth/passkey/register/verify', {
    method: 'POST',
    body: {
      id: credential.id,
      rawId: toBase64url(credential.rawId),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment,
      clientExtensionResults: credential.getClientExtensionResults(),
      response: {
        clientDataJSON: toBase64url(response.clientDataJSON),
        attestationObject: toBase64url(response.attestationObject),
        transports: typeof response.getTransports === 'function' ? response.getTransports() : [],
      },
    },
  });
}

/** Anmeldung mit einem Passkey auf diesem Gerät, ohne E-Mail. */
export async function loginWithPasskey(): Promise<Me> {
  const options = await api<RequestOptionsJSON>('/auth/passkey/login/options', { method: 'POST' });
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: fromBase64url(options.challenge),
    timeout: options.timeout,
    rpId: options.rpId,
    allowCredentials: (options.allowCredentials ?? []).map(descriptor),
    userVerification: options.userVerification,
  };
  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!credential) throw new Error('Abgebrochen');
  const response = credential.response as AuthenticatorAssertionResponse;
  return api<Me>('/auth/passkey/login/verify', {
    method: 'POST',
    body: {
      id: credential.id,
      rawId: toBase64url(credential.rawId),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment,
      clientExtensionResults: credential.getClientExtensionResults(),
      response: {
        clientDataJSON: toBase64url(response.clientDataJSON),
        authenticatorData: toBase64url(response.authenticatorData),
        signature: toBase64url(response.signature),
        userHandle: response.userHandle ? toBase64url(response.userHandle) : null,
      },
    },
  });
}
