import { GoogleAuthProvider, signInWithCredential } from "@react-native-firebase/auth";
import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from "@react-native-google-signin/google-signin";
import { env } from "./env";
import { auth } from "./firebase";

/** Google Sign-In works once the build knows the project's OAuth clients (app.config.ts reads them). */
export const googleSignInConfigured = !!env.googleWebClientId && !env.useEmulators;

let configured = false;
function configure(): void {
  if (configured) return;
  GoogleSignin.configure({ webClientId: env.googleWebClientId });
  configured = true;
}

/** Google's account picker, then Firebase. False when the person closed the picker. */
export async function signInWithGoogle(hint?: string | null): Promise<boolean> {
  configure();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn(hint ? { loginHint: hint } : undefined);
    if (!isSuccessResponse(response)) return false;
    if (!response.data.idToken) throw new Error("Google did not send a sign-in token. Try again.");
    await signInWithCredential(auth, GoogleAuthProvider.credential(response.data.idToken));
    return true;
  } catch (e) {
    if (isErrorWithCode(e) && (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS)) return false;
    throw e;
  }
}

/** Forget the Google account too, so the next sign-in asks which one. */
export async function signOutOfGoogle(): Promise<void> {
  if (configured) await GoogleSignin.signOut().catch(() => undefined);
}
