import * as WebBrowser from "expo-web-browser";
import { env } from "./env";
import { toast } from "./toast";

/** Opens a page of the website (`/demo-academy/admin/home`, a session log) in the phone's in-app browser. */
export async function openWebsite(path: string): Promise<void> {
  const url = `${env.webUrl}${path.startsWith("/") ? path : `/${path}`}`;
  await openUrl(url);
}

export async function openUrl(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET, controlsColor: "#171717" });
  } catch {
    toast.error("Couldn’t open the page", { description: url });
  }
}
