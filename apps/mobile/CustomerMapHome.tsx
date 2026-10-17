import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import LiveMap, { type MapPoint } from "./LiveMap";

type Coordinates = { latitude: number; longitude: number };
type ServiceProvider = {
  id: string;
  display_name: string;
  bio: string | null;
  profile_image_data: string | null;
  service_county: string | null;
  service_location: string | null;
  services_offered?: string[];
  years_experience: number | null;
  distance_km: number | null;
  approximate_latitude?: number;
  approximate_longitude?: number;
};

const services = [
  "Blocked drain",
  "Leaking pipe",
  "Toilet repair",
  "Water heater",
  "Tap or shower",
  "Other plumbing",
];

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("");
}

export default function CustomerMapHome({
  apiBaseUrl,
  location,
  locating,
  error,
  onUseLocation,
  onOpenAccount,
  onNavigateBooking,
  onNavigateProfile,
}: {
  apiBaseUrl: string;
  location: Coordinates | null;
  locating: boolean;
  error: string;
  onUseLocation: () => void;
  onOpenAccount: (mode: "login" | "register", category: string, accountType?: "customer" | "plumber") => void;
  onNavigateBooking: () => void;
  onNavigateProfile: () => void;
}) {
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [category, setCategory] = useState(services[0]);
  const [serviceMenuOpen, setServiceMenuOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { width } = useWindowDimensions();

  useEffect(() => {
    const controller = new AbortController();
    const query = location
      ? `?latitude=${encodeURIComponent(location.latitude)}&longitude=${encodeURIComponent(location.longitude)}`
      : "";
    setLoading(true);
    fetch(`${apiBaseUrl}/api/v1/providers/discover${query}`, { signal: controller.signal })
      .then(async (response) => {
        const result: unknown = await response.json();
        if (!response.ok || !Array.isArray(result)) {
          const detail =
            typeof result === "object" && result !== null && "detail" in result && typeof result.detail === "string"
              ? result.detail
              : "Unable to load available plumbers.";
          throw new Error(detail);
        }
        setProviders(result as ServiceProvider[]);
        setLoadError("");
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setProviders([]);
          setLoadError(reason instanceof Error ? reason.message : "Unable to load available plumbers.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [apiBaseUrl, location, refreshIndex]);

  useEffect(() => {
    const timer = setInterval(() => setRefreshIndex((index) => index + 1), 10_000);
    return () => clearInterval(timer);
  }, []);

  function book() {
    onOpenAccount("register", category);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={width <= 720 ? "light" : "dark"} />
      <View style={styles.screen}>
        {width > 720 ? (
          <>
            <View style={styles.header}>
              <Pressable style={styles.menuButton} onPress={() => setMenuOpen((open) => !open)} accessibilityRole="button" accessibilityLabel="Open menu">
                <View style={styles.menuLine} />
                <View style={styles.menuLine} />
                <View style={styles.menuLine} />
              </Pressable>
              <View style={styles.brandMark}><Text style={styles.brandDrop}>p</Text></View>
              <View style={styles.brandCopy}>
                <Text style={styles.brandName}>pipego</Text>
                <Text style={styles.brandTagline}>Reliable plumbers. Near you.</Text>
              </View>
            </View>
            <View style={styles.accountBar}>
              <Text style={styles.accountBarLabel}>For plumbing professionals</Text>
              <View style={styles.accountActions}>
                <Pressable style={styles.loginButton} onPress={() => onOpenAccount("login", category, "plumber")} accessibilityRole="button">
                  <Text style={styles.loginText}>Professional login</Text>
                </Pressable>
                <Pressable style={styles.signupButton} onPress={() => onOpenAccount("register", category)} accessibilityRole="button">
                  <Text style={styles.signupText}>Create account</Text>
                </Pressable>
              </View>
            </View>
            {menuOpen ? (
              <View style={styles.navigationMenu}>
                <Pressable style={styles.navigationItem} onPress={() => { setMenuOpen(false); onOpenAccount("register", category, "plumber"); }}>
                  <Text style={styles.navigationText}>Join as a plumber</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : (
          <View style={[styles.accountBar, styles.mobileAccountBar]}>
            <View style={[styles.accountActions, styles.mobileAccountActions]}>
              <Pressable style={[styles.loginButton, styles.mobileAccountButton]} onPress={() => onOpenAccount("login", category)} accessibilityRole="button">
                <Text style={styles.loginText}>Log in</Text>
              </Pressable>
              <Pressable style={[styles.signupButton, styles.mobileAccountButton]} onPress={() => onOpenAccount("register", category)} accessibilityRole="button">
                <Text style={styles.signupText}>Create account</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.mapRegion}>
          <LiveMap
            center={location ?? { latitude: -1.2864, longitude: 36.8172 }}
            points={[
              ...(location ? [{ id: "customer", label: "Your location", ...location, kind: "customer" as const }] : []),
              ...providers.flatMap((provider): MapPoint[] =>
                provider.approximate_latitude === undefined || provider.approximate_longitude === undefined
                  ? []
                  : [{
                    id: provider.id,
                    label: `${provider.display_name} · approximate location`,
                    latitude: provider.approximate_latitude,
                    longitude: provider.approximate_longitude,
                    kind: "provider",
                  }],
              ),
            ]}
          />

          <View style={styles.mapSearches}>
            <Pressable style={styles.locationSearch} onPress={onUseLocation} disabled={locating} accessibilityRole="button">
              <Text style={styles.locationIcon}>●</Text>
              <Text style={styles.locationText}>{locating ? "Finding your location..." : location ? "Your location" : "Nairobi, Kenya"}</Text>
              <Text style={styles.chevron}>⌄</Text>
            </Pressable>
            <Pressable style={styles.serviceSearch} onPress={() => setServiceMenuOpen((open) => !open)} accessibilityRole="button">
              <Text style={styles.searchIcon}>⌕</Text>
              <Text style={styles.serviceText} numberOfLines={1}>{category || "What type of plumbing service do you need?"}</Text>
              <Text style={styles.chevron}>⌄</Text>
            </Pressable>
            {serviceMenuOpen ? (
              <View style={styles.serviceMenu}>
                <ScrollView keyboardShouldPersistTaps="handled">
                  {services.map((service) => (
                    <Pressable
                      key={service}
                      style={styles.serviceOption}
                      onPress={() => { setCategory(service); setServiceMenuOpen(false); }}
                    >
                      <Text style={[styles.serviceOptionText, category === service && styles.selectedService]}>{service}</Text>
                      {category === service ? <Text style={styles.checkmark}>✓</Text> : null}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </View>

          <View pointerEvents="none" style={styles.youHereLabel}><Text style={styles.youHereText}>{location ? "You are here" : "Nairobi"}</Text></View>
          {providers[0] ? (
            <View style={styles.mapProviderHint}>
              <Text style={styles.mapHintIcon}>✓</Text>
              <View style={styles.mapHintCopy}>
                <Text style={styles.mapHintTitle}>Available nearby</Text>
                <Text style={styles.mapHintSubtitle}>Verified plumber</Text>
              </View>
            </View>
          ) : null}

          <Pressable style={styles.recenterButton} onPress={onUseLocation} disabled={locating} accessibilityRole="button" accessibilityLabel="Use my location">
            <Text style={styles.recenterIcon}>◎</Text>
          </Pressable>

          <View style={styles.providersSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeading}>
              <View style={styles.sheetHeadingCopy}>
                <Text style={styles.sheetTitle}>Available plumbers near you</Text>
                <Text style={styles.sheetSubtitle}>Verified plumbers currently online.</Text>
              </View>
              <Pressable
                style={styles.filterButton}
                onPress={() => setFilterMenuOpen((open) => !open)}
                accessibilityRole="button"
                accessibilityState={{ selected: filterMenuOpen }}
              >
                <Text style={styles.filterGlyph}>☷</Text>
                <Text style={styles.filterText}>Filter</Text>
              </Pressable>
            </View>
            {filterMenuOpen ? (
              <View style={styles.filterMenu}>
                <Text style={styles.filterMenuTitle}>Availability</Text>
                <Pressable style={styles.filterChoice} onPress={() => { setFilterMenuOpen(false); if (!location) onUseLocation(); }}>
                  <Text style={styles.filterChoiceText}>Sort by distance</Text>
                  <Text style={styles.filterCheck}>{location ? "✓" : "›"}</Text>
                </Pressable>
                <Text style={styles.filterNote}>{location ? "Nearby plumbers are shown first." : "Share your location to find nearby pros."}</Text>
              </View>
            ) : null}
            {error ? <Text accessibilityRole="alert" style={styles.inlineError}>{error}</Text> : null}
            {loadError ? (
              <View style={styles.emptyState}>
                <Text style={styles.inlineError}>{loadError}</Text>
                <Pressable
                  style={[styles.bookButton, styles.emptyAction]}
                  onPress={() => { setLoading(true); setRefreshIndex((index) => index + 1); }}
                  accessibilityRole="button"
                >
                  <Text style={styles.bookButtonText}>Try again</Text>
                </Pressable>
              </View>
            ) : loading && providers.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Finding plumbers who are online…</Text>
              </View>
            ) : providers.length ? (
              <ScrollView style={styles.providerList} contentContainerStyle={styles.providerListContent} showsVerticalScrollIndicator={false}>
                {providers.map((provider) => (
                  <View key={provider.id} style={styles.providerCard}>
                    <View style={styles.providerImageWrap}>
                      {provider.profile_image_data ? (
                        <Image source={{ uri: provider.profile_image_data }} style={styles.providerImage} />
                      ) : (
                        <View style={styles.providerInitials}><Text style={styles.initialsText}>{initials(provider.display_name) || "P"}</Text></View>
                      )}
                      <View style={styles.verifiedBadge}><Text style={styles.verifiedCheck}>✓</Text></View>
                    </View>
                    <View style={styles.providerInfo}>
                      <Text style={styles.providerName} numberOfLines={1}>{provider.display_name}</Text>
                      <Text style={styles.providerRole} numberOfLines={1}>{provider.bio || "Verified plumber"}</Text>
                      {provider.services_offered?.length ? <Text style={styles.providerServices} numberOfLines={1}>{provider.services_offered.join(" · ")}</Text> : null}
                      <Text style={styles.providerDistance} numberOfLines={1}>
                        ⌖  {provider.distance_km !== null ? `${provider.distance_km} km · Near you` : [provider.service_location, provider.service_county].filter(Boolean).join(", ") || "Local service area"}
                      </Text>
                    </View>
                    <View style={styles.providerAction}>
                      <View style={styles.availablePill}><View style={styles.availableDot} /><Text style={styles.availableText}>Available now</Text></View>
                      {provider.years_experience !== null ? <Text style={styles.experienceText}>{provider.years_experience} yrs exp.</Text> : null}
                      <Pressable style={styles.bookButton} onPress={book} accessibilityRole="button">
                        <Text style={styles.bookButtonText}>Book now</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No plumbers are online right now. Verified plumbers appear here when they complete their profile and go online.</Text>
                <Pressable
                  style={[styles.bookButton, styles.emptyAction]}
                  onPress={() => onOpenAccount("register", category, "plumber")}
                  accessibilityRole="button"
                >
                  <Text style={styles.bookButtonText}>Join as a plumber</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
        {width <= 720 ? (
          <View style={styles.bottomNav} accessibilityRole="tablist">
            <BottomNavButton label="Home" icon="⌂" selected onPress={() => {}} />
            <BottomNavButton label="My booking" icon="▤" onPress={onNavigateBooking} />
            <BottomNavButton label="Profile" icon="◉" onPress={onNavigateProfile} />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function BottomNavButton({
  label,
  icon,
  selected = false,
  onPress,
}: {
  label: string;
  icon: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.bottomNavItem}
    >
      <Text style={[styles.bottomNavIcon, selected && styles.bottomNavSelected]}>{icon}</Text>
      <Text style={[styles.bottomNavLabel, selected && styles.bottomNavSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#2563eb" },
  screen: { flex: 1, backgroundColor: "#eef1ef" },
  header: { zIndex: 10, height: 58, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8, backgroundColor: "#fff" },
  menuButton: { width: 24, height: 34, justifyContent: "center", gap: 4 },
  menuLine: { width: 19, height: 2, borderRadius: 2, backgroundColor: "#1d2e45" },
  brandMark: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, borderBottomLeftRadius: 5, backgroundColor: "#0866f5" },
  brandDrop: { color: "#fff", fontSize: 22, fontWeight: "900" },
  brandCopy: { flex: 1, justifyContent: "center" },
  brandName: { color: "#12243c", fontSize: 18, fontWeight: "900", letterSpacing: -0.6 },
  brandTagline: { marginTop: -2, color: "#66758b", fontSize: 11, fontWeight: "600" },
  navigationMenu: { position: "absolute", zIndex: 20, top: 52, left: 10, width: 180, paddingVertical: 5, borderRadius: 12, backgroundColor: "#fff", shadowColor: "#1b2c43", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 9, elevation: 8 },
  navigationItem: { minHeight: 40, justifyContent: "center", paddingHorizontal: 14 },
  navigationText: { color: "#21344c", fontSize: 14, fontWeight: "700" },
  accountBar: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e8edf3" },
  mobileAccountBar: { justifyContent: "flex-start", paddingHorizontal: 16 },
  accountBarLabel: { flexShrink: 1, color: "#52637a", fontSize: 12, fontWeight: "800" },
  accountActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  mobileAccountActions: { flex: 1, gap: 10 },
  loginButton: { minHeight: 33, justifyContent: "center", paddingHorizontal: 11, borderWidth: 1, borderColor: "#bac8db", borderRadius: 18 },
  mobileAccountButton: { flex: 1, minHeight: 38, alignItems: "center" },
  loginText: { color: "#182b46", fontSize: 12, fontWeight: "800" },
  signupButton: { minHeight: 33, justifyContent: "center", paddingHorizontal: 11, borderRadius: 18, backgroundColor: "#0866f5" },
  signupText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  bottomNav: { height: 68, flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 10, paddingBottom: 5, borderTopWidth: 1, borderTopColor: "#194eb5", backgroundColor: "#2563eb" },
  bottomNavItem: { flex: 1, height: 54, alignItems: "center", justifyContent: "center", gap: 3 },
  bottomNavIcon: { color: "#dbeafe", fontSize: 18, lineHeight: 22 },
  bottomNavLabel: { color: "#dbeafe", fontSize: 11, fontWeight: "800" },
  bottomNavSelected: { color: "#fff", fontWeight: "900" },
  mapRegion: { flex: 1, overflow: "hidden", backgroundColor: "#e9efec" },
  mapGround: { ...StyleSheet.absoluteFill, backgroundColor: "#e9efec" },
  roadGrid: { ...StyleSheet.absoluteFill, opacity: 0.75, borderTopWidth: 1, borderLeftWidth: 1, borderColor: "#fff", backgroundColor: "transparent" },
  road: { position: "absolute", width: "140%", height: 5, borderTopWidth: 1, borderColor: "#d9e1de", backgroundColor: "#fff" },
  roadOne: { top: "42%", left: "-15%", transform: [{ rotate: "18deg" }] },
  roadTwo: { top: "56%", left: "-13%", transform: [{ rotate: "-22deg" }] },
  roadThree: { top: "71%", left: "-14%", transform: [{ rotate: "8deg" }] },
  roadFour: { top: "30%", left: "-15%", transform: [{ rotate: "51deg" }] },
  roadFive: { top: "38%", left: "-18%", transform: [{ rotate: "77deg" }] },
  roadSix: { top: "80%", left: "-16%", transform: [{ rotate: "-38deg" }] },
  greenArea: { position: "absolute", backgroundColor: "#c3e9c9", opacity: 0.8 },
  greenOne: { top: "43%", left: "2%", width: "22%", height: "9%", borderRadius: 34, transform: [{ rotate: "-19deg" }] },
  greenTwo: { top: "71%", right: "16%", width: "26%", height: "12%", borderRadius: 42, transform: [{ rotate: "24deg" }] },
  greenThree: { top: "30%", right: "4%", width: "17%", height: "10%", borderRadius: 30, transform: [{ rotate: "-12deg" }] },
  waterway: { position: "absolute", width: 25, height: "94%", borderLeftWidth: 2, borderRightWidth: 2, borderColor: "#a8dce1", borderRadius: 30, backgroundColor: "#b9e5e7" },
  waterOne: { top: "-5%", left: "64%", transform: [{ rotate: "28deg" }] },
  waterTwo: { top: "38%", left: "-4%", width: "31%", height: 22, transform: [{ rotate: "-11deg" }] },
  mapSearches: { position: "absolute", zIndex: 8, top: 14, left: 16, right: 16, gap: 7 },
  locationSearch: { height: 43, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 14, borderWidth: 1, borderColor: "#e0e6ee", borderRadius: 24, backgroundColor: "#fff", shadowColor: "#22344b", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 5, elevation: 3 },
  locationIcon: { color: "#172e4c", fontSize: 13 },
  locationText: { flex: 1, color: "#152842", fontSize: 14, fontWeight: "800" },
  chevron: { color: "#40536d", fontSize: 18, lineHeight: 20 },
  serviceSearch: { height: 43, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: "#e0e6ee", borderRadius: 24, backgroundColor: "#fff", shadowColor: "#22344b", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 5, elevation: 3 },
  searchIcon: { color: "#5d6f88", fontSize: 24, lineHeight: 28 },
  serviceText: { flex: 1, color: "#586b84", fontSize: 13, fontWeight: "600" },
  serviceMenu: { maxHeight: 220, overflow: "hidden", borderRadius: 14, backgroundColor: "#fff", shadowColor: "#20334b", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 6 },
  serviceOption: { minHeight: 39, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#eef1f4" },
  serviceOptionText: { color: "#35465e", fontSize: 14, fontWeight: "600" },
  selectedService: { color: "#0866f5", fontWeight: "800" },
  checkmark: { color: "#0866f5", fontSize: 14, fontWeight: "800" },
  neighborhood: { position: "absolute", zIndex: 2, color: "#34465f", fontSize: 11, fontWeight: "700" },
  nairobiLabel: { top: "58%", left: "40%", color: "#172d49", fontSize: 22, fontWeight: "800" },
  providerPin: { position: "absolute", zIndex: 4, width: 29, height: 34, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff", borderRadius: 16, borderBottomLeftRadius: 3, backgroundColor: "#0866f5", transform: [{ rotate: "-45deg" }], shadowColor: "#173e73", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  pinTool: { color: "#fff", fontSize: 18, fontWeight: "800", transform: [{ rotate: "45deg" }] },
  youHereLabel: { position: "absolute", zIndex: 5, top: "53%", left: "50%", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: "#123c70", transform: [{ translateX: -40 }] },
  youHereText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  currentLocationHalo: { position: "absolute", zIndex: 4, top: "59%", left: "50%", width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "rgba(8,102,245,0.15)", transform: [{ translateX: -20 }, { translateY: -20 }] },
  currentLocationDot: { width: 18, height: 18, borderWidth: 3, borderColor: "#fff", borderRadius: 10, backgroundColor: "#0866f5" },
  mapProviderHint: { position: "absolute", zIndex: 5, top: "57%", right: "10%", flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 10, backgroundColor: "#fff", shadowColor: "#1e3047", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.13, shadowRadius: 6, elevation: 4 },
  mapHintIcon: { width: 25, height: 25, overflow: "hidden", borderRadius: 14, backgroundColor: "#e7f8f0", color: "#07965e", fontSize: 17, fontWeight: "800", lineHeight: 25, textAlign: "center" },
  mapHintCopy: { gap: 2 },
  mapHintTitle: { color: "#172941", fontSize: 11, fontWeight: "800" },
  mapHintSubtitle: { color: "#586b84", fontSize: 10, fontWeight: "600" },
  recenterButton: { position: "absolute", zIndex: 6, right: 14, bottom: "50%", width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 23, backgroundColor: "#fff", shadowColor: "#182e49", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 7, elevation: 5 },
  recenterIcon: { color: "#1b304c", fontSize: 27, lineHeight: 30 },
  providersSheet: { position: "absolute", zIndex: 10, right: 0, bottom: 0, left: 0, height: "49%", minHeight: 276, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 8, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: "#fff", shadowColor: "#22344b", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 12 },
  sheetHandle: { alignSelf: "center", width: 42, height: 5, marginBottom: 11, borderRadius: 4, backgroundColor: "#d3dbe6" },
  sheetHeading: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 9 },
  sheetHeadingCopy: { flex: 1 },
  sheetTitle: { color: "#14243d", fontSize: 17, fontWeight: "900", letterSpacing: -0.2 },
  sheetSubtitle: { marginTop: 3, color: "#5c6d85", fontSize: 12, fontWeight: "600" },
  filterButton: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, borderRadius: 18, backgroundColor: "#eff5ff" },
  filterGlyph: { color: "#0866f5", fontSize: 16 },
  filterText: { color: "#0866f5", fontSize: 12, fontWeight: "800" },
  filterMenu: { position: "absolute", zIndex: 15, top: 59, right: 12, width: 205, padding: 12, borderRadius: 13, backgroundColor: "#fff", shadowColor: "#1b2c43", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 9, elevation: 8 },
  filterMenuTitle: { marginBottom: 8, color: "#52647c", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  filterChoice: { minHeight: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  filterChoiceText: { color: "#21344c", fontSize: 13, fontWeight: "600" },
  filterCheck: { color: "#0866f5", fontSize: 14, fontWeight: "800" },
  filterNote: { marginTop: 4, color: "#61718a", fontSize: 11, lineHeight: 16 },
  providerList: { flex: 1 },
  providerListContent: { gap: 8, paddingBottom: 8 },
  providerCard: { minHeight: 91, flexDirection: "row", alignItems: "center", gap: 8, padding: 9, borderWidth: 1, borderColor: "#e6edf7", borderRadius: 15, backgroundColor: "#fff", shadowColor: "#1d3b65", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 5, elevation: 1 },
  providerImageWrap: { position: "relative", width: 50, height: 50, flex: 0, borderRadius: 27 },
  providerImage: { width: 50, height: 50, borderRadius: 26, backgroundColor: "#e9f0f6" },
  providerInitials: { width: 50, height: 50, alignItems: "center", justifyContent: "center", borderRadius: 26, backgroundColor: "#e6eef8" },
  initialsText: { color: "#225080", fontSize: 13, fontWeight: "800" },
  verifiedBadge: { position: "absolute", right: -2, bottom: -1, width: 17, height: 17, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff", borderRadius: 9, backgroundColor: "#0eb16b" },
  verifiedCheck: { color: "#fff", fontSize: 9, fontWeight: "900" },
  providerInfo: { flex: 1, gap: 3 },
  providerName: { color: "#17263d", fontSize: 14, fontWeight: "900" },
  providerRole: { color: "#586b84", fontSize: 11, fontWeight: "600" },
  providerServices: { color: "#315b91", fontSize: 10, fontWeight: "700" },
  providerDistance: { color: "#536781", fontSize: 10, fontWeight: "600" },
  providerAction: { width: 108, alignItems: "flex-end", gap: 5 },
  availablePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 13, backgroundColor: "#e4f8f3" },
  availableDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: "#0eb16b" },
  availableText: { color: "#16856e", fontSize: 10, fontWeight: "800" },
  experienceText: { color: "#536781", fontSize: 10, fontWeight: "600" },
  bookButton: { width: 100, minHeight: 32, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#0866f5" },
  bookButtonText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  inlineError: { marginBottom: 6, color: "#a13f35", fontSize: 12, lineHeight: 17 },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: "#586b84", fontSize: 13, fontWeight: "600" },
  emptyState: { flex: 1, justifyContent: "center", gap: 5, paddingHorizontal: 6 },
  emptyText: { color: "#586b84", fontSize: 13, lineHeight: 19 },
  emptyAction: { alignSelf: "center", width: 180, marginTop: 12 },
  retryText: { color: "#0866f5", fontSize: 12, fontWeight: "800" },
});
