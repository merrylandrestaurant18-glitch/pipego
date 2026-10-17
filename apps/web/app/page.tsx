"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Droplets,
  LockKeyhole,
  MapPin,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";
import CustomerHome from "./customer-home";
import dynamic from "next/dynamic";

const LiveMap = dynamic(() => import("./live-map"), { ssr: false });

type User = {
  id: string;
  email: string;
  role: "customer" | "plumber" | "company" | "admin";
};

type Booking = {
  id: string;
  provider_id: string | null;
  category: string;
  description: string;
  status: string;
  latitude: number;
  longitude: number;
  offer_expires_at: string | null;
};

type ProviderLocation = {
  latitude: number | null;
  longitude: number | null;
  updated_at: string | null;
};

type SessionResponse = {
  user: User | null;
};

const categories = [
  "Blocked drain",
  "Leaking pipe",
  "Toilet repair",
  "Water heater",
  "Tap or shower",
  "Other plumbing",
];

const statusLabels: Record<string, string> = {
  requested: "Request received",
  searching: "Finding a nearby plumber",
  offered: "A plumber is reviewing your request",
  accepted: "A plumber is on the way",
  en_route: "Your plumber is on the way",
  arrived: "Your plumber has arrived",
  inspection: "Inspection in progress",
  quote_pending: "Waiting for a quote",
  quote_approved: "Quote approved",
  in_progress: "Work in progress",
  completion_pending: "Work awaiting confirmation",
  completed: "Job completed",
  no_provider_found: "No plumber is available right now",
  cancelled: "Request cancelled",
};

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [accountType, setAccountType] = useState<"customer" | "plumber">("customer");
  const [plumberDisplayName, setPlumberDisplayName] = useState("");
  const [plumberApplicationPending, setPlumberApplicationPending] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [category, setCategory] = useState(categories[0]);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [providerLocation, setProviderLocation] = useState<ProviderLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("We couldn't check your sign-in. Please refresh the page.");
        }
        return (await response.json()) as SessionResponse;
      })
      .then((session) => {
        if (active) setUser(session.user);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to check your session.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const bookingId = booking?.id;
    if (!bookingId || !user || user.role !== "customer") return;

    async function pollBooking() {
      try {
        const response = await fetch(`/api/bookings/${bookingId}`, { cache: "no-store" });
        const current = (await response.json()) as Booking & { error?: string };
        if (!response.ok) throw new Error(current.error || "Unable to refresh this request.");
        setBooking(current);
        if (
          current.provider_id &&
          ["accepted", "en_route", "arrived", "inspection", "quote_pending", "quote_approved", "in_progress", "completion_pending"].includes(current.status)
        ) {
          const locationResponse = await fetch(`/api/bookings/${bookingId}/provider-location`, { cache: "no-store" });
          const locationResult = (await locationResponse.json()) as ProviderLocation & { error?: string };
          if (!locationResponse.ok) throw new Error(locationResult.error || "Unable to refresh plumber location.");
          setProviderLocation(locationResult);
        } else {
          setProviderLocation(null);
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Unable to refresh this request.");
      }
    }

    void pollBooking();
    const timer = window.setInterval(() => { void pollBooking(); }, 5000);
    return () => window.clearInterval(timer);
  }, [booking?.id, user]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: authMode, email, password }),
      });
      const result = (await response.json()) as { user?: User; error?: string };
      if (!response.ok || !result.user) {
        throw new Error(result.error || "We couldn't sign you in. Please try again.");
      }
      setUser(result.user);
      setPassword("");
      if (authMode === "register" && accountType === "plumber") {
        setPlumberApplicationPending(true);
        await submitPlumberApplication(plumberDisplayName);
        setPlumberApplicationPending(false);
        setUser({ ...result.user, role: "plumber" });
        setNotice("Your account is ready. Your plumber application is being reviewed.");
      } else {
        setNotice(authMode === "register" ? "Your customer account is ready. Find a plumber when you need one." : "Welcome back.");
      }
      router.push(authMode === "register" ? "/profile?edit=1" : "/profile");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPlumberApplication(displayName: string) {
    const response = await fetch("/api/providers/me/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: displayName.trim() }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(result.error || "Your account was created, but we couldn't submit your plumber application.");
    }
  }

  async function retryPlumberApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await submitPlumberApplication(plumberDisplayName);
      setPlumberApplicationPending(false);
      setUser((currentUser) => currentUser ? { ...currentUser, role: "plumber" } : currentUser);
      setNotice("Your plumber application is being reviewed.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to submit your plumber application.");
    } finally {
      setBusy(false);
    }
  }

  function requestLocation() {
    setError("");
    setNotice("");
    if (!navigator.geolocation) {
      setError("Location is not available in this browser. Enable location services and try again.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ latitude: coords.latitude, longitude: coords.longitude });
        setNotice("Your location is ready. It is shared only to find a nearby plumber.");
        setBusy(false);
      },
      () => {
        setError("We couldn't access your location. Check your browser permission and try again.");
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  async function handleBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!location) {
      setError("Share your location so we can find a nearby plumber.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          description,
          latitude: location.latitude,
          longitude: location.longitude,
        }),
      });
      const result = (await response.json()) as Booking & { error?: string };
      if (!response.ok) throw new Error(result.error || "We couldn't send your request.");
      setBooking(result);
      setDescription("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to send your request.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshBooking() {
    if (!booking) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/bookings/${booking.id}`, { cache: "no-store" });
      const result = (await response.json()) as Booking & { error?: string };
      if (!response.ok) throw new Error(result.error || "We couldn't refresh this request.");
      setBooking(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to refresh this request.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/session", { method: "DELETE" });
      if (!response.ok) throw new Error("We couldn't sign you out. Please try again.");
      setUser(null);
      setBooking(null);
      setShowAccount(false);
      setNotice("You are signed out.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign out.");
    } finally {
      setBusy(false);
    }
  }

  if (!user && !showAccount) {
    return (
      <CustomerHome
        errorMessage={error}
        onOpenAccount={(mode, selectedCategory) => {
          setAuthMode(mode);
          setCategory(selectedCategory);
          setAccountType("customer");
          setShowAccount(true);
        }}
      />
    );
  }

  return (
    <main className={`customer-app${user ? "" : " customer-app-logged-out"}${showAccount && !user ? " customer-app-account" : ""}`}>
      <aside className="customer-sidebar">
        <Link className="customer-brand" href="/" aria-label="Pipego home">
          <span className="customer-brand-mark"><Droplets size={18} strokeWidth={2.4} /></span>
          <span>pipego<span className="customer-brand-dot">.</span></span>
        </Link>

        <div className="customer-nav-label">YOUR SPACE</div>
        <nav className="customer-nav" aria-label="Customer navigation">
          <a className="customer-nav-link customer-nav-active" href="#overview"><BriefcaseBusiness size={17} /><span>Overview</span></a>
          <a className="customer-nav-link" href="#request"><Wrench size={17} /><span>New request</span></a>
          <Link className="customer-nav-link" href="/dashboard"><CircleHelp size={17} /><span>Explore Pipego</span></Link>
        </nav>

        <div className="customer-sidebar-bottom">
          <div className="customer-security-note">
            <span><ShieldCheck size={15} /></span>
            <div><strong>Your home, kept private</strong><p>Your location is shared only when you request a nearby plumber.</p></div>
          </div>
          {user && (
            <div className="customer-user">
              <span className="customer-user-avatar">{user.email.slice(0, 1).toUpperCase()}</span>
              <span className="customer-user-details"><strong>{user.email}</strong><small>{user.role}</small></span>
            </div>
          )}
        </div>
      </aside>

      <section className="customer-main" id="overview">
        <header className="customer-topbar">
          {user ? (
            <div className="customer-breadcrumb"><span>Workspace</span><ChevronRight size={13} /><strong>Overview</strong></div>
          ) : (
            <Link className="customer-topbar-brand" href="/" aria-label="Pipego home">
              <span className="customer-brand-mark"><Droplets size={16} strokeWidth={2.4} /></span>
              <span>pipego<span className="customer-brand-dot">.</span></span>
            </Link>
          )}
          <div className="customer-topbar-actions">
            {user ? (
              <>
                <span className="customer-session-status"><span /> Signed in</span>
                <Link className="customer-signout" href="/profile">My profile</Link>
                <button className="customer-signout" type="button" onClick={signOut} disabled={busy}>Sign out</button>
              </>
            ) : (
              <>
                <Link className="customer-signout" href="/download">Get Android app</Link>
                <span className="customer-secure-label"><LockKeyhole size={13} /> Secure account</span>
                <button className="customer-signout" type="button" onClick={() => setShowAccount(false)}>Back to plumbers</button>
              </>
            )}
          </div>
        </header>

        <div className="customer-content">
          <div className="customer-page-heading">
            <div>
              <span className="customer-eyebrow"><span /> {user ? "CUSTOMER WORKSPACE" : "YOUR PIPEGO ACCOUNT"}</span>
              <h1>{user ? `Good to have you back${user.email ? "," : ""}` : authMode === "login" ? "Welcome back" : "Find trusted help for your home"}</h1>
              <p>{user ? "Manage your plumbing request and see what happens next." : authMode === "login" ? "Sign in to continue to your Pipego account." : "Create an account to connect with a trusted local plumber and approve the quote before work begins."}</p>
              {!user && authMode === "register" && (
                <ol className="account-intro-steps" aria-label="How Pipego works">
                  <li><span>01</span><div><strong>Tell us what needs fixing</strong><small>Choose a service and share your location.</small></div></li>
                  <li><span>02</span><div><strong>Get matched nearby</strong><small>Find a local plumber for the job.</small></div></li>
                  <li><span>03</span><div><strong>Approve your quote</strong><small>Review the price before work begins.</small></div></li>
                </ol>
              )}
            </div>
            {user?.role === "customer" && <a className="customer-heading-link" href="#request"><Wrench size={15} /> New request</a>}
          </div>

          {error && <div className="customer-message customer-message-error" role="alert">{error}</div>}
          {notice && <div className="customer-message customer-message-success" role="status"><Check size={15} />{notice}</div>}

          <div className={`customer-workspace-grid${!user ? " customer-workspace-logged-out" : ""}`}>
            <section className="customer-primary-panel" id="request">
              {!user ? (
                <>
                  <div className="auth-panel-heading">
                    <span className="auth-panel-icon">{authMode === "register" && accountType === "plumber" ? <Wrench size={18} /> : <UserRound size={19} />}</span>
                    <div><h2>{authMode === "register" ? accountType === "plumber" ? "Join as a plumber" : "Create an account" : "Sign in"}</h2><p>{authMode === "register" ? accountType === "plumber" ? "Apply to join the Pipego network." : "Enter your email and create a password to join Pipego." : "Continue to your Pipego account."}</p></div>
                  </div>

                  <div className="auth-tabs" role="tablist" aria-label="Sign in or create an account">
                    <button
                      className={authMode === "login" ? "auth-tab auth-tab-active" : "auth-tab"}
                      type="button"
                      role="tab"
                      aria-selected={authMode === "login"}
                      onClick={() => { setAuthMode("login"); setError(""); setNotice(""); setPlumberApplicationPending(false); }}
                    >Sign in</button>
                    <button
                      className={authMode === "register" ? "auth-tab auth-tab-active" : "auth-tab"}
                      type="button"
                      role="tab"
                      aria-selected={authMode === "register"}
                      onClick={() => { setAuthMode("register"); setError(""); setNotice(""); }}
                    >Create account</button>
                  </div>

                  <form className="customer-form" onSubmit={handleAuth}>
                    {authMode === "register" && (
                      <fieldset className="account-type-picker">
                        <legend>I want to</legend>
                        <div className="account-type-options">
                          <button
                            className={accountType === "customer" ? "account-type-option account-type-selected" : "account-type-option"}
                            type="button"
                            aria-pressed={accountType === "customer"}
                            onClick={() => { setAccountType("customer"); setError(""); setNotice(""); }}
                          >
                            <UserRound size={17} aria-hidden="true" />
                            <span><strong>Find a plumber</strong><small>For home repairs</small></span>
                            {accountType === "customer" && <Check className="account-type-check" size={15} aria-hidden="true" />}
                          </button>
                          <button
                            className={accountType === "plumber" ? "account-type-option account-type-selected" : "account-type-option"}
                            type="button"
                            aria-pressed={accountType === "plumber"}
                            onClick={() => { setAccountType("plumber"); setError(""); setNotice(""); }}
                          >
                            <Wrench size={17} aria-hidden="true" />
                            <span><strong>Join as a plumber</strong><small>For plumbing pros</small></span>
                            {accountType === "plumber" && <Check className="account-type-check" size={15} aria-hidden="true" />}
                          </button>
                        </div>
                      </fieldset>
                    )}
                    {authMode === "register" && accountType === "plumber" && (
                      <label className="customer-field">
                        <span>Name shown to customers</span>
                        <input
                          autoComplete="name"
                          type="text"
                          value={plumberDisplayName}
                          onChange={(event) => setPlumberDisplayName(event.target.value)}
                          placeholder="Your name"
                          minLength={2}
                          maxLength={120}
                          required
                        />
                      </label>
                    )}
                    <label className="customer-field">
                      <span>Email address</span>
                      <input
                        autoComplete="email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                        required
                      />
                    </label>
                    <label className="customer-field">
                      <span>Password</span>
                      <span className="password-input-wrap">
                        <input
                          autoComplete={authMode === "register" ? "new-password" : "current-password"}
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder={authMode === "register" ? "At least 12 characters" : "Enter your password"}
                          minLength={authMode === "register" ? 12 : 1}
                          maxLength={128}
                          required
                        />
                        <button type="button" className="password-visibility" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
                      </span>
                      {authMode === "register" && <small className="field-hint">Use at least 12 characters.</small>}
                    </label>
                    <button className="customer-primary-button" type="submit" disabled={busy}>
                      {busy ? "One moment..." : authMode === "register" ? accountType === "plumber" ? "Apply as a plumber" : "Create customer account" : "Sign in"}
                      <ArrowRight size={16} />
                    </button>
                  </form>

                  <div className="auth-footnote"><LockKeyhole size={13} /><span>{authMode === "register" && accountType === "plumber" ? "Plumber profiles are reviewed before they can accept requests." : "Your account details stay private."}</span></div>
                </>
              ) : user.role !== "customer" ? (
                <div className="customer-state-card">
                  <span className="customer-state-icon"><CircleHelp size={21} /></span>
                  <h2>{user.role === "plumber" ? "Plumber application submitted" : "This workspace is for customers"}</h2>
                  <p>{user.role === "plumber" ? "Your plumber profile is being reviewed. We&apos;ll let you know when it&apos;s ready." : <>You&apos;re signed in with the <strong>{user.role}</strong> role. A separate {user.role} workspace is not available yet.</>}</p>
                  <button className="customer-secondary-button" type="button" onClick={signOut} disabled={busy}>Sign out</button>
                </div>
              ) : plumberApplicationPending ? (
                <div className="customer-state-card">
                  <span className="customer-state-icon"><Wrench size={21} /></span>
                  <h2>Finish your plumber application</h2>
                  <p>Your account is ready. Submit your name to complete the plumber application.</p>
                  <form className="customer-form" onSubmit={retryPlumberApplication}>
                    <label className="customer-field">
                      <span>Name shown to customers</span>
                      <input
                        autoComplete="name"
                        type="text"
                        value={plumberDisplayName}
                        onChange={(event) => setPlumberDisplayName(event.target.value)}
                        minLength={2}
                        maxLength={120}
                        required
                      />
                    </label>
                    <button className="customer-primary-button" type="submit" disabled={busy}>
                      {busy ? "Submitting..." : "Submit application"} <ArrowRight size={16} />
                    </button>
                  </form>
                </div>
              ) : booking ? (
                <div className="customer-booking-result">
                  <div className="booking-result-heading">
                    <span className="booking-status-icon"><Check size={20} /></span>
                    <div><span className="booking-overline">REQUEST #{booking.id.slice(0, 8).toUpperCase()}</span><h2>{statusLabels[booking.status] ?? booking.status.replaceAll("_", " ")}</h2></div>
                  </div>
                  <div className="booking-summary">
                    <span className="booking-summary-category"><Wrench size={14} />{booking.category}</span>
                    <p>{booking.description}</p>
                  </div>
                  <div className="booking-progress-label"><span>Request progress</span><span>Updates appear here</span></div>
                  <div className="customer-progress-track"><span className={booking.status === "no_provider_found" ? "customer-progress-no-match" : ""} /></div>
                  {booking.provider_id && ["accepted", "en_route", "arrived", "inspection", "quote_pending", "quote_approved", "in_progress", "completion_pending"].includes(booking.status) ? (
                    <section className="booking-live-tracking" aria-label="Live plumber location">
                      <div className="booking-live-tracking-heading">
                        <div><strong>Your plumber</strong><small>{providerLocation?.latitude !== null && providerLocation?.latitude !== undefined ? "Live location · refreshes every 5 seconds" : "Waiting for a fresh location update…"}</small></div>
                        {providerLocation?.updated_at ? <span>Updated {new Date(providerLocation.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> : null}
                      </div>
                      <LiveMap
                        className="booking-live-map"
                        center={[booking.latitude, booking.longitude]}
                        points={[
                          { id: "customer", label: "Your location", latitude: booking.latitude, longitude: booking.longitude, kind: "customer" },
                          ...(providerLocation?.latitude !== null && providerLocation?.latitude !== undefined && providerLocation.longitude !== null ? [{
                            id: "assigned-plumber",
                            label: "Your assigned plumber",
                            latitude: providerLocation.latitude,
                            longitude: providerLocation.longitude,
                            kind: "provider" as const,
                          }] : []),
                        ]}
                      />
                      <p>Your plumber&apos;s precise location is shared only with you during this active booking.</p>
                    </section>
                  ) : null}
                  <button className="customer-primary-button" type="button" onClick={refreshBooking} disabled={busy}>
                    {busy ? "Checking request..." : "Refresh status"} <Clock3 size={16} />
                  </button>
                  <button className="customer-text-button" type="button" onClick={() => { setBooking(null); setNotice(""); }}>Create another request</button>
                </div>
              ) : (
                <>
                  <div className="request-panel-heading">
                    <span className="request-panel-icon"><Wrench size={18} /></span>
                    <div><span className="request-overline">NEW SERVICE REQUEST</span><h2>What needs fixing?</h2><p>Share a few details so we can find the right local plumber.</p></div>
                  </div>
                  <form className="customer-form booking-form" onSubmit={handleBooking}>
                    <label className="customer-field">
                      <span>Type of plumbing help</span>
                      <select value={category} onChange={(event) => setCategory(event.target.value)}>
                        {categories.map((item) => <option key={item}>{item}</option>)}
                      </select>
                    </label>
                    <label className="customer-field">
                      <span>Describe the issue</span>
                      <textarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="What happened, and when did you first notice it?"
                        minLength={10}
                        maxLength={2000}
                        rows={4}
                        required
                      />
                      <small className="field-hint">{description.length}/2000 characters</small>
                    </label>
                    <button
                      className={`customer-location-button${location ? " customer-location-ready" : ""}`}
                      type="button"
                      onClick={requestLocation}
                      disabled={busy}
                    >
                      <span className="location-pin-icon">{location ? <Check size={16} /> : <MapPin size={16} />}</span>
                      <span><strong>{location ? "Location added" : "Share your location"}</strong><small>{location ? "Ready to find nearby help" : "Used only to match you with a nearby plumber"}</small></span>
                      <ChevronRight size={16} />
                    </button>
                    <button className="customer-primary-button" type="submit" disabled={busy}>
                      {busy ? "Sending request..." : "Find a plumber"} <ArrowRight size={16} />
                    </button>
                    <p className="quote-disclaimer"><ShieldCheck size={14} />Review and approve any quote before work begins.</p>
                  </form>
                </>
              )}
            </section>

            {user && <aside className="customer-side-panel">
              <div className="customer-side-heading"><span className="customer-side-icon"><ShieldCheck size={17} /></span><div><span>THE PIPEGO PROMISE</span><h2>Clear from start to finish.</h2></div></div>
              <div className="customer-steps">
                <div className="customer-step"><span className="customer-step-number">01</span><div><strong>Tell us what&apos;s wrong</strong><p>Choose a service and describe the issue.</p></div></div>
                <div className="customer-step"><span className="customer-step-number">02</span><div><strong>Get matched nearby</strong><p>We look for an available local plumber.</p></div></div>
                <div className="customer-step"><span className="customer-step-number">03</span><div><strong>Approve before work</strong><p>Review your quote before anything begins.</p></div></div>
              </div>
              <div className="customer-support-card"><CircleHelp size={16} /><div><strong>Need a hand?</strong><span>Our team is here to help with your request.</span><a href="mailto:support@pipego.example">Contact support <ArrowRight size={13} /></a></div></div>
            </aside>}
          </div>

          <footer className="customer-footer">
            <span>© 2026 Pipego</span>
            {user ? <><span><LockKeyhole size={12} />Private, secure, and on your terms</span><Link href="/dashboard">Marketplace preview <ArrowRight size={13} /></Link></> : <button className="customer-signout" type="button" onClick={() => setShowAccount(false)}>Browse plumbers <ArrowRight size={13} /></button>}
            <Link href="/download">Get Android app <ArrowRight size={13} /></Link>
          </footer>
        </div>
      </section>
    </main>
  );
}
