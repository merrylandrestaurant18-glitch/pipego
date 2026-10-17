import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Booking } from "./types";
import LiveMap from "./LiveMap";

type User = {
  email: string;
  role: "customer" | "plumber" | "company" | "admin";
};

type Props = {
  user: User;
  booking: Booking | null;
  providerLocation: { latitude: number | null; longitude: number | null; updated_at: string | null } | null;
  offers: Booking[];
  providerOnline: boolean;
  busy: boolean;
  onNavigateHome: () => void;
  onToggleAvailability: () => void;
  onRefreshOffers: () => void;
  onAcceptOffer: (id: string) => void;
};

export default function DashboardScreen({
  user,
  booking,
  providerLocation,
  offers,
  providerOnline,
  busy,
  onNavigateHome,
  onToggleAvailability,
  onRefreshOffers,
  onAcceptOffer,
}: Props) {
  if (user.role === "admin") {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.heading}>
          <View>
            <Text style={styles.eyebrow}>PIPEGO KENYA · ADMIN WORKSPACE</Text>
            <Text style={styles.title}>Overview</Text>
            <Text style={styles.subtitle}>Marketplace administration.</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Live marketplace metrics are not available yet</Text>
          <Text style={styles.cardSubtitle}>Account, booking, and revenue figures will appear here once the admin analytics API is connected.</Text>
        </View>
      </ScrollView>
    );
  }

  const isPlumber = user.role === "plumber";
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.heading}>
        <View>
          <Text style={styles.eyebrow}>{isPlumber ? "PROVIDER WORKSPACE" : "YOUR PIPEGO ACCOUNT"}</Text>
          <Text style={styles.title}>{isPlumber ? "Work dashboard" : "Your dashboard"}</Text>
          <Text style={styles.subtitle}>{isPlumber ? "Manage availability and nearby job offers." : "Keep track of your latest plumbing request."}</Text>
        </View>
      </View>

      {isPlumber ? (
        <>
          <View style={styles.metrics}>
            <Metric label="Availability" value={providerOnline ? "Online" : "Offline"} detail={providerOnline ? "Available for nearby jobs" : "Go online to get offers"} />
            <Metric label="Active offers" value={String(offers.length)} detail="Offers ready to review" />
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Provider tools</Text>
            <Text style={styles.cardSubtitle}>You must be verified before you can receive job offers.</Text>
            <DashboardButton label={providerOnline ? "Go offline" : "Go online"} onPress={onToggleAvailability} disabled={busy} secondary={providerOnline} />
            <DashboardButton label="Refresh offers" onPress={onRefreshOffers} disabled={busy} secondary />
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Nearby offers</Text>
            <Text style={styles.cardSubtitle}>{offers.length ? "Review a request and accept the work if it suits you." : "New requests from nearby customers will appear here."}</Text>
            {offers.length ? offers.map((offer) => (
              <View key={offer.id} style={styles.offerCard}>
                <Text style={styles.requestName}>{offer.category}</Text>
                <Text style={styles.offerDescription}>{offer.description}</Text>
                {offer.offer_expires_at ? <Text style={styles.requestMeta}>Expires {new Date(offer.offer_expires_at).toLocaleTimeString()}</Text> : null}
                <DashboardButton label="Accept job" onPress={() => onAcceptOffer(offer.id)} disabled={busy} />
              </View>
            )) : <Text style={styles.empty}>No active offers right now.</Text>}
          </View>
        </>
      ) : (
        <>
          <View style={styles.metrics}>
            <Metric label="Current request" value={booking ? "In progress" : "None"} detail={booking ? booking.category : "Ready when you need help"} />
            <Metric label="Request ID" value={booking ? booking.id.slice(0, 8).toUpperCase() : "—"} detail={booking ? booking.status.replaceAll("_", " ") : "No active booking"} />
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{booking ? booking.category : "No active requests"}</Text>
            <Text style={styles.cardSubtitle}>{booking ? booking.description : "When something needs fixing, request a nearby plumber and follow the progress here."}</Text>
            {booking ? <Text style={styles.statusPill}>{booking.status.replaceAll("_", " ")}</Text> : null}
            {booking && booking.provider_id && ["accepted", "en_route", "arrived", "inspection", "quote_pending", "quote_approved", "in_progress", "completion_pending"].includes(booking.status) ? (
              <View style={styles.trackingCard}>
                <Text style={styles.trackingTitle}>Your plumber&apos;s live location</Text>
                <Text style={styles.trackingSubtitle}>
                  {providerLocation?.latitude !== null && providerLocation?.latitude !== undefined
                    ? "Location refreshes every 5 seconds."
                    : "Waiting for your plumber's next location update."}
                </Text>
                <View style={styles.trackingMap}>
                  <LiveMap
                    center={{ latitude: booking.latitude, longitude: booking.longitude }}
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
                </View>
                <Text style={styles.trackingPrivacy}>Only you can see the plumber&apos;s precise location during this active booking.</Text>
              </View>
            ) : null}
            <DashboardButton label="Create a plumbing request" onPress={onNavigateHome} />
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your home, kept private</Text>
            <Text style={styles.cardSubtitle}>Your location is shared only when you request a nearby plumber. Review any quote before work begins.</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </View>
  );
}

function DashboardButton({ label, onPress, disabled = false, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={[styles.button, secondary && styles.buttonSecondary, disabled && styles.buttonDisabled]}>
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 28, gap: 14 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  eyebrow: { color: "#73877e", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  title: { marginTop: 5, color: "#18332e", fontSize: 25, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { marginTop: 5, color: "#53645c", fontSize: 14, lineHeight: 21 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { flexGrow: 1, flexBasis: "46%", minHeight: 108, justifyContent: "space-between", padding: 13, borderWidth: 1, borderColor: "#e1e7df", borderRadius: 11, backgroundColor: "#fff" },
  metricLabel: { color: "#5f6e66", fontSize: 12, fontWeight: "800" },
  metricValue: { color: "#18332e", fontSize: 22, fontWeight: "800", letterSpacing: -0.7 },
  metricDetail: { color: "#5f6e66", fontSize: 11, fontWeight: "600" },
  card: { gap: 11, padding: 15, borderWidth: 1, borderColor: "#e1e7df", borderRadius: 12, backgroundColor: "#fff" },
  cardTitle: { color: "#18332e", fontSize: 17, fontWeight: "800" },
  cardSubtitle: { marginTop: 4, color: "#53645c", fontSize: 13, lineHeight: 19 },
  requestName: { color: "#30443c", fontSize: 13, fontWeight: "800" },
  requestMeta: { marginTop: 4, color: "#65736d", fontSize: 11, fontWeight: "600" },
  button: { minHeight: 43, justifyContent: "center", alignItems: "center", paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#235b4b" },
  buttonSecondary: { borderWidth: 1, borderColor: "#dce5d4", backgroundColor: "#f3f6ed" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  buttonSecondaryText: { color: "#235b4b" },
  offerCard: { gap: 7, marginTop: 5, padding: 12, borderWidth: 1, borderColor: "#e6ebe3", borderRadius: 9, backgroundColor: "#fbfcf9" },
  offerDescription: { color: "#53645c", fontSize: 14, lineHeight: 21 },
  empty: { paddingVertical: 16, color: "#58675f", fontSize: 13, fontWeight: "600", textAlign: "center" },
  statusPill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 7, overflow: "hidden", borderRadius: 14, backgroundColor: "#eef4e7", color: "#365543", fontSize: 12, fontWeight: "800" },
  trackingCard: { gap: 7, marginTop: 4, padding: 11, borderWidth: 1, borderColor: "#dce9e1", borderRadius: 11, backgroundColor: "#f8fbf9" },
  trackingTitle: { color: "#24473c", fontSize: 14, fontWeight: "800" },
  trackingSubtitle: { color: "#61796f", fontSize: 11, fontWeight: "600" },
  trackingMap: { position: "relative", height: 210, overflow: "hidden", borderRadius: 9 },
  trackingPrivacy: { color: "#667c73", fontSize: 10, lineHeight: 15 },
  footer: { color: "#65736d", fontSize: 11, fontWeight: "600", textAlign: "center" },
});
