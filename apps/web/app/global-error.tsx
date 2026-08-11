"use client";

import { useEffect } from "react";

/*
 * Last-resort boundary: catches failures in the root layout itself, so it
 * must render its own <html>/<body> and cannot rely on globals.css having
 * loaded. Styles are inline for that reason.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 🔌 ERROR REPORTING INTEGRATION POINT — send to Sentry or similar.
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "2rem 1.25rem",
          background: "#f6f8fb",
          color: "#0f172a",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <div style={{ maxWidth: "26rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>
            PhysioAI could not start
          </h1>
          <p
            style={{
              marginTop: ".6rem",
              fontSize: ".875rem",
              lineHeight: 1.7,
              color: "#475569",
            }}
          >
            The application hit an unrecoverable error while loading. Reload
            the page; if it persists, contact your administrator.
          </p>
          <p
            dir="rtl"
            style={{
              marginTop: ".5rem",
              fontSize: ".8125rem",
              lineHeight: 1.9,
              color: "#94a3b8",
            }}
          >
            برنامه هنگام بارگذاری با خطای برطرف‌نشدنی مواجه شد. صفحه را دوباره
            بارگذاری کنید.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: ".75rem",
                fontFamily: "ui-monospace, monospace",
                fontSize: ".6875rem",
                color: "#94a3b8",
              }}
            >
              ref: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              border: 0,
              borderRadius: ".75rem",
              background: "#0d9488",
              color: "#fff",
              padding: ".65rem 1.1rem",
              fontSize: ".875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
