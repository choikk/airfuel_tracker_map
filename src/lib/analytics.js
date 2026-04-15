const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || "";
const GA_SCRIPT_ID = "google-analytics-gtag";

function canUseDom() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function getMeasurementId() {
  return typeof GA_MEASUREMENT_ID === "string" ? GA_MEASUREMENT_ID.trim() : "";
}

export function initGoogleAnalytics() {
  const measurementId = getMeasurementId();
  if (!measurementId || !canUseDom()) return;

  if (window.__AIRFUEL_GA_INITIALIZED__) return;
  window.__AIRFUEL_GA_INITIALIZED__ = true;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  if (!document.getElementById(GA_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = GA_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
      measurementId
    )}`;
    document.head.appendChild(script);
  }

  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: true,
  });
}

export function trackEvent(eventName, params = {}) {
  const measurementId = getMeasurementId();
  if (!measurementId || !canUseDom() || typeof window.gtag !== "function") return;

  window.gtag("event", eventName, params);
}
