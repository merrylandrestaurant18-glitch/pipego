"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ChevronDown,
  Droplets,
  LocateFixed,
  MapPin,
  Menu,
  Search,
  SlidersHorizontal,
  ShieldCheck,
} from "lucide-react";
import "./customer-home.css";
import type { MapPoint } from "./live-map";

const LiveMap = dynamic(() => import("./live-map"), {
  ssr: false,
  loading: () => <div className="live-map-loading">Loading live map…</div>,
});

type Provider = {
  id: string;
  display_name: string;
  bio: string | null;
  profile_image_data: string | null;
  service_county: string | null;
  service_location: string | null;
  services_offered: string[];
  years_experience: number | null;
  distance_km: number | null;
  approximate_latitude: number;
  approximate_longitude: number;
};

type Coordinates = { latitude: number; longitude: number };
type AccountMode = "login" | "register";

const services = [
  "Blocked drain",
  "Leaking pipe",
  "Toilet repair",
  "Water heater",
  "Tap or shower",
  "Other plumbing",
];

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function CustomerHome({
  onOpenAccount,
  errorMessage,
}: {
  onOpenAccount: (mode: AccountMode, category: string) => void;
  errorMessage: string;
}) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [selectedService, setSelectedService] = useState(services[0]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const query = coordinates
      ? `?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}`
      : "";

    fetch(`/api/providers${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json()) as Provider[] | { error?: string };
        if (!response.ok || !Array.isArray(result)) {
          throw new Error(
            !Array.isArray(result)
              ? result.error ?? "Unable to load available plumbers."
              : "Unable to load available plumbers.",
          );
        }
        setProviders(result);
        setLoadError("");
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(reason instanceof Error ? reason.message : "Unable to load available plumbers.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [coordinates, refreshIndex]);

  useEffect(() => {
    const timer = window.setInterval(() => setRefreshIndex((value) => value + 1), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  function findNearby() {
    setLocationError("");
    setLoadError("");
    if (!navigator.geolocation) {
      setLocationError("Location is unavailable in this browser. You can still browse plumbers.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords: position }) => {
        setCoordinates({ latitude: position.latitude, longitude: position.longitude });
        setLoading(true);
        setLocating(false);
      },
      () => {
        setLocationError("We couldn't access your location. Check browser permissions and try again.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  const visibleProviders = coordinates
    ? providers.filter((provider) => provider.distance_km !== null)
    : providers;

  return (
    <main className="dispatch-home">
      <header className="dispatch-header">
        <button className="dispatch-menu-button" type="button" aria-label="Open menu">
          <Menu size={20} />
        </button>
        <Link className="dispatch-brand" href="/" aria-label="Pipego home">
          <span className="dispatch-brand-mark"><Droplets size={18} strokeWidth={2.4} /></span>
          <span className="dispatch-brand-copy"><span>pipego<span className="dispatch-brand-dot">.</span></span><small>Reliable plumbers. Near you.</small></span>
        </Link>
        <nav className="dispatch-nav" aria-label="Main navigation"><Link href="/profile">For plumbers</Link></nav>
        <div className="dispatch-account-actions">
          <button type="button" onClick={() => onOpenAccount("login", selectedService)}>Log in</button>
          <button className="dispatch-signup" type="button" onClick={() => onOpenAccount("register", selectedService)}>Create account</button>
        </div>
      </header>

      <section className="dispatch-workspace" aria-label="Find plumbing help">
        <section className="dispatch-map" aria-label="Map showing nearby plumbers approximately">
          <LiveMap
            className="dispatch-live-map"
            center={coordinates ? [coordinates.latitude, coordinates.longitude] : [-1.2864, 36.8172]}
            points={[
              ...(coordinates ? [{
                id: "customer-location",
                label: "Your location",
                latitude: coordinates.latitude,
                longitude: coordinates.longitude,
                kind: "customer" as const,
              }] : []),
              ...visibleProviders.map((provider): MapPoint => ({
                id: provider.id,
                label: `${provider.display_name} · approximate location`,
                latitude: provider.approximate_latitude,
                longitude: provider.approximate_longitude,
                kind: "provider",
              })),
            ]}
          />

          <div className="dispatch-map-searches">
            <button
              className="dispatch-map-location"
              type="button"
              onClick={findNearby}
              disabled={locating}
            >
              <MapPin size={18} fill="currentColor" />
              <span>{locating ? "Finding your location..." : coordinates ? "Your location" : "Nairobi, Kenya"}</span>
              <ChevronDown size={18} />
            </button>
            <label className="dispatch-map-service">
              <Search size={19} />
              <select id="dispatch-service-select" aria-label="Type of plumbing service" value={selectedService} onChange={(event) => setSelectedService(event.target.value)}>
                <option value="" disabled>What type of plumbing service do you need?</option>
                {services.map((service) => <option key={service}>{service}</option>)}
              </select>
              <ChevronDown size={16} />
            </label>
            {locationError && <p className="dispatch-map-error" role="status">{locationError}</p>}
          </div>

          <button className="dispatch-map-locate" type="button" onClick={findNearby} disabled={locating} aria-label="Find plumbers near my location">
            <LocateFixed size={20} />
          </button>
          <div className="dispatch-map-privacy"><ShieldCheck size={13} />Nearby pins are approximate and refresh every 10 seconds.</div>
        </section>

        <aside className="dispatch-panel" id="find-help">
          {errorMessage && <div className="dispatch-list-message" role="alert">{errorMessage}</div>}
          <div className="dispatch-list-heading" id="dispatch-profiles">
            <div>
              <h1>Available plumbers near you</h1>
              <p>Quick, trusted and professional.</p>
            </div>
            <button className="dispatch-filter-button" type="button" onClick={() => document.getElementById("dispatch-service-select")?.focus()}>
              <SlidersHorizontal size={16} /> Filter
            </button>
          </div>
          <div className="dispatch-provider-list" aria-live="polite">
            {loading ? (
              [0, 1, 2].map((item) => <div className="dispatch-provider-skeleton" key={item} />)
            ) : loadError ? (
              <div className="dispatch-list-message" role="alert">
                <p>{loadError}</p>
                <button type="button" onClick={() => { setLoading(true); setRefreshIndex((value) => value + 1); }}>Try again</button>
              </div>
            ) : visibleProviders.length ? (
              visibleProviders.map((provider) => (
                <article
                  className={`dispatch-provider-card${selectedProvider === provider.id ? " dispatch-provider-selected" : ""}`}
                  id={`dispatch-provider-${provider.id}`}
                  key={provider.id}
                >
                  <button
                    className="dispatch-provider-select"
                    type="button"
                    onClick={() => setSelectedProvider(provider.id)}
                    aria-pressed={selectedProvider === provider.id}
                    aria-label={`Select ${provider.display_name}`}
                  >
                    <span className="dispatch-avatar">
                      {provider.profile_image_data ? (
                        // Profile images are validated by the API before they are stored.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={provider.profile_image_data} alt="" />
                      ) : <span>{initials(provider.display_name)}</span>}
                      <i aria-label="Available now" />
                    </span>
                    <span className="dispatch-provider-info">
                      <strong>{provider.display_name}</strong>
                      <small>{provider.bio || "Verified plumbing professional"}</small>
                      {provider.services_offered?.length ? <span className="dispatch-service-list">{provider.services_offered.join(" · ")}</span> : null}
                      <span className="dispatch-provider-meta">
                        <MapPin size={12} />
                        {[provider.distance_km !== null && provider.distance_km !== undefined ? `${provider.distance_km} km` : null, provider.service_location, provider.service_county].filter(Boolean).join(" · ") || "Local service area"}
                      </span>
                    </span>
                  </button>
                  <span className="dispatch-provider-action">
                    <span className="dispatch-available"><i /> Available now</span>
                    {provider.years_experience !== null && <small>{provider.years_experience} yrs experience</small>}
                    <button type="button" onClick={() => onOpenAccount("register", selectedService)}>Book now</button>
                  </span>
                </article>
              ))
            ) : (
              <div className="dispatch-list-message">
                <strong>{coordinates ? "No plumbers nearby right now" : "No plumbers online right now"}</strong>
                <p>Check back soon or allow location access to find available pros nearby.</p>
                <button type="button" onClick={findNearby} disabled={locating}>{locating ? "Finding your area..." : "Use my location"}</button>
              </div>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
