import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownToLine, ArrowLeft, Smartphone } from "lucide-react";
import "./download.css";

export const metadata: Metadata = {
  title: "Download Pipego for Android",
  description: "Get the Pipego Android app for plumbing help and nearby job requests.",
};

function isSafeDownloadUrl(url: string): boolean {
  return (url.startsWith("/") && !url.startsWith("//")) || url.startsWith("https://");
}

export default function DownloadPage() {
  const downloadUrl = process.env.NEXT_PUBLIC_ANDROID_APK_URL?.trim();
  const canDownload = Boolean(downloadUrl && isSafeDownloadUrl(downloadUrl));

  return (
    <main className="download-page">
      <section className="download-card">
        <Link className="download-back" href="/">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to Pipego
        </Link>
        <span className="download-icon"><Smartphone size={28} aria-hidden="true" /></span>
        <p className="download-eyebrow">PIPEGO FOR ANDROID</p>
        <h1>Good help, wherever you are.</h1>
        <p className="download-description">
          Book a local plumber, follow your request, or manage nearby job offers from the Pipego Android app.
        </p>
        {canDownload && downloadUrl ? (
          <a className="download-button" href={downloadUrl} download={downloadUrl.startsWith("/")}>
            <ArrowDownToLine size={18} aria-hidden="true" />
            Download Android app
          </a>
        ) : (
          <p className="download-unavailable" role="status">
            The Android app download will be available here after the APK is published.
          </p>
        )}
        <p className="download-note">
          Install only Pipego APKs from this official download page. Android may ask you to confirm installation.
        </p>
      </section>
    </main>
  );
}
