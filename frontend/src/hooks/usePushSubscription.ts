import React from "react";

import { api } from "../api";

export type PushState = "unsupported" | "loading" | "unsubscribed" | "subscribed" | "denied";

const pushSupported =
  typeof navigator !== "undefined" &&
  "serviceWorker" in navigator &&
  typeof window !== "undefined" &&
  "PushManager" in window &&
  "Notification" in window;

/** True when the app is running as an installed PWA (iOS Web Push requires this). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Manages this browser's Web Push subscription: reads the current state and
 * exposes subscribe/unsubscribe actions. `publicKey` is the server's VAPID
 * application-server key (from settings). Actions throw on failure so the
 * caller can surface a toast.
 */
export function usePushSubscription(publicKey: string | undefined) {
  const [state, setState] = React.useState<PushState>(pushSupported ? "loading" : "unsupported");
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!pushSupported) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    setState(subscription ? "subscribed" : "unsubscribed");
  }, []);

  React.useEffect(() => {
    refresh().catch(() => setState("unsubscribed"));
  }, [refresh]);

  const subscribe = React.useCallback(async () => {
    if (!pushSupported || !publicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "unsubscribed");
        throw new Error("Notification permission was not granted");
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
      await api.pushSubscribe(subscription.toJSON());
      setState("subscribed");
    } finally {
      setBusy(false);
    }
  }, [publicKey]);

  const unsubscribe = React.useCallback(async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (subscription) {
        await api.pushUnsubscribe(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("unsubscribed");
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, subscribe, unsubscribe, refresh };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}
