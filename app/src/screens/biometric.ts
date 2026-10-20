/**
 * Optional biometric unlock for the app lock (expo-local-authentication,
 * USE_BIOMETRIC only). Entirely best-effort: if no hardware, nothing enrolled,
 * or the module is unavailable, the caller falls back to the PIN.
 */
import * as LocalAuthentication from "expo-local-authentication";

/** True when the device has enrolled biometrics we could use. */
export async function biometricAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

/** Prompt for a fingerprint/face. Resolves false on any failure (use PIN then). */
export async function authenticateBiometric(): Promise<boolean> {
  try {
    if (!(await biometricAvailable())) return false;
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock Floria",
      cancelLabel: "Use PIN",
      disableDeviceFallback: true,
    });
    return r.success;
  } catch {
    return false;
  }
}
