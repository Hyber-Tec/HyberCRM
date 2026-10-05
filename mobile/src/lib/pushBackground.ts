import { getMessaging, setBackgroundMessageHandler } from "@react-native-firebase/messaging";

/**
 * A push that arrives with Hyber CRM closed or in the background is a notification the phone shows by itself, so
 * there is nothing for the app to do then. Set before the app starts, as React Native Firebase asks, which also keeps
 * Android from warning that no handler was set each time one arrives.
 */
setBackgroundMessageHandler(getMessaging(), async () => undefined);
