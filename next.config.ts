import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

/**
 * Where /api/* goes: the MCL-CRM-Backend Express API. The rewrite is fixed when the app is built, so a production
 * build must be told (API_URL); only `next dev` falls back to the API on this machine. It is read by the Next server
 * alone (it proxies the calls): the browser only ever talks to this site, and the address never reaches its code.
 */
function apiUrl(phase: string) {
  const raw = process.env.API_URL?.trim();
  if (!raw) {
    if (phase === PHASE_PRODUCTION_BUILD)
      throw new Error("API_URL is not set. A production build needs the MCL API's address, e.g. API_URL=https://api.example.com (see .env.example).");
    return "http://localhost:4000";
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("API_URL must be an absolute http(s) URL such as https://api.example.com.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("API_URL must start with http:// or https://.");
  if (phase === PHASE_PRODUCTION_BUILD && url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    console.warn(`API_URL uses plain http (${url.host}): session cookies cross that hop unencrypted. Use https unless the API is on a private network.`);
  return url.origin + url.pathname.replace(/\/+$/, "");
}

export default function config(phase: string): NextConfig {
  const api = apiUrl(phase);
  return {
    // The browser only talks to this origin; /api/* is forwarded to the API, so its session cookie is first-party
    // and no CORS is needed.
    async rewrites() {
      return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
    },
    cacheComponents: true,
    partialPrefetching: true,
    turbopack: {
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
  };
}
