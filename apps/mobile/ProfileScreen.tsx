import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";

type Profile = {
  id: string;
  role: "customer" | "plumber";
  email: string;
  display_name: string | null;
  bio: string | null;
  profile_image_data: string | null;
  service_county: string | null;
  service_location: string | null;
  phone_number: string | null;
  services_offered: string[];
  years_experience: number | null;
  verification_status: "pending" | "verified" | "rejected" | "suspended" | null;
  profile_complete: boolean;
};

type ProfilePost = {
  id: string;
  caption: string;
  image_data: string;
  created_at: string;
};

type Draft = {
  display_name: string;
  bio: string;
  profile_image_data: string;
  service_county: string;
  service_location: string;
  phone_number: string;
  services_offered: string[];
  years_experience: string;
};

type Props = {
  apiBaseUrl: string;
  token: string;
  onNavigateHome: () => void;
  openEditorOnLoad: boolean;
  onEditorOpened: () => void;
};

type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string };

const maxUploadBytes = 4 * 1024 * 1024;
const imageMimes = ["image/jpeg", "image/png", "image/webp"];
const plumbingServices = ["Blocked drain", "Leaking pipe", "Toilet repair", "Water heater", "Tap or shower", "Other plumbing"];

async function apiRequest<T>(url: string, token: string, options?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
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

function emptyDraft(profile: Profile): Draft {
  return {
    display_name: profile.display_name ?? "",
    bio: profile.bio ?? "",
    profile_image_data: profile.profile_image_data ?? "",
    service_county: profile.service_county ?? "",
    service_location: profile.service_location ?? "",
    phone_number: profile.phone_number ?? "",
    services_offered: profile.services_offered ?? [],
    years_experience: profile.years_experience?.toString() ?? "",
  };
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "P";
}

export default function ProfileScreen({ apiBaseUrl, token, onNavigateHome, openEditorOnLoad, onEditorOpened }: Props) {
  const openedEditor = useRef(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [postImage, setPostImage] = useState("");
  const [postCaption, setPostCaption] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    const [profileResult, postsResult] = await Promise.all([
      apiRequest<Profile>(`${apiBaseUrl}/api/v1/profiles/me`, token),
      apiRequest<ProfilePost[]>(`${apiBaseUrl}/api/v1/profiles/me/posts`, token),
    ]);
    if (!profileResult.ok) {
      setError(profileResult.message);
      setLoading(false);
      return;
    }
    if (!postsResult.ok) {
      setError(postsResult.message);
      setLoading(false);
      return;
    }
    setProfile(profileResult.data);
    setDraft(emptyDraft(profileResult.data));
    setPosts(postsResult.data);
    setLoading(false);
  }, [apiBaseUrl, token]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (openEditorOnLoad && profile && !openedEditor.current) {
      setEditing(true);
      openedEditor.current = true;
      onEditorOpened();
    }
  }, [onEditorOpened, openEditorOnLoad, profile]);

  async function chooseImage(forPost: boolean) {
    setError("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo library access to choose an image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: !forPost,
      aspect: forPost ? undefined : [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) {
      setError("We couldn't read that image. Please choose another one.");
      return;
    }
    if (asset.fileSize !== undefined && asset.fileSize > maxUploadBytes) {
      setError("Each photo must be smaller than 4 MB.");
      return;
    }
    const mime = asset.mimeType ?? "image/jpeg";
    if (!imageMimes.includes(mime)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    const data = `data:${mime};base64,${asset.base64}`;
    if (forPost) setPostImage(data);
    else setDraft((current) => current ? { ...current, profile_image_data: data } : current);
  }

  async function saveProfile() {
    if (!profile || !draft) return;
    const name = draft.display_name.trim();
    const bio = draft.bio.trim();
    const isPlumber = profile.role === "plumber";
    const yearsExperience = Number(draft.years_experience);
    if (name.length < 2 || (isPlumber && bio.length < 5)) {
      setError(isPlumber ? "Enter your legal name and a bio of at least 5 characters." : "Enter a name of at least 2 characters.");
      return;
    }
    if (isPlumber && (
      draft.service_county.trim().length < 2 ||
      draft.service_location.trim().length < 2 ||
      !/^(?:0[17]\d{8}|(?:\+?254)[17]\d{8}|[17]\d{8})$/.test(draft.phone_number.trim().replace(/[\s()-]/g, "")) ||
      draft.services_offered.length === 0 ||
      !Number.isInteger(yearsExperience) ||
      yearsExperience < 0 ||
      yearsExperience > 70
    )) {
      setError("Enter your county, service area, a valid Kenyan mobile number (e.g. 0712 345 678), at least one service, and years of experience (0–70).");
      return;
    }
    if (isPlumber && !draft.profile_image_data) {
      setError("Add a profile photo before saving your plumber profile.");
      return;
    }
    const payload: Record<string, string | number | string[]> = { display_name: name, bio };
    if (draft.profile_image_data) payload.profile_image_data = draft.profile_image_data;
    if (isPlumber) {
      payload.service_county = draft.service_county.trim();
      payload.service_location = draft.service_location.trim();
      payload.phone_number = draft.phone_number.trim();
      payload.services_offered = draft.services_offered;
      payload.years_experience = yearsExperience;
    }

    setBusy(true);
    setError("");
    setNotice("");
    const result = await apiRequest<Profile>(`${apiBaseUrl}/api/v1/profiles/me`, token, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    if (result.ok) {
      setProfile(result.data);
      setDraft(emptyDraft(result.data));
      setEditing(false);
      setNotice(
        isPlumber && result.data.verification_status === "verified"
          ? "Your complete profile is active. Go online from Dashboard to appear in nearby search."
          : "Your profile has been updated.",
      );
    } else {
      setError(result.message);
    }
    setBusy(false);
  }

  async function publishPost() {
    if (!postImage) {
      setError("Add a photo to share your post.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const result = await apiRequest<ProfilePost>(`${apiBaseUrl}/api/v1/profiles/me/posts`, token, {
      method: "POST",
      body: JSON.stringify({ caption: postCaption.trim(), image_data: postImage }),
    });
    if (result.ok) {
      setPosts((current) => [result.data, ...current]);
      setPostCaption("");
      setPostImage("");
      setNotice("Your post is live on your profile.");
    } else {
      setError(result.message);
    }
    setBusy(false);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#235b4b" /><Text style={styles.muted}>Opening your profile…</Text></View>;
  }

  if (!profile || !draft) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Profile unavailable</Text>
        <Text style={styles.muted}>{error || "This profile is not available for this account."}</Text>
        <ActionButton label="Try again" onPress={() => void loadProfile()} />
      </View>
    );
  }

  const name = profile.display_name || profile.email.split("@")[0] || "Your profile";
  const isPlumber = profile.role === "plumber";
  const completeSteps = isPlumber
    ? [!!profile.display_name, !!profile.bio, !!profile.profile_image_data, !!profile.service_county && !!profile.service_location, !!profile.phone_number, profile.services_offered.length > 0, profile.years_experience !== null]
    : [!!profile.display_name, !!profile.bio, !!profile.profile_image_data];
  const completion = Math.round((completeSteps.filter(Boolean).length / completeSteps.length) * 100);
  const needsProfileDetails = isPlumber && !profile.profile_complete;
  const awaitingVerification = isPlumber && profile.profile_complete && profile.verification_status !== "verified";

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>YOUR SPACE</Text>
          <Text style={styles.title}>My profile</Text>
          <Text style={styles.muted}>Your Pipego details, kept in one place.</Text>
        </View>
        <Pressable onPress={onNavigateHome} accessibilityRole="button" style={styles.smallLink}>
          <Text style={styles.smallLinkText}>Home</Text>
        </Pressable>
      </View>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {isPlumber ? (
        <View style={[styles.discoveryNotice, needsProfileDetails && styles.discoveryNoticeAction]}>
          <Text style={styles.discoveryTitle}>
            {needsProfileDetails
              ? "Complete your profile to appear in search"
              : awaitingVerification
                ? profile.verification_status === "rejected"
                  ? "Update your details to activate your account"
                  : profile.verification_status === "suspended"
                    ? "Your account is suspended"
                    : "Complete your details to activate your account"
                : "Your profile is verified"}
          </Text>
          <Text style={styles.discoveryText}>
            {needsProfileDetails
              ? "Add your bio, photo, county, service area, mobile number, services, and experience. Your account is activated automatically when all required details are complete. Then go online from Dashboard to appear in nearby search."
              : awaitingVerification
                ? profile.verification_status === "rejected"
                  ? "Your profile needs updates before your account can be activated. Complete all required profile details."
                  : profile.verification_status === "suspended"
                    ? "This account cannot be activated automatically. Contact Pipego support if you believe the suspension is incorrect."
                    : "Your account can be activated automatically once all required profile details are complete."
                : "Go online from Dashboard to appear in nearby customer search."}
          </Text>
          {needsProfileDetails && !editing ? (
            <ActionButton
              label="Complete profile"
              onPress={() => { setDraft(emptyDraft(profile)); setEditing(true); }}
            />
          ) : null}
        </View>
      ) : null}

      <View style={styles.cover}>
        <Text style={styles.coverLabel}>PIPEGO COMMUNITY</Text>
        <Text style={styles.coverTitle}>Good help. Good people.</Text>
        <Text style={styles.coverSubtitle}>{isPlumber ? "Share your work and build trust with customers." : "A little about you helps us make every request feel personal."}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.identityRow}>
          {profile.profile_image_data ? (
            <Image source={{ uri: profile.profile_image_data }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}><Text style={styles.avatarText}>{initials(name)}</Text></View>
          )}
          <View style={styles.identity}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.muted}>{isPlumber ? "Plumber account" : "Customer account"}</Text>
            {isPlumber ? <Text style={styles.status}>{profile.verification_status === "verified" ? "✓ Verified plumber" : profile.verification_status === "suspended" ? "Account suspended" : profile.verification_status === "rejected" ? "Profile needs updates" : "Complete your profile"}</Text> : null}
          </View>
          <Pressable accessibilityRole="button" onPress={() => { setDraft(emptyDraft(profile)); setEditing((open) => !open); }}>
            <Text style={styles.smallLinkText}>{editing ? "Close" : "Edit"}</Text>
          </Pressable>
        </View>
        <View style={styles.progressHeader}><Text style={styles.fieldLabel}>Profile completeness</Text><Text style={styles.progressValue}>{completion}%</Text></View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${completion}%` }]} /></View>
        <Text style={styles.profileBio}>{profile.bio || "Add a short bio to tell the Pipego community about yourself."}</Text>
        {isPlumber ? (
          <View style={styles.detailsRow}>
            <Text style={styles.detailChip}>{profile.service_location || "Service area not set"}{profile.service_county ? `, ${profile.service_county}` : ""}</Text>
            <Text style={styles.detailChip}>{profile.years_experience ?? "—"} years experience</Text>
            {profile.services_offered.map((service) => <Text key={service} style={styles.detailChip}>{service}</Text>)}
          </View>
        ) : null}
      </View>

      {editing ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Edit profile</Text>
          <Text style={styles.muted}>{isPlumber ? "Use your full legal name." : "Make your Pipego profile feel like you."}</Text>
          {draft.profile_image_data ? <Image source={{ uri: draft.profile_image_data }} style={styles.preview} /> : null}
          <ActionButton label={draft.profile_image_data ? "Change profile photo" : "Choose profile photo"} secondary onPress={() => void chooseImage(false)} />
          <Text style={styles.uploadNote}>JPEG, PNG, or WebP · up to 4 MB</Text>
          <Text style={styles.fieldLabel}>{isPlumber ? "Full legal name" : "Your name"}</Text>
          <TextInput style={styles.input} value={draft.display_name} onChangeText={(value) => setDraft((current) => current ? { ...current, display_name: value } : current)} placeholder="Your name" maxLength={120} autoComplete="name" />
          <Text style={styles.fieldLabel}>Bio</Text>
          <TextInput style={[styles.input, styles.multiline]} value={draft.bio} onChangeText={(value) => setDraft((current) => current ? { ...current, bio: value } : current)} placeholder={isPlumber ? "Describe your plumbing experience and the work you do…" : "A little about you…"} multiline maxLength={500} textAlignVertical="top" />
          <Text style={styles.counter}>{draft.bio.length}/500</Text>
          {isPlumber ? (
            <>
              <Text style={styles.fieldLabel}>County</Text>
              <TextInput style={styles.input} value={draft.service_county} onChangeText={(value) => setDraft((current) => current ? { ...current, service_county: value } : current)} placeholder="e.g. Nairobi" maxLength={80} />
              <Text style={styles.fieldLabel}>Town / area you serve</Text>
              <TextInput style={styles.input} value={draft.service_location} onChangeText={(value) => setDraft((current) => current ? { ...current, service_location: value } : current)} placeholder="e.g. Westlands" maxLength={120} />
              <Text style={styles.fieldLabel}>Mobile number</Text>
              <TextInput style={styles.input} value={draft.phone_number} onChangeText={(value) => setDraft((current) => current ? { ...current, phone_number: value.replace(/[^\d+ ()-]/g, "") } : current)} placeholder="0712 345 678" keyboardType="phone-pad" maxLength={20} autoComplete="tel" />
              <Text style={styles.uploadNote}>Enter your Kenyan number starting with 07 or 01. We’ll save it in the correct format and keep it private.</Text>
              <Text style={styles.fieldLabel}>Plumbing services offered</Text>
              <Text style={styles.muted}>Select all the services you provide.</Text>
              <View style={styles.servicesChoices}>
                {plumbingServices.map((service) => {
                  const selected = draft.services_offered.includes(service);
                  return (
                    <Pressable
                      key={service}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      onPress={() => setDraft((current) => current ? {
                        ...current,
                        services_offered: selected
                          ? current.services_offered.filter((item) => item !== service)
                          : [...current.services_offered, service],
                      } : current)}
                      style={[styles.serviceChoice, selected && styles.serviceChoiceSelected]}
                    >
                      <Text style={[styles.serviceChoiceText, selected && styles.serviceChoiceTextSelected]}>{selected ? "✓  " : "+  "}{service}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.fieldLabel}>Years of experience</Text>
              <TextInput style={styles.input} value={draft.years_experience} onChangeText={(value) => setDraft((current) => current ? { ...current, years_experience: value.replace(/[^\d]/g, "") } : current)} placeholder="e.g. 5" keyboardType="number-pad" maxLength={2} />
            </>
          ) : null}
          <ActionButton label={busy ? "Saving…" : "Save profile"} onPress={() => void saveProfile()} disabled={busy} />
        </View>
      ) : null}

      {isPlumber ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Account status</Text>
          <Text style={styles.muted}>
            {profile.verification_status === "verified"
              ? "Your complete profile is active and can receive nearby requests."
              : profile.verification_status === "suspended"
                ? "This account is suspended. Contact Pipego support if you believe this is incorrect."
                : profile.verification_status === "rejected"
                  ? "Your profile needs updates before your account can be activated."
                  : "Complete all required profile details to activate your plumber account."}
          </Text>
          <Text style={styles.status}>
            {profile.verification_status === "verified"
              ? "Active plumber"
              : profile.verification_status === "suspended"
                ? "Account suspended"
                : profile.verification_status === "rejected"
                  ? "Profile needs updates"
                  : "Profile incomplete"}
          </Text>
          {!editing && needsProfileDetails ? <ActionButton label="Complete profile" secondary onPress={() => { setDraft(emptyDraft(profile)); setEditing(true); }} /> : null}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Need a hand?</Text>
          <Text style={styles.muted}>Tell us what needs fixing and connect with trusted local help.</Text>
          <ActionButton label="Start a plumbing request" onPress={onNavigateHome} />
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Share a photo</Text>
        <Text style={styles.muted}>Add a photo to your Pipego profile. Images are limited to 4 MB.</Text>
        {postImage ? <Image source={{ uri: postImage }} style={styles.postPreview} /> : null}
        <ActionButton label={postImage ? "Change photo" : "Choose photo"} secondary onPress={() => void chooseImage(true)} />
        <TextInput style={styles.input} value={postCaption} onChangeText={setPostCaption} placeholder="Write a caption (optional)" maxLength={280} />
        <ActionButton label={busy ? "Publishing…" : "Publish post"} onPress={() => void publishPost()} disabled={busy || !postImage} />
      </View>

      <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>My posts</Text><Text style={styles.muted}>{posts.length} shared</Text></View>
      {posts.length ? posts.map((post) => (
        <View style={styles.card} key={post.id}>
          <Image source={{ uri: post.image_data }} style={styles.postImage} />
          {post.caption ? <Text style={styles.postCaption}>{post.caption}</Text> : null}
          <Text style={styles.uploadNote}>{new Date(post.created_at).toLocaleDateString()}</Text>
        </View>
      )) : (
        <View style={styles.emptyPosts}><Text style={styles.sectionTitle}>Your story starts here.</Text><Text style={styles.muted}>Share a photo to introduce yourself to the Pipego community.</Text></View>
      )}
    </ScrollView>
  );
}

function ActionButton({ label, onPress, secondary = false, disabled = false }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, disabled && styles.buttonDisabled, pressed && !disabled && styles.buttonPressed]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 28, gap: 14 },
  center: { minHeight: 220, alignItems: "center", justifyContent: "center", gap: 10 },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  headingCopy: { flex: 1, gap: 4 },
  eyebrow: { color: "#73877e", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  title: { color: "#18332e", fontSize: 28, fontWeight: "800", letterSpacing: -0.6 },
  muted: { color: "#53645c", fontSize: 14, lineHeight: 21 },
  smallLink: { padding: 10 },
  smallLinkText: { color: "#235b4b", fontSize: 14, fontWeight: "800" },
  error: { padding: 12, borderRadius: 8, backgroundColor: "#fff1ef", color: "#963f34", fontSize: 14, lineHeight: 20, fontWeight: "600" },
  notice: { padding: 12, borderRadius: 8, backgroundColor: "#f2f7e9", color: "#436537", fontSize: 14, lineHeight: 20, fontWeight: "600" },
  discoveryNotice: { gap: 8, padding: 15, borderWidth: 1, borderColor: "#cfe0f8", borderRadius: 14, backgroundColor: "#f2f7ff" },
  discoveryNoticeAction: { borderColor: "#bcd3f7", backgroundColor: "#eef5ff" },
  discoveryTitle: { color: "#173e70", fontSize: 16, lineHeight: 22, fontWeight: "800" },
  discoveryText: { color: "#405774", fontSize: 13, lineHeight: 19 },
  cover: { minHeight: 132, justifyContent: "flex-end", overflow: "hidden", padding: 18, borderRadius: 14, backgroundColor: "#235b4b" },
  coverLabel: { color: "#d0e4a0", fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  coverTitle: { marginTop: 9, color: "#fff", fontSize: 22, fontWeight: "800" },
  coverSubtitle: { maxWidth: 300, marginTop: 5, color: "#e5eee9", fontSize: 13, lineHeight: 19 },
  card: { gap: 10, padding: 16, borderWidth: 1, borderColor: "#e1e7df", borderRadius: 12, backgroundColor: "#fff" },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#e7efe2" },
  avatarPlaceholder: { alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#235b4b", fontSize: 21, fontWeight: "800" },
  identity: { flex: 1, gap: 3 },
  name: { color: "#18332e", fontSize: 19, fontWeight: "800" },
  status: { marginTop: 4, color: "#365a32", fontSize: 13, fontWeight: "800" },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  fieldLabel: { color: "#455950", fontSize: 13, fontWeight: "800" },
  progressValue: { color: "#235b4b", fontSize: 13, fontWeight: "800" },
  progressTrack: { height: 7, overflow: "hidden", borderRadius: 4, backgroundColor: "#eaf0e6" },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: "#8baa45" },
  profileBio: { color: "#40564b", fontSize: 14, lineHeight: 21 },
  detailsRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  detailChip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 18, backgroundColor: "#f1f5eb", color: "#365543", fontSize: 12, fontWeight: "800" },
  servicesChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  serviceChoice: { minHeight: 40, justifyContent: "center", paddingHorizontal: 12, borderWidth: 1, borderColor: "#dce5d4", borderRadius: 20, backgroundColor: "#fbfcf9" },
  serviceChoiceSelected: { borderColor: "#8baa45", backgroundColor: "#f0f5e8" },
  serviceChoiceText: { color: "#455950", fontSize: 13, fontWeight: "600" },
  serviceChoiceTextSelected: { color: "#235b4b", fontWeight: "800" },
  sectionTitle: { color: "#18332e", fontSize: 18, fontWeight: "800" },
  preview: { width: 78, height: 78, borderRadius: 39, alignSelf: "center" },
  postPreview: { width: "100%", height: 190, borderRadius: 9 },
  postImage: { width: "100%", height: 220, borderRadius: 9 },
  postCaption: { color: "#30443c", fontSize: 15, lineHeight: 22 },
  uploadNote: { color: "#65736d", fontSize: 12, lineHeight: 18, fontWeight: "600" },
  input: { minHeight: 50, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: "#e1e7df", borderRadius: 8, backgroundColor: "#fff", color: "#30443c", fontSize: 15 },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  counter: { alignSelf: "flex-end", color: "#65736d", fontSize: 12, fontWeight: "600" },
  button: { minHeight: 44, justifyContent: "center", alignItems: "center", paddingHorizontal: 14, borderRadius: 8, backgroundColor: "#235b4b" },
  buttonSecondary: { borderWidth: 1, borderColor: "#dce5d4", backgroundColor: "#f3f6ed" },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.82 },
  buttonText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  buttonSecondaryText: { color: "#235b4b" },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 3 },
  emptyPosts: { alignItems: "center", gap: 7, padding: 22, borderRadius: 12, backgroundColor: "#fff" },
});
