import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import {
  Manrope_400Regular,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import { useCallback, useEffect, useState } from "react";
import DashboardScreen from "./DashboardScreen";
import ProfileScreen from "./ProfileScreen";
import CustomerMapHome from "./CustomerMapHome";
import type { Booking, User } from "./types";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

const TOKEN_KEY = "pipego_access_token";
const PROVIDER_LOCATION_TASK = "pipego-provider-location";
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000").trim().replace(/\/+$/, "");
const categories = ["Blocked drain", "Leaking pipe", "Toilet repair", "Water heater", "Tap or shower", "Other plumbing"];
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

type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string };
type LocationPoint = { latitude: number; longitude: number };
type ProviderLocation = { latitude: number | null; longitude: number | null; updated_at: string | null };
type AccountType = "customer" | "plumber";

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  PROVIDER_LOCATION_TASK,
  async ({ data, error }) => {
    if (error) {
      console.warn("Pipego background location task failed.", error);
      return;
    }
    const latest = data?.locations.at(-1);
    if (!latest) return;
    try {
      const savedToken = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!savedToken) return;
      const response = await fetch(`${API_BASE_URL}/api/v1/providers/me/location`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${savedToken}`,
        },
        body: JSON.stringify({
          latitude: latest.coords.latitude,
          longitude: latest.coords.longitude,
        }),
      });
      if (!response.ok) console.warn("Pipego could not send a background location update.", response.status);
    } catch (reason) {
      console.warn("Pipego could not send a background location update.", reason);
    }
  },
);

async function apiRequest<T>(path: string, token?: string, options?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail =
        typeof payload === "object" && payload !== null && "detail" in payload && typeof payload.detail === "string"
          ? payload.detail
          : "The request could not be completed.";
      return { ok: false, message: detail };
    }
    return { ok: true, data: payload as T };
  } catch {
    return { ok: false, message: "Could not reach the API. Check your connection and API address." };
  }
}

async function sendProviderLocation(token: string, location: LocationPoint) {
  const result = await apiRequest<ProviderLocation>("/api/v1/providers/me/location", token, {
    method: "PUT",
    body: JSON.stringify(location),
  });
  if (!result.ok) throw new Error(result.message);
}

function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  signup = false,
  useSignupFont = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  signup?: boolean;
  useSignupFont?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        signup && styles.signupButton,
        secondary && styles.buttonSecondary,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.buttonText, signup && styles.signupButtonText, secondary && styles.buttonSecondaryText, useSignupFont && styles.manropeBold]}>{title}</Text>
    </Pressable>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const { width } = useWindowDimensions();
  const isMobileLayout = width <= 720;
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [accountType, setAccountType] = useState<AccountType>("customer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [applyingAsProvider, setApplyingAsProvider] = useState(false);
  const [category, setCategory] = useState(categories[0]);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<LocationPoint | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [providerLocation, setProviderLocation] = useState<ProviderLocation | null>(null);
  const [offers, setOffers] = useState<Booking[]>([]);
  const [providerOnline, setProviderOnline] = useState(false);
  const [activeTab, setActiveTab] = useState<"home" | "dashboard" | "profile">("home");
  const [profileEditorAfterSignup, setProfileEditorAfterSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const onProfileEditorOpened = useCallback(() => setProfileEditorAfterSignup(false), []);

  const loadCurrentUser = useCallback(async (accessToken: string) => {
    const result = await apiRequest<User>("/api/v1/users/me", accessToken);
    if (!result.ok) {
      if (result.message === "Invalid or expired access token") {
        if (Platform.OS !== "web") {
          try {
            await stopProviderLocationTracking();
          } catch (reason) {
            console.warn("Pipego could not stop background location after the session expired.", reason);
          }
        }
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        setToken(null);
        setUser(null);
      }
      setError(result.message);
      return false;
    }
    setUser(result.data);
    return true;
  }, []);

  useEffect(() => {
    let mounted = true;
    if (Platform.OS === "web") return;
    SecureStore.getItemAsync(TOKEN_KEY)
      .then((savedToken) => {
        if (!mounted || !savedToken) return;
        setToken(savedToken);
        return loadCurrentUser(savedToken);
      })
      .catch(() => {
        if (mounted) setError("Could not read your secure sign-in. Please sign in again.");
      });
    return () => {
      mounted = false;
    };
  }, [loadCurrentUser]);

  const refreshOffers = useCallback(async () => {
    if (!token) return;
    const result = await apiRequest<Booking[]>("/api/v1/providers/me/offers", token);
    if (result.ok) setOffers(result.data);
    else setError(result.message);
  }, [token]);

  useEffect(() => {
    if (user?.role !== "plumber") return;
    void refreshOffers();
  }, [user?.role, refreshOffers]);

  useEffect(() => {
    if (user?.role !== "plumber" || !token) return;
    let mounted = true;
    void apiRequest<{ is_online: boolean }>("/api/v1/providers/me/availability", token)
      .then((result) => {
        if (!mounted) return;
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setProviderOnline(result.data.is_online);
        if (Platform.OS !== "web" && result.data.is_online) {
          void ensureProviderLocationTracking()
            .then(async () => {
              const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              await sendProviderLocation(token, {
                latitude: current.coords.latitude,
                longitude: current.coords.longitude,
              });
            })
            .catch((reason: unknown) => {
              if (mounted) setError(reason instanceof Error ? reason.message : "Could not restart location sharing.");
            });
        }
      });
    return () => { mounted = false; };
  }, [token, user?.role]);

  useEffect(() => {
    if (Platform.OS !== "web" || user?.role !== "plumber" || !token || !providerOnline) return;
    let mounted = true;
    let latestLocation: LocationPoint | null = null;
    let sending = false;
    let subscription: Location.LocationSubscription | null = null;

    const sendLatestLocation = async () => {
      if (!latestLocation || sending) return;
      sending = true;
      try {
        await sendProviderLocation(token, latestLocation);
      } catch (reason) {
        if (mounted) setError(reason instanceof Error ? reason.message : "Could not update your shared location.");
      } finally {
        sending = false;
      }
    };

    void Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10_000,
        distanceInterval: 15,
      },
      (current) => {
        latestLocation = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        };
      },
    )
      .then((watcher) => {
        if (!mounted) {
          watcher.remove();
          return;
        }
        subscription = watcher;
      })
      .catch((reason: unknown) => {
        if (mounted) {
          setError(reason instanceof Error ? reason.message : "Could not start browser location sharing.");
        }
      });

    const heartbeat = setInterval(() => { void sendLatestLocation(); }, 20_000);
    return () => {
      mounted = false;
      clearInterval(heartbeat);
      subscription?.remove();
    };
  }, [providerOnline, token, user?.role]);

  useEffect(() => {
    if (user?.role !== "customer" || !token || !booking) {
      setProviderLocation(null);
      return;
    }
    let mounted = true;
    const activeStatuses = new Set(["accepted", "en_route", "arrived", "inspection", "quote_pending", "quote_approved", "in_progress", "completion_pending"]);
    const refreshTracking = async () => {
      const bookingResult = await apiRequest<Booking>(`/api/v1/bookings/${encodeURIComponent(booking.id)}`, token);
      if (!bookingResult.ok) {
        if (mounted) setError(bookingResult.message);
        return;
      }
      if (mounted) setBooking(bookingResult.data);
      if (!bookingResult.data.provider_id || !activeStatuses.has(bookingResult.data.status)) {
        if (mounted) setProviderLocation(null);
        return;
      }
      const locationResult = await apiRequest<ProviderLocation>(
        `/api/v1/bookings/${encodeURIComponent(booking.id)}/provider-location`,
        token,
      );
      if (mounted) {
        if (locationResult.ok) setProviderLocation(locationResult.data);
        else setError(locationResult.message);
      }
    };
    void refreshTracking();
    const timer = setInterval(() => { void refreshTracking(); }, 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [booking?.id, token, user?.role]);

  async function authenticate() {
    setBusy(true);
    setError("");
    setNotice("");
    const authPath = authMode === "register" ? "/api/v1/auth/register" : "/api/v1/auth/login";
    const authResult = await apiRequest<User & { access_token?: string; expires_in?: number }>(authPath, undefined, {
      method: "POST",
      body: JSON.stringify({ email: email.trim(), password }),
    });
    if (!authResult.ok) {
      setError(authResult.message);
      setBusy(false);
      return;
    }

    let accessToken: string;
    let authenticatedUser: User;
    const registering = authMode === "register";
    if (registering) {
      const loginResult = await apiRequest<{ access_token: string; expires_in: number }>(
        "/api/v1/auth/login",
        undefined,
        { method: "POST", body: JSON.stringify({ email: email.trim(), password }) },
      );
      if (!loginResult.ok) {
        setError(loginResult.message);
        setBusy(false);
        return;
      }
      accessToken = loginResult.data.access_token;
      authenticatedUser = authResult.data;
    } else {
      if (!("access_token" in authResult.data) || !authResult.data.access_token) {
        setError("The API returned an invalid sign-in response.");
        setBusy(false);
        return;
      }
      accessToken = authResult.data.access_token;
      const current = await apiRequest<User>("/api/v1/users/me", accessToken);
      if (!current.ok) {
        setError(current.message);
        setBusy(false);
        return;
      }
      authenticatedUser = current.data;
    }

    try {
      if (Platform.OS !== "web") {
        await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
      }
      if (registering && accountType === "plumber") {
        const application = await apiRequest<{ status: string; message: string }>("/api/v1/providers/me/apply", accessToken, {
          method: "POST",
          body: JSON.stringify({ display_name: displayName.trim() }),
        });
        if (!application.ok) {
          setToken(accessToken);
          setUser(authenticatedUser);
          setApplyingAsProvider(true);
          setError(`Your account was created, but your plumber application wasn't submitted: ${application.message}`);
          setBusy(false);
          return;
        }
        authenticatedUser = { ...authenticatedUser, role: "plumber" };
      }
      setActiveTab(registering ? "profile" : "home");
      setProfileEditorAfterSignup(registering);
      setToken(accessToken);
      setUser(authenticatedUser);
      setPassword("");
      setApplyingAsProvider(false);
      setNotice(registering
        ? accountType === "plumber"
          ? "Your account is ready. Complete your profile to activate your plumber account automatically."
          : "Account created. Tell us what needs fixing."
        : "Welcome back.");
    } catch {
      setError("Could not save your sign-in securely. Please try again.");
    }
    setBusy(false);
  }

  async function requestLocation() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError("Location permission is needed to match you with a nearby plumber.");
        setBusy(false);
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation({ latitude: current.coords.latitude, longitude: current.coords.longitude });
      setNotice("Location added. It is used only to find nearby help.");
    } catch {
      setError("Could not get your location. Check location services and try again.");
    }
    setBusy(false);
  }

  async function submitBooking() {
    if (!token || !location) {
      setError("Share your location so we can find a nearby plumber.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const result = await apiRequest<Booking>("/api/v1/bookings", token, {
      method: "POST",
      body: JSON.stringify({ category, description: description.trim(), ...location }),
    });
    if (result.ok) {
      setBooking(result.data);
      setDescription("");
      setNotice("Your request has been sent.");
    } else {
      setError(result.message);
    }
    setBusy(false);
  }

  async function refreshBooking() {
    if (!token || !booking) return;
    setBusy(true);
    setError("");
    const result = await apiRequest<Booking>(`/api/v1/bookings/${encodeURIComponent(booking.id)}`, token);
    if (result.ok) setBooking(result.data);
    else setError(result.message);
    setBusy(false);
  }

  async function applyAsProvider() {
    if (!token || displayName.trim().length < 2) {
      setError("Enter your name to apply as a plumber.");
      return;
    }
    setBusy(true);
    setError("");
    const result = await apiRequest<{ message: string }>("/api/v1/providers/me/apply", token, {
      method: "POST",
      body: JSON.stringify({ display_name: displayName.trim() }),
    });
    if (result.ok) {
      setNotice("Application submitted. Sign in again when an administrator verifies your profile.");
      setUser((currentUser) => currentUser ? { ...currentUser, role: "plumber" } : currentUser);
    } else {
      setError(result.message);
    }
    setBusy(false);
  }

  async function toggleAvailability() {
    if (!token) return;
    setBusy(true);
    setError("");
    let nextLocation: LocationPoint | null = null;
    if (!providerOnline) {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          setError("Allow location access to go online and receive nearby offers.");
          setBusy(false);
          return;
        }
        if (Platform.OS !== "web") {
          let backgroundPermission = await Location.getBackgroundPermissionsAsync();
          if (backgroundPermission.status !== "granted") {
            backgroundPermission = await Location.requestBackgroundPermissionsAsync();
          }
          if (backgroundPermission.status !== "granted") {
            setError("Allow background location so customers can see your approximate availability and track you during an active job.");
            setBusy(false);
            return;
          }
        }
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        nextLocation = { latitude: current.coords.latitude, longitude: current.coords.longitude };
      } catch {
        setError("Could not get your location. Check location services and try again.");
        setBusy(false);
        return;
      }
    }
    const result = await apiRequest<{ is_online: boolean }>("/api/v1/providers/me/availability", token, {
      method: "PUT",
      body: JSON.stringify({
        is_online: !providerOnline,
        latitude: nextLocation?.latitude ?? null,
        longitude: nextLocation?.longitude ?? null,
      }),
    });
    if (result.ok) {
      setProviderOnline(result.data.is_online);
      setNotice(result.data.is_online ? "You are online for nearby jobs." : "You are offline.");
      if (result.data.is_online) {
        try {
          if (Platform.OS !== "web") {
            await ensureProviderLocationTracking();
            if (nextLocation) await sendProviderLocation(token, nextLocation);
          }
        } catch (reason) {
          const rollback = await apiRequest<{ is_online: boolean }>("/api/v1/providers/me/availability", token, {
            method: "PUT",
            body: JSON.stringify({ is_online: false, latitude: null, longitude: null }),
          });
          setProviderOnline(false);
          setError(rollback.ok
            ? "Location sharing could not start, so Pipego took you offline. Please try again."
            : `Location sharing could not start, and the server could not confirm you are offline: ${rollback.message}`);
          console.warn("Pipego could not start provider location tracking.", reason);
          setBusy(false);
          return;
        }
        await refreshOffers();
      } else {
        try {
          if (Platform.OS !== "web") await stopProviderLocationTracking();
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "You are offline, but location sharing may not have stopped.");
        }
      }
    } else {
      setError(result.message);
    }
    setBusy(false);
  }

  async function acceptOffer(bookingId: string) {
    if (!token) return;
    setBusy(true);
    setError("");
    const result = await apiRequest<Booking>(`/api/v1/bookings/${encodeURIComponent(bookingId)}/accept`, token, {
      method: "POST",
    });
    if (result.ok) {
      setOffers((current) => current.filter((offer) => offer.id !== bookingId));
      setNotice("Job accepted. Contact the customer through the app once available.");
    } else {
      setError(result.message);
      await refreshOffers();
    }
    setBusy(false);
  }

  async function ensureProviderLocationTracking() {
    const started = await Location.hasStartedLocationUpdatesAsync(PROVIDER_LOCATION_TASK);
    if (started) return;
    const permission = await Location.getBackgroundPermissionsAsync();
    if (permission.status !== "granted") {
      throw new Error("Background location permission is required while you are online.");
    }
    await Location.startLocationUpdatesAsync(PROVIDER_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 10_000,
      distanceInterval: 15,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Pipego location sharing is on",
        notificationBody: "Sharing your location while online for nearby jobs.",
      },
    });
  }

  async function stopProviderLocationTracking() {
    const started = await Location.hasStartedLocationUpdatesAsync(PROVIDER_LOCATION_TASK);
    if (started) await Location.stopLocationUpdatesAsync(PROVIDER_LOCATION_TASK);
  }

  async function signOut() {
    setBusy(true);
    let locationStopError = "";
    try {
      if (Platform.OS !== "web") {
        if (user?.role === "plumber") {
          try {
            await stopProviderLocationTracking();
            if (providerOnline && token) {
              const availability = await apiRequest<{ is_online: boolean }>("/api/v1/providers/me/availability", token, {
                method: "PUT",
                body: JSON.stringify({ is_online: false, latitude: null, longitude: null }),
              });
              if (!availability.ok) locationStopError = availability.message;
            }
          } catch (reason) {
            locationStopError = reason instanceof Error ? reason.message : "Location sharing may not have stopped.";
          }
        }
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      }
      setToken(null);
      setUser(null);
      setBooking(null);
      setProviderLocation(null);
      setOffers([]);
      setProviderOnline(false);
      setActiveTab("home");
      setShowAccount(false);
      setNotice(locationStopError
        ? `You are signed out. Your location sharing stopped on this device, but the server could not confirm you are offline: ${locationStopError}`
        : "You are signed out.");
      setError("");
    } catch {
      setError("Could not clear the secure sign-in. Please try again.");
    }
    setBusy(false);
  }

  function openAccountTab(tab: "dashboard" | "profile") {
    setActiveTab(tab);
    setAuthMode("login");
    setAccountType("customer");
    setShowAccount(true);
    setError("");
    setNotice("");
  }

  if (!user && !showAccount) {
    return (
      <CustomerMapHome
        apiBaseUrl={API_BASE_URL}
        location={location}
        locating={busy}
        error={error}
        onUseLocation={() => { void requestLocation(); }}
        onNavigateBooking={() => openAccountTab("dashboard")}
        onNavigateProfile={() => openAccountTab("profile")}
        onOpenAccount={(mode, selectedCategory, selectedAccountType) => {
          setAuthMode(mode);
          setCategory(selectedCategory);
          setAccountType(selectedAccountType ?? "customer");
          setShowAccount(true);
          setError("");
          setNotice("");
        }}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, !user && styles.authSafeArea, isMobileLayout && styles.mobileSafeArea]}>
      <StatusBar style={isMobileLayout ? "light" : "dark"} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.appHeader, !user && styles.authAppHeader]}>
          <View style={[styles.header, !user && styles.authHeader]}>
            <View
              accessible={!user}
              accessibilityRole={!user ? "image" : undefined}
              accessibilityLabel={!user ? "Pipego logo" : undefined}
              style={[styles.brandMark, !user && styles.authBrandMark]}
            >
              <Text style={[styles.brandLetter, !user && styles.authBrandLetter, !user && fontsLoaded && styles.manropeExtraBold]}>p</Text>
            </View>
            {!user ? <Text style={[styles.brand, styles.authBrand, fontsLoaded && styles.manropeExtraBold]}>pipego</Text> : null}
            {user ? (
              <Pressable onPress={signOut} disabled={busy} accessibilityRole="button" style={styles.signOut}>
                <Text style={styles.signOutText}>Sign out</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => { setShowAccount(false); setError(""); setNotice(""); }} accessibilityRole="button" style={styles.signOut}>
                <Text style={styles.signOutText}>Back to map</Text>
              </Pressable>
            )}
          </View>
          {user && !isMobileLayout ? (
            <View style={styles.tabBar} accessibilityRole="tablist">
              <TabButton label="Home" selected={activeTab === "home"} onPress={() => setActiveTab("home")} />
              <TabButton label={user.role === "customer" ? "My booking" : "Dashboard"} selected={activeTab === "dashboard"} onPress={() => setActiveTab("dashboard")} />
              {(user.role === "customer" || user.role === "plumber") ? (
                <TabButton label="Profile" selected={activeTab === "profile"} onPress={() => setActiveTab("profile")} />
              ) : null}
            </View>
          ) : null}
        </View>

        {user && activeTab === "profile" && token ? (
          <ProfileScreen
            apiBaseUrl={API_BASE_URL}
            token={token}
            onNavigateHome={() => setActiveTab("home")}
            openEditorOnLoad={profileEditorAfterSignup}
            onEditorOpened={onProfileEditorOpened}
          />
        ) : user && activeTab === "dashboard" && token ? (
          <DashboardScreen
            user={user}
            booking={booking}
            providerLocation={providerLocation}
            offers={offers}
            providerOnline={providerOnline}
            busy={busy}
            onNavigateHome={() => setActiveTab("home")}
            onToggleAvailability={toggleAvailability}
            onRefreshOffers={() => void refreshOffers()}
            onAcceptOffer={(bookingId) => void acceptOffer(bookingId)}
          />
        ) : (
          <ScrollView contentContainerStyle={[styles.page, !user && styles.authPage]} keyboardShouldPersistTaps="handled">
            {user ? (
            <View style={styles.hero}>
              <View style={styles.heroArt} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <View style={styles.heroArtOrbit} />
                <View style={styles.heroArtDrop}><Text style={styles.heroArtLetter}>p</Text></View>
                <View style={styles.heroArtDot} />
              </View>
              <View style={styles.heroCopy}>
                <View style={styles.heroEyebrow}><View style={styles.heroEyebrowDot} /><Text style={styles.eyebrow}>PLUMBING HELP, MADE HUMAN</Text></View>
                <Text style={styles.headline}>Good help.{"\n"}<Text style={styles.headlineAccent}>Right on time.</Text></Text>
                <Text style={styles.intro}>Connect with a trusted local plumber, get a clear quote, and decide before work begins.</Text>
                <View style={styles.trustRow}>
                  <Text style={styles.trustPill}>✓  Verified pros</Text>
                  <Text style={styles.trustPill}>✓  Clear quotes</Text>
                </View>
              </View>
            </View>
            ) : null}

            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            {notice ? <Text accessibilityRole="text" style={styles.notice}>{notice}</Text> : null}

            {!user ? (
            <View style={[styles.card, styles.authCard]}>
              <View style={[styles.formHeading, styles.authFormHeading]}>
                <View style={styles.authHeadingRow}>
                  <View style={styles.authHeadingIcon}>
                    <Text style={styles.authHeadingIconText}>{authMode === "login" ? "↗" : "✦"}</Text>
                  </View>
                  <View style={styles.authHeadingCopy}>
                    <View style={styles.authKickerRow}>
                      <View style={styles.authKickerDot} />
                      <Text style={[styles.authKicker, fontsLoaded && styles.manropeBold]}>
                        {authMode === "login" ? accountType === "plumber" ? "PROFESSIONAL LOGIN" : "MEMBER SIGN IN" : accountType === "plumber" ? "PROFESSIONAL ACCOUNT" : "WELCOME TO PIPEGO"}
                      </Text>
                    </View>
                    <Text style={[styles.cardTitle, styles.authTitle, fontsLoaded && styles.manropeExtraBold]}>
                      {authMode === "login" ? accountType === "plumber" ? "Welcome back, pro" : "Welcome back" : accountType === "plumber" ? "Join as a plumber" : "Create your account"}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.formIntro, styles.authIntro, fontsLoaded && styles.manropeRegular]}>
                  {authMode === "login" ? accountType === "plumber" ? "Sign in to manage your professional account." : "Sign in to continue to your account." : accountType === "plumber" ? "Create a professional profile and apply to join our network." : "Find trusted help for your home, all in one place."}
                </Text>
              </View>
              {authMode === "register" ? (
                <>
                  <Text style={[styles.fieldLabel, styles.authFieldLabel, fontsLoaded && styles.manropeBold]}>I’M HERE TO</Text>
                  <View style={[styles.accountChoices, styles.authAccountChoices]}>
                    <AccountTypeButton
                      label="Find a plumber"
                      description="I need home help"
                      selected={accountType === "customer"}
                      useSignupFont={fontsLoaded}
                      onPress={() => { setAccountType("customer"); setError(""); setNotice(""); }}
                    />
                    <AccountTypeButton
                      label="Join as a plumber"
                      description="I’m a plumbing pro"
                      selected={accountType === "plumber"}
                      useSignupFont={fontsLoaded}
                      onPress={() => { setAccountType("plumber"); setError(""); setNotice(""); }}
                    />
                  </View>
                  {accountType === "plumber" ? (
                    <>
                      <Text style={[styles.fieldLabel, styles.authFieldLabel, fontsLoaded && styles.manropeBold]}>NAME SHOWN TO CUSTOMERS</Text>
                      <View style={styles.authInputWrap}>
                        <Text style={styles.authInputIcon}>👤</Text>
                        <TextInput
                          accessibilityLabel="Name shown to customers"
                          style={[styles.input, styles.authInput, fontsLoaded && styles.manropeRegular]}
                          value={displayName}
                          onChangeText={setDisplayName}
                          placeholder="Your name"
                          maxLength={120}
                          autoComplete="name"
                        />
                      </View>
                      <Text style={[styles.authFootnote, fontsLoaded && styles.manropeRegular]}>Complete your profile to activate your plumber account.</Text>
                    </>
                  ) : null}
                </>
              ) : null}
              {authMode === "register" ? (
                <Text style={[styles.fieldLabel, styles.authFieldLabel, styles.authDetailsLabel, fontsLoaded && styles.manropeBold]}>
                  ACCOUNT DETAILS
                </Text>
              ) : null}
              <Text style={[styles.fieldLabel, styles.authFieldLabel, fontsLoaded && styles.manropeBold]}>EMAIL ADDRESS</Text>
              <View style={styles.authInputWrap}>
                <Text style={styles.authInputIcon}>@</Text>
                <TextInput
                  accessibilityLabel="Email address"
                  style={[styles.input, styles.authInput, fontsLoaded && styles.manropeRegular]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                />
              </View>
              <Text style={[styles.fieldLabel, styles.authFieldLabel, fontsLoaded && styles.manropeBold]}>PASSWORD</Text>
              <View style={styles.authInputWrap}>
                <Text style={styles.authInputIcon}>🔒</Text>
                <TextInput
                  accessibilityLabel="Password"
                  style={[styles.input, styles.authInput, fontsLoaded && styles.manropeRegular]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={authMode === "register" ? "Create a password" : "Enter your password"}
                  autoCapitalize="none"
                  autoComplete={authMode === "register" ? "new-password" : "password"}
                  secureTextEntry
                  textContentType={authMode === "register" ? "newPassword" : "password"}
                  maxLength={128}
                />
              </View>
              {authMode === "register" ? <Text style={[styles.passwordHint, styles.authPasswordHint, fontsLoaded && styles.manropeRegular]}>Use at least 12 characters to keep your account secure.</Text> : null}
              <Button
                title={busy ? "Please wait..." : authMode === "login" ? "Sign in  →" : accountType === "plumber" ? "Apply as a plumber  →" : "Create account  →"}
                onPress={authenticate}
                disabled={busy || !email.trim() || password.length < (authMode === "register" ? 12 : 1) ||
                  (authMode === "register" && accountType === "plumber" && displayName.trim().length < 2)}
                signup
                useSignupFont={fontsLoaded}
              />
              <Pressable
                onPress={() => {
                  setAuthMode(authMode === "register" ? "login" : "register");
                  setError("");
                  setNotice("");
                  setApplyingAsProvider(false);
                }}
                style={styles.switchAuth}
              >
                <Text style={[styles.switchAuthText, styles.authSwitchAuthText, fontsLoaded && styles.manropeBold]}>
                  {authMode === "register" ? "Already have an account? Sign in" : "New to Pipego? Create an account"}
                </Text>
              </Pressable>
              <View style={styles.authPrivacy}><Text style={styles.privacyLock}>🔒</Text><Text style={[styles.authPrivacyText, fontsLoaded && styles.manropeRegular]}>Your account details stay private.</Text></View>
            </View>
            ) : user.role === "customer" ? (
            <View style={styles.card}>
              {applyingAsProvider ? (
                <>
                  <Text style={styles.cardKicker}>PLUMBER APPLICATION</Text>
                  <Text style={styles.cardTitle}>Work with Pipego</Text>
                  <Text style={styles.bookingDescription}>
                    Complete your profile to activate your plumber account automatically, then go online to receive nearby requests.
                  </Text>
                  <TextInput
                    accessibilityLabel="Your name"
                    style={styles.input}
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Your name"
                    maxLength={120}
                    autoComplete="name"
                  />
                  <Button
                    title={busy ? "Submitting..." : "Apply as a plumber"}
                    onPress={applyAsProvider}
                    disabled={busy || displayName.trim().length < 2}
                  />
                  <Button
                    title="Back to customer requests"
                    onPress={() => setApplyingAsProvider(false)}
                    secondary
                    disabled={busy}
                  />
                </>
              ) : booking ? (
                <>
                  <Text style={styles.cardKicker}>YOUR REQUEST</Text>
                  <Text style={styles.cardTitle}>{statusLabels[booking.status] ?? booking.status.replaceAll("_", " ")}</Text>
                  <Text style={styles.bookingDescription}>{booking.category} · {booking.description}</Text>
                  <Text style={styles.bookingId}>Request {booking.id.slice(0, 8).toUpperCase()}</Text>
                  <Button title={busy ? "Checking..." : "Refresh request"} onPress={refreshBooking} disabled={busy} />
                  <Button
                    title="Make another request"
                    secondary
                    onPress={() => { setBooking(null); setNotice(""); }}
                    disabled={busy}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.cardKicker}>YOUR HOME, IN GOOD HANDS</Text>
                  <Text style={styles.cardTitle}>What needs fixing?</Text>
                  <Text style={styles.fieldLabel}>Choose a service</Text>
                  <View style={styles.categoryGrid}>
                    {categories.map((item) => (
                      <Pressable
                        key={item}
                        onPress={() => setCategory(item)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: category === item }}
                        style={[styles.category, category === item && styles.categorySelected]}
                      >
                        <Text style={[styles.categoryText, category === item && styles.categoryTextSelected]}>{item}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.fieldLabel}>Describe the issue</Text>
                  <TextInput
                    accessibilityLabel="Describe the plumbing issue"
                    style={[styles.input, styles.multiline]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="What happened and when did you notice it?"
                    multiline
                    maxLength={2000}
                    textAlignVertical="top"
                  />
                  <Pressable
                    style={[styles.locationButton, location && styles.locationReady]}
                    onPress={requestLocation}
                    disabled={busy}
                    accessibilityRole="button"
                  >
                    <Text style={styles.locationIcon}>{location ? "✓" : "⌖"}</Text>
                    <View style={styles.locationCopy}>
                      <Text style={styles.locationTitle}>{location ? "Location added" : "Share my location"}</Text>
                      <Text style={styles.locationSub}>{location ? "Ready to find nearby help" : "Used to match a nearby plumber"}</Text>
                    </View>
                  </Pressable>
                  <Button
                    title={busy ? "Sending request..." : "Find me a plumber  →"}
                    onPress={submitBooking}
                    disabled={busy || description.trim().length < 10 || !location}
                  />
                  <Text style={styles.smallNote}>No commitment. Review any quote before work begins.</Text>
                  <Pressable
                    onPress={() => setApplyingAsProvider(true)}
                    style={styles.switchAuth}
                    accessibilityRole="button"
                  >
                    <Text style={styles.switchAuthText}>Are you a plumber? Apply to join Pipego</Text>
                  </Pressable>
                </>
              )}
            </View>
            ) : user.role === "plumber" ? (
            <View style={styles.card}>
              <Text style={styles.cardKicker}>PROVIDER WORKSPACE</Text>
              <Text style={styles.cardTitle}>Nearby job offers</Text>
              <Text style={styles.bookingDescription}>
                Complete your profile to activate your plumber account, then go online to receive nearby requests.
              </Text>
              <Button
                title={providerOnline ? "Go offline" : "Go online"}
                onPress={toggleAvailability}
                disabled={busy}
                secondary={providerOnline}
              />
              <Button title="Refresh offers" onPress={refreshOffers} disabled={busy} secondary />
              {offers.length ? offers.map((offer) => (
                <View key={offer.id} style={styles.offerCard}>
                  <Text style={styles.offerCategory}>{offer.category}</Text>
                  <Text style={styles.bookingDescription}>{offer.description}</Text>
                  {offer.offer_expires_at ? (
                    <Text style={styles.bookingId}>
                      Offer expires {new Date(offer.offer_expires_at).toLocaleTimeString()}
                    </Text>
                  ) : null}
                  <Button title="Accept job" onPress={() => acceptOffer(offer.id)} disabled={busy} />
                </View>
              )) : <Text style={styles.emptyOffers}>No active offers right now.</Text>}
            </View>
            ) : (
            <View style={styles.card}>
              <Text style={styles.cardKicker}>PIPEGO WORKSPACE</Text>
              <Text style={styles.cardTitle}>{user.role === "admin" ? "Admin dashboard is ready" : "Workspace overview"}</Text>
              <Text style={styles.bookingDescription}>
                Your {user.role} workspace is available from the Dashboard tab.
              </Text>
              <Button title="Open dashboard" onPress={() => setActiveTab("dashboard")} />
            </View>
            )}

            <View style={styles.promise}>
              <Text style={styles.promiseIcon}>✳</Text>
              <Text style={styles.promiseText}>Verified local pros · Clear quotes · Your call before work begins</Text>
            </View>
            <Text style={styles.footer}>Plumbing help, made human.</Text>
          </ScrollView>
        )}
        {isMobileLayout ? (
          <View style={styles.mobileTabBar} accessibilityRole="tablist">
            <MobileTabButton
              label="Home"
              icon="⌂"
              selected={!user || activeTab === "home"}
              onPress={() => {
                if (user) setActiveTab("home");
                else {
                  setShowAccount(false);
                  setError("");
                  setNotice("");
                }
              }}
            />
            <MobileTabButton
              label={user?.role === "customer" || !user ? "My booking" : "Dashboard"}
              icon="▤"
              selected={user ? activeTab === "dashboard" : false}
              onPress={() => {
                if (user) setActiveTab("dashboard");
                else openAccountTab("dashboard");
              }}
            />
            {(!user || user.role === "customer" || user.role === "plumber") ? (
              <MobileTabButton
                label="Profile"
                icon="◉"
                selected={!!user && activeTab === "profile"}
                onPress={() => {
                  if (user) setActiveTab("profile");
                  else openAccountTab("profile");
                }}
              />
            ) : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TabButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.tab, selected && styles.tabSelected]}
    >
      <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function MobileTabButton({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.mobileTab}
    >
      <Text style={[styles.mobileTabIcon, selected && styles.mobileTabSelected]}>{icon}</Text>
      <Text style={[styles.mobileTabText, selected && styles.mobileTabSelected]}>{label}</Text>
    </Pressable>
  );
}

function AccountTypeButton({
  label,
  description,
  selected,
  onPress,
  useSignupFont,
}: {
  label: string;
  description: string;
  selected: boolean;
  onPress: () => void;
  useSignupFont: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.accountChoice, styles.authAccountChoice, selected && styles.authAccountChoiceSelected]}
    >
      <View style={styles.accountChoiceCopy}>
        <Text style={[styles.accountChoiceTitle, styles.authAccountChoiceTitle, selected && styles.authAccountChoiceTitleSelected, useSignupFont && styles.manropeBold]}>{label}</Text>
        <Text style={[styles.accountChoiceDescription, useSignupFont && styles.manropeRegular]}>{description}</Text>
      </View>
      {selected ? <Text style={styles.authAccountChoiceCheck}>✓</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: "#f0f3eb" },
  authSafeArea: { backgroundColor: "#f3f6fb" },
  mobileSafeArea: { backgroundColor: "#2563eb" },
  appHeader: { paddingHorizontal: 22, backgroundColor: "#fbfcf9", borderBottomWidth: 1, borderBottomColor: "#e7ebe4" },
  authAppHeader: { paddingHorizontal: 20, backgroundColor: "#fff", borderBottomColor: "#e6edf5" },
  page: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 28 },
  authPage: { width: "100%", maxWidth: 520, alignSelf: "center", justifyContent: "center", paddingHorizontal: 16, paddingTop: 18, paddingBottom: 28 },
  header: { height: 62, flexDirection: "row", alignItems: "center", gap: 9 },
  authHeader: { height: 62 },
  tabBar: { flexDirection: "row", gap: 7, paddingBottom: 10 },
  mobileTabBar: { height: 68, flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 10, paddingBottom: Platform.OS === "ios" ? 8 : 4, borderTopWidth: 1, borderTopColor: "#194eb5", backgroundColor: "#2563eb" },
  mobileTab: { flex: 1, height: 54, alignItems: "center", justifyContent: "center", gap: 3 },
  mobileTabIcon: { color: "#dbeafe", fontSize: 18, lineHeight: 22 },
  mobileTabText: { color: "#dbeafe", fontSize: 11, fontWeight: "800" },
  mobileTabSelected: { color: "#fff", fontWeight: "900" },
  tab: { flex: 1, minHeight: 37, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  tabSelected: { backgroundColor: "#eaf1e4" },
  tabText: { color: "#75827b", fontSize: 13, fontWeight: "700" },
  tabTextSelected: { color: "#235b4b", fontWeight: "800" },
  brandMark: { width: 30, height: 30, borderRadius: 10, borderBottomLeftRadius: 3, backgroundColor: "#235b4b", alignItems: "center", justifyContent: "center" },
  authBrandMark: { backgroundColor: "#0866f5" },
  brandLetter: { color: "#fff", fontSize: 21, fontWeight: "800", marginTop: -2 },
  authBrandLetter: { fontSize: 21 },
  brand: { color: "#18332e", fontSize: 22, fontWeight: "800", letterSpacing: -1 },
  authBrand: { color: "#12243c" },
  manropeRegular: { fontFamily: "Manrope_400Regular" },
  manropeSemiBold: { fontFamily: "Manrope_600SemiBold" },
  manropeBold: { fontFamily: "Manrope_700Bold" },
  manropeExtraBold: { fontFamily: "Manrope_800ExtraBold" },
  signOut: { marginLeft: "auto", padding: 10 },
  signOutText: { color: "#0866f5", fontSize: 14, fontWeight: "800" },
  hero: { minHeight: 270, overflow: "hidden", justifyContent: "center", marginTop: 18, marginBottom: 20, paddingHorizontal: 20, paddingVertical: 22, borderWidth: 1, borderColor: "#e4eae1", borderRadius: 18, backgroundColor: "#fbfcf9", shadowColor: "#1f392f", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.035, shadowRadius: 14, elevation: 1 },
  heroCopy: { zIndex: 1, maxWidth: 360 },
  heroEyebrow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 13 },
  heroEyebrowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#8baa45" },
  eyebrow: { color: "#668176", fontSize: 11, fontWeight: "800", letterSpacing: 1.05 },
  headline: { color: "#18332e", fontSize: 41, fontWeight: "800", letterSpacing: -2.2, lineHeight: 45 },
  headlineAccent: { color: "#235b4b" },
  intro: { maxWidth: 290, marginTop: 12, color: "#65736d", fontSize: 15, lineHeight: 23 },
  heroArt: { position: "absolute", top: 10, right: 6, width: 116, height: 120, alignItems: "center", justifyContent: "center", opacity: 0.78 },
  heroArtOrbit: { position: "absolute", width: 108, height: 108, borderWidth: 1, borderColor: "#e2ead8", borderRadius: 54, backgroundColor: "#f3f7ec" },
  heroArtDrop: { width: 58, height: 66, alignItems: "center", justifyContent: "center", borderRadius: 22, borderBottomLeftRadius: 7, backgroundColor: "#235b4b", transform: [{ rotate: "45deg" }] },
  heroArtLetter: { color: "#fff", fontSize: 33, fontWeight: "800", transform: [{ rotate: "-45deg" }] },
  heroArtDot: { position: "absolute", right: 9, bottom: 13, width: 15, height: 15, borderWidth: 3, borderColor: "#fbfcf9", borderRadius: 8, backgroundColor: "#b8d57a" },
  trustRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 15 },
  trustPill: { paddingHorizontal: 10, paddingVertical: 7, overflow: "hidden", borderWidth: 1, borderColor: "#e4eade", borderRadius: 14, backgroundColor: "#f2f6eb", color: "#466052", fontSize: 11, fontWeight: "800" },
  card: { padding: 18, borderWidth: 1, borderColor: "#e1e7df", borderRadius: 14, backgroundColor: "#fff", shadowColor: "#1f392f", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.045, shadowRadius: 14, elevation: 2 },
  authCard: { marginTop: 4, padding: 21, borderWidth: 1, borderTopWidth: 4, borderColor: "#e1e9f4", borderTopColor: "#0866f5", borderRadius: 23, backgroundColor: "#fff", shadowColor: "#173a67", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.09, shadowRadius: 24, elevation: 5 },
  formHeading: { marginBottom: 15 },
  authFormHeading: { alignItems: "flex-start", marginBottom: 20 },
  authHeadingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  authHeadingIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#0866f5", shadowColor: "#0866f5", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 2 },
  authHeadingIconText: { color: "#fff", fontSize: 25, fontWeight: "800" },
  authHeadingCopy: { flex: 1, gap: 3 },
  authKickerRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  authKickerDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#86a943" },
  authKicker: { color: "#0866f5", fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  cardKicker: { color: "#84928b", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  cardTitle: { marginTop: 6, color: "#18332e", fontSize: 23, fontWeight: "800", letterSpacing: -0.45 },
  authTitle: { marginTop: 1, color: "#12243c", fontSize: 28, lineHeight: 36, letterSpacing: -0.7 },
  formIntro: { marginTop: 5, color: "#78857e", fontSize: 13, lineHeight: 19 },
  authIntro: { marginTop: 14, color: "#586b84", fontSize: 15, lineHeight: 23 },
  accountChoices: { gap: 8, marginBottom: 14 },
  authAccountChoices: { flexDirection: "row", gap: 9, marginBottom: 17 },
  accountChoice: { minHeight: 60, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1, borderColor: "#e5e9e2", borderRadius: 10, backgroundColor: "#fcfdfb" },
  authAccountChoice: { flex: 1, minHeight: 94, alignItems: "flex-start", paddingHorizontal: 12, paddingVertical: 13, borderColor: "#dfe7f0", borderRadius: 15, backgroundColor: "#fbfcfe" },
  authAccountChoiceSelected: { borderColor: "#0866f5", backgroundColor: "#f2f7ff", shadowColor: "#0866f5", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 1 },
  accountChoiceCopy: { flex: 1, gap: 4 },
  accountChoiceTitle: { color: "#455950", fontSize: 14, fontWeight: "700" },
  authAccountChoiceTitle: { color: "#263b56", fontSize: 15, lineHeight: 21, fontWeight: "700" },
  authAccountChoiceTitleSelected: { color: "#0866f5", fontWeight: "800" },
  accountChoiceDescription: { color: "#64758a", fontSize: 12, lineHeight: 18 },
  authAccountChoiceCheck: { color: "#0866f5", fontSize: 16, fontWeight: "800" },
  authSteps: { marginBottom: 12, paddingHorizontal: 11, paddingVertical: 10, borderRadius: 10, backgroundColor: "#f7f9f4" },
  authFootnote: { marginTop: -5, marginBottom: 13, color: "#6c7b90", fontSize: 14, lineHeight: 21 },
  authHint: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 7 },
  authHintNumber: { color: "#7b9650", fontSize: 12, fontWeight: "800" },
  authHintText: { flex: 1, color: "#65736d", fontSize: 12, lineHeight: 18 },
  input: { minHeight: 52, marginBottom: 12, paddingHorizontal: 13, paddingVertical: 12, borderWidth: 1, borderColor: "#dfe7f0", borderRadius: 7, backgroundColor: "#fff", color: "#263b56", fontSize: 16 },
  authInput: { flex: 1, minHeight: 56, marginBottom: 0, paddingHorizontal: 4, borderWidth: 0, borderRadius: 10, backgroundColor: "transparent", color: "#1c304b", fontSize: 16 },
  passwordHint: { marginTop: -5, marginBottom: 2, color: "#66756d", fontSize: 12, lineHeight: 17 },
  authPasswordHint: { marginTop: -4, marginBottom: 3, color: "#586b84", fontSize: 13, lineHeight: 19 },
  authPrivacy: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#edf1f7" },
  privacyLock: { color: "#0866f5", fontSize: 12, fontWeight: "800" },
  authPrivacyText: { color: "#586b84", fontSize: 12, fontWeight: "600" },
  multiline: { minHeight: 98, marginTop: 7 },
  button: { minHeight: 48, marginTop: 8, paddingHorizontal: 15, borderRadius: 7, backgroundColor: "#0866f5", alignItems: "center", justifyContent: "center" },
  signupButton: { minHeight: 56, marginTop: 10, borderRadius: 15, shadowColor: "#0866f5", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 3 },
  signupButtonText: { fontSize: 17, fontWeight: "800" },
  buttonSecondary: { borderWidth: 1, borderColor: "#d5e3f7", backgroundColor: "#eff5ff" },
  buttonDisabled: { opacity: 0.48 },
  buttonPressed: { opacity: 0.83 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  buttonSecondaryText: { color: "#0866f5" },
  switchAuth: { paddingVertical: 15, alignItems: "center" },
  switchAuthText: { color: "#0866f5", fontSize: 14, fontWeight: "700" },
  authSwitchAuthText: { fontSize: 15, fontWeight: "800" },
  error: { marginBottom: 12, padding: 12, overflow: "hidden", borderWidth: 1, borderColor: "#f1d1cc", borderRadius: 7, backgroundColor: "#fff7f5", color: "#9b3e31", fontSize: 13, lineHeight: 19 },
  notice: { marginBottom: 12, padding: 12, borderWidth: 1, borderColor: "#d9e8c7", borderRadius: 7, backgroundColor: "#f6faef", color: "#436537", fontSize: 13, lineHeight: 19 },
  fieldLabel: { marginBottom: 7, color: "#60728a", fontSize: 12, fontWeight: "800", letterSpacing: 0.35 },
  authFieldLabel: { marginBottom: 8, color: "#405570", fontSize: 13, fontWeight: "800", letterSpacing: 0.45 },
  authDetailsLabel: { marginTop: 1, marginBottom: 14, paddingTop: 13, borderTopWidth: 1, borderTopColor: "#edf1f7", color: "#415670", fontSize: 11, fontWeight: "800", letterSpacing: 0.7 },
  authInputWrap: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 15, paddingHorizontal: 13, borderWidth: 1, borderColor: "#dfe7f2", borderRadius: 14, backgroundColor: "#f8fafd" },
  authInputIcon: { width: 30, height: 30, overflow: "hidden", borderRadius: 10, backgroundColor: "#eaf2ff", color: "#0866f5", fontSize: 16, fontWeight: "800", lineHeight: 30, textAlign: "center" },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 17 },
  category: { minHeight: 34, justifyContent: "center", paddingHorizontal: 10, borderWidth: 1, borderColor: "#e1e7df", borderRadius: 20, backgroundColor: "#fcfdfb" },
  categorySelected: { borderColor: "#b7c999", backgroundColor: "#f0f5e8" },
  categoryText: { color: "#65736d", fontSize: 12, fontWeight: "700" },
  categoryTextSelected: { color: "#235b4b", fontWeight: "800" },
  locationButton: { minHeight: 56, marginTop: 2, marginBottom: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: "#e1e7df", borderRadius: 7, backgroundColor: "#fcfdfb", flexDirection: "row", alignItems: "center", gap: 11 },
  locationReady: { borderColor: "#cedeb9", backgroundColor: "#f7faef" },
  locationIcon: { color: "#235b4b", fontSize: 19, fontWeight: "700" },
  locationCopy: { flex: 1 },
  locationTitle: { color: "#445950", fontSize: 13, fontWeight: "800" },
  locationSub: { marginTop: 3, color: "#75827b", fontSize: 12 },
  smallNote: { marginTop: 12, color: "#718078", fontSize: 12, lineHeight: 18, textAlign: "center" },
  bookingDescription: { marginBottom: 10, color: "#65736d", fontSize: 15, lineHeight: 22 },
  bookingId: { marginBottom: 12, color: "#718078", fontSize: 12, fontWeight: "600" },
  offerCard: { marginTop: 13, padding: 14, borderWidth: 1, borderColor: "#e4e9e1", borderRadius: 8, backgroundColor: "#fcfdfb" },
  offerCategory: { marginBottom: 7, color: "#304b42", fontSize: 15, fontWeight: "800" },
  emptyOffers: { paddingVertical: 20, color: "#718078", fontSize: 14, fontWeight: "600", textAlign: "center" },
  promise: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 24, paddingHorizontal: 4 },
  promiseIcon: { color: "#7f9c52", fontSize: 17 },
  promiseText: { flexShrink: 1, color: "#65736d", fontSize: 12, lineHeight: 18, fontWeight: "600", textAlign: "center" },
  footer: { marginTop: 23, color: "#75827b", fontSize: 12, textAlign: "center" },
});
