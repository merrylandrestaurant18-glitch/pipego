"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileCheck2,
  ImagePlus,
  LockKeyhole,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";
import "./profile.css";

type User = {
  id: string;
  email: string;
  role: "customer" | "plumber" | "company" | "admin";
};

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
  verification_document_uploaded: boolean;
  profile_complete: boolean;
};

type ProfilePost = {
  id: string;
  caption: string;
  image_data: string;
  created_at: string;
};

type ProfileDraft = {
  display_name: string;
  bio: string;
  profile_image_data: string;
  service_county: string;
  service_location: string;
  phone_number: string;
  services_offered: string[];
  years_experience: string;
};

type SessionResponse = { user: User | null; error?: string };

const maxUploadBytes = 4 * 1024 * 1024;
const profileImageTypes = ["image/jpeg", "image/png", "image/webp"];
const identityTypes = [...profileImageTypes, "application/pdf"];
const plumbingServices = ["Blocked drain", "Leaking pipe", "Toilet repair", "Water heater", "Tap or shower", "Other plumbing"];

async function readImageFile(file: File, allowedTypes: string[]): Promise<string> {
  if (!allowedTypes.includes(file.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP image. Identity documents may also be PDF.");
  }
  if (file.size > maxUploadBytes) {
    throw new Error("Each upload must be smaller than 4 MB.");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("We couldn't read that file. Please try another one."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("We couldn't read that file. Please try another one."));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function emptyDraft(profile: Profile | null): ProfileDraft {
  return {
    display_name: profile?.display_name ?? "",
    bio: profile?.bio ?? "",
    profile_image_data: profile?.profile_image_data ?? "",
    service_county: profile?.service_county ?? "",
    service_location: profile?.service_location ?? "",
    phone_number: profile?.phone_number ?? "",
    services_offered: profile?.services_offered ?? [],
    years_experience: profile?.years_experience?.toString() ?? "",
  };
}

function getInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "P";
}

export default function ProfilePage() {
  const router = useRouter();
  const profileFileRef = useRef<HTMLInputElement>(null);
  const identityFileRef = useRef<HTMLInputElement>(null);
  const postFileRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft(null));
  const [identityData, setIdentityData] = useState("");
  const [identityFilename, setIdentityFilename] = useState("");
  const [identityMime, setIdentityMime] = useState("");
  const [postImage, setPostImage] = useState("");
  const [postCaption, setPostCaption] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      try {
        const sessionResponse = await fetch("/api/session", { cache: "no-store" });
        const session = (await sessionResponse.json()) as SessionResponse;
        if (!sessionResponse.ok) throw new Error(session.error || "We couldn't check your sign-in.");
        if (!session.user) {
          router.replace("/");
          return;
        }
        if (session.user.role !== "customer" && session.user.role !== "plumber") {
          throw new Error("This profile dashboard is available to customer and plumber accounts.");
        }
        const [profileResponse, postsResponse] = await Promise.all([
          fetch("/api/profile", { cache: "no-store" }),
          fetch("/api/profile/posts", { cache: "no-store" }),
        ]);
        const profileResult = (await profileResponse.json()) as Profile & { error?: string };
        const postsResult = (await postsResponse.json()) as ProfilePost[] | { error?: string };
        if (!profileResponse.ok) throw new Error(profileResult.error || "We couldn't load your profile.");
        if (!postsResponse.ok || !Array.isArray(postsResult)) {
          throw new Error(!Array.isArray(postsResult) && postsResult.error ? postsResult.error : "We couldn't load your posts.");
        }
        if (active) {
          setUser(session.user);
          setProfile(profileResult);
          setDraft(emptyDraft(profileResult));
          setPosts(postsResult);
          if (new URLSearchParams(window.location.search).get("edit") === "1") {
            setEditOpen(true);
            router.replace("/profile", { scroll: false });
          }
          setLoading(false);
        }
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : "We couldn't load your profile.");
          setLoading(false);
        }
      }
    }
    void loadDashboard();
    return () => {
      active = false;
    };
  }, [router]);

  async function handleProfileFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const data = await readImageFile(file, profileImageTypes);
      setDraft((current) => ({ ...current, profile_image_data: data }));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to read the profile image.");
    }
  }

  async function handleIdentityFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const data = await readImageFile(file, identityTypes);
      setIdentityData(data);
      setIdentityFilename(file.name);
      setIdentityMime(file.type);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to read the identity document.");
    }
  }

  async function handlePostFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      setPostImage(await readImageFile(file, profileImageTypes));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to read the post image.");
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !user) return;
    if (user.role === "plumber" && draft.services_offered.length === 0) {
      setError("Select at least one plumbing service before saving your profile.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const payload: Record<string, string | number | string[] | null> = {
      display_name: draft.display_name.trim(),
      bio: draft.bio.trim(),
    };
    if (draft.profile_image_data) payload.profile_image_data = draft.profile_image_data;
    if (user.role === "plumber") {
      payload.service_county = draft.service_county.trim();
      payload.service_location = draft.service_location.trim();
      payload.phone_number = draft.phone_number.trim() || null;
      payload.services_offered = draft.services_offered;
      payload.years_experience = Number(draft.years_experience);
      if (identityData) {
        payload.verification_document_data = identityData;
        payload.verification_document_filename = identityFilename;
        payload.verification_document_mime = identityMime;
      }
    }
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as Profile & { error?: string };
      if (!response.ok) throw new Error(result.error || "We couldn't save your profile.");
      setProfile(result);
      setDraft(emptyDraft(result));
      setIdentityData("");
      setIdentityFilename("");
      setEditOpen(false);
      setNotice("Your profile has been updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn't save your profile.");
    } finally {
      setBusy(false);
    }
  }

  async function publishPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!postImage) {
      setError("Add a photo to share your post.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/profile/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: postCaption.trim(), image_data: postImage }),
      });
      const result = (await response.json()) as ProfilePost & { error?: string };
      if (!response.ok) throw new Error(result.error || "We couldn't publish your post.");
      setPosts((current) => [result, ...current]);
      setPostCaption("");
      setPostImage("");
      if (postFileRef.current) postFileRef.current.value = "";
      setNotice("Your post is live on your profile.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn't publish your post.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      const response = await fetch("/api/session", { method: "DELETE" });
      if (!response.ok) throw new Error("We couldn't sign you out. Please try again.");
      router.replace("/");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn't sign you out.");
      setBusy(false);
    }
  }

  const name = profile?.display_name || user?.email.split("@")[0] || "Your profile";
  const isPlumber = user?.role === "plumber";
  const initials = getInitials(name);
  const profileSteps = isPlumber
    ? [
      Boolean(profile?.display_name),
      Boolean(profile?.bio),
      Boolean(profile?.profile_image_data),
      Boolean(profile?.service_county && profile?.service_location),
      Boolean(profile?.phone_number),
      Boolean(profile?.services_offered?.length),
      profile?.years_experience !== null && profile?.years_experience !== undefined,
      Boolean(profile?.verification_document_uploaded),
    ]
    : [Boolean(profile?.display_name), Boolean(profile?.bio), Boolean(profile?.profile_image_data)];
  const completionPercent = profile
    ? Math.round((profileSteps.filter(Boolean).length / profileSteps.length) * 100)
    : 0;

  if (loading) {
    return <main className="profile-loading"><span className="profile-loading-mark"><Wrench size={18} /></span><p>Opening your Pipego profile…</p></main>;
  }

  return (
    <main className="profile-app">
      <aside className="profile-sidebar">
        <Link className="profile-brand" href="/"><span className="profile-brand-mark"><Wrench size={17} /></span>pipego<span>.</span></Link>
        <div className="profile-side-user">
          {profile?.profile_image_data ? <Image src={profile.profile_image_data} alt="" width={44} height={44} unoptimized /> : <span className="profile-side-avatar">{initials}</span>}
          <span><strong>{name}</strong><small>{isPlumber ? "Plumber account" : "Customer account"}</small></span>
        </div>
        <nav className="profile-nav" aria-label="Profile navigation">
          <a className="profile-nav-item profile-nav-selected" href="#profile-overview"><UserRound size={17} /><span>My profile</span></a>
          <a className="profile-nav-item" href="#my-posts"><ImagePlus size={17} /><span>My posts</span><span className="profile-nav-count">{posts.length}</span></a>
          <Link className="profile-nav-item" href="/#request"><BriefcaseBusiness size={17} /><span>{isPlumber ? "Find work" : "Find a plumber"}</span></Link>
        </nav>
        <div className="profile-side-bottom">
          <div className="profile-privacy-note"><ShieldCheck size={16} /><p><strong>Your information matters</strong><br />Your ID is encrypted and only available to Pipego admins for verification.</p></div>
          <button className="profile-signout" type="button" onClick={signOut} disabled={busy}><ArrowLeft size={15} /> Sign out</button>
        </div>
      </aside>

      <section className="profile-main" id="profile-overview">
        <header className="profile-topbar">
          <div><span>YOUR SPACE</span><ChevronRight size={13} /><strong>Profile</strong></div>
          <div className="profile-top-actions"><span className="profile-secure"><LockKeyhole size={13} /> Private account</span><Link className="profile-home-link" href="/"><ArrowLeft size={14} /> Home</Link></div>
        </header>
        <div className="profile-content">
          {error && <div className="profile-alert profile-alert-error" role="alert">{error}</div>}
          {notice && <div className="profile-alert profile-alert-success" role="status"><Check size={15} />{notice}</div>}

          <section className="profile-cover-card">
            <div className="profile-cover-art"><span className="cover-orbit cover-orbit-one" /><span className="cover-orbit cover-orbit-two" /><span className="cover-wordmark">PIPEGO COMMUNITY</span><span className="cover-watermark"><Wrench size={38} /></span></div>
            <div className="profile-identity">
              {profile?.profile_image_data ? <Image className="profile-large-avatar" src={profile.profile_image_data} alt={`${name}'s profile`} width={104} height={104} unoptimized /> : <div className="profile-large-avatar profile-avatar-placeholder">{initials}</div>}
              <div className="profile-identity-copy">
                <div className="profile-name-line"><h1>{name}</h1>{isPlumber && profile?.verification_status === "verified" && <span className="verified-pill"><BadgeCheck size={14} /> Verified plumber</span>}</div>
                <p>{isPlumber ? "Pipego plumbing professional" : "Pipego community member"}<span>·</span>{user?.email}</p>
                {isPlumber && <div className="profile-location-line"><MapPin size={14} />{profile?.service_location && profile.service_county ? `${profile.service_location}, ${profile.service_county} County` : "Add your service area"}</div>}
              </div>
              <button className="profile-edit-button" type="button" onClick={() => { setDraft(emptyDraft(profile)); setEditOpen(true); setError(""); }}><Pencil size={15} /> Edit profile</button>
            </div>
          </section>

          <div className="profile-workspace">
            <div className="profile-feed-column">
              <section className="profile-card profile-about-card">
                <div className="profile-section-heading"><div><span className="profile-section-eyebrow">ABOUT</span><h2>Good people, local help.</h2></div><button className="subtle-icon-button" aria-label="Edit profile" type="button" onClick={() => { setDraft(emptyDraft(profile)); setEditOpen(true); }}><Pencil size={15} /></button></div>
                <p className="profile-bio">{profile?.bio || (isPlumber ? "Tell customers a little about your plumbing experience and the kind of work you do." : "Add a short bio so your Pipego profile feels like yours.")}</p>
                <div className="profile-detail-chips">
                  {isPlumber ? <>
                    <span><MapPin size={14} />{profile?.service_county ? `${profile.service_county} County` : "County not added"}</span>
                    <span><Wrench size={14} />{profile?.service_location || "Service location not added"}</span>
                    <span><BriefcaseBusiness size={14} />{profile?.services_offered?.length ? profile.services_offered.join(", ") : "Services not added"}</span>
                    <span><Clock3 size={14} />{profile?.years_experience === null || profile?.years_experience === undefined ? "Experience not added" : `${profile.years_experience} ${profile.years_experience === 1 ? "year" : "years"} experience`}</span>
                  </> : <>
                    <span><UserRound size={14} />Customer</span>
                    <span><ShieldCheck size={14} />Your home details stay private</span>
                  </>}
                </div>
              </section>

              <section className="profile-card profile-composer-card" aria-label="Create a post">
                <div className="composer-heading"><span className="composer-heading-icon"><Plus size={17} /></span><div><h2>Share a moment</h2><p>{isPlumber ? "Show your work and help customers get to know you." : "Share an update with the Pipego community."}</p></div></div>
                <form className="profile-composer" onSubmit={publishPost}>
                  <label className="composer-caption-label" htmlFor="post-caption">Write a caption</label>
                  <textarea id="post-caption" value={postCaption} onChange={(event) => setPostCaption(event.target.value)} placeholder={isPlumber ? "A recent repair, a handy tip, or a little introduction…" : "What's happening around your home?"} maxLength={280} rows={2} />
                  {postImage && <div className="post-image-preview"><Image src={postImage} alt="Selected post preview" fill unoptimized sizes="(max-width: 720px) 90vw, 520px" /><button type="button" aria-label="Remove selected image" onClick={() => { setPostImage(""); if (postFileRef.current) postFileRef.current.value = ""; }}>×</button></div>}
                  <div className="composer-actions">
                    <input ref={postFileRef} className="visually-hidden-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePostFile} aria-label="Choose a photo for your post" />
                    <button className="composer-photo-button" type="button" onClick={() => postFileRef.current?.click()}><Camera size={16} /> Add photo</button>
                    <span className="composer-character-count">{postCaption.length}/280</span>
                    <button className="composer-publish-button" type="submit" disabled={busy || !postImage}>{busy ? "Sharing…" : "Share post"} <ArrowLeft className="publish-arrow" size={14} /></button>
                  </div>
                </form>
              </section>

              <section className="profile-posts-section" id="my-posts">
                <div className="profile-posts-heading"><div><span className="profile-section-eyebrow">YOUR FEED</span><h2>Recent posts <span>{posts.length}</span></h2></div><button className="feed-filter-button" type="button" aria-label="Showing newest posts">Newest <ChevronRight size={14} /></button></div>
                {posts.length === 0 ? (
                  <div className="profile-card profile-empty-posts"><span><ImagePlus size={22} /></span><strong>Your first post starts here</strong><p>Add a photo above to share your work or an update.</p></div>
                ) : posts.map((post) => (
                  <article className="profile-card profile-post-card" key={post.id}>
                    <header className="post-author-row">
                      {profile?.profile_image_data ? <Image className="post-author-avatar" src={profile.profile_image_data} alt="" width={39} height={39} unoptimized /> : <span className="post-author-avatar post-avatar-fallback">{initials}</span>}
                      <span className="post-author-copy"><strong>{name}{isPlumber && profile?.verification_status === "verified" && <BadgeCheck size={13} />}</strong><small>{isPlumber ? "Pipego plumber" : "Pipego customer"} <span>·</span> {new Date(post.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></span>
                      <button className="subtle-icon-button" type="button" aria-label="Post options"><MoreHorizontal size={17} /></button>
                    </header>
                    {post.caption && <p className="post-caption">{post.caption}</p>}
                    <div className="profile-post-image"><Image src={post.image_data} alt={post.caption || "Photo shared on Pipego"} fill unoptimized sizes="(max-width: 720px) 96vw, 690px" /></div>
                    <footer className="post-footer"><span><ImagePlus size={14} /> Shared with your Pipego profile</span><span><Clock3 size={13} />{new Date(post.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span></footer>
                  </article>
                ))}
              </section>
            </div>

            <aside className="profile-aside">
              <section className={`profile-card completion-card${profile?.profile_complete ? " completion-card-done" : ""}`}>
                <div className="completion-heading"><span className="completion-icon">{profile?.profile_complete ? <Check size={17} /> : <BriefcaseBusiness size={17} />}</span><div><span className="profile-section-eyebrow">PROFILE CHECKLIST</span><h2>{profile?.profile_complete ? "Looking good" : "Finish your profile"}</h2></div></div>
                <p>{isPlumber ? "A complete profile helps customers feel confident choosing you." : "Add a little about yourself to make your account your own."}</p>
                <div className="completion-progress" role="progressbar" aria-label="Profile completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completionPercent}><span style={{ width: `${completionPercent}%` }} /></div>
                <div className="checklist-row"><span className={profile?.display_name ? "checklist-check is-done" : "checklist-check"}>{profile?.display_name ? <Check size={11} /> : <UserRound size={11} />}</span><span>Profile name</span>{profile?.display_name && <Check className="checklist-trailing" size={13} />}</div>
                <div className="checklist-row"><span className={profile?.profile_image_data ? "checklist-check is-done" : "checklist-check"}>{profile?.profile_image_data ? <Check size={11} /> : <Camera size={11} />}</span><span>Profile photo</span>{profile?.profile_image_data && <Check className="checklist-trailing" size={13} />}</div>
                {isPlumber && <>
                  <div className="checklist-row"><span className={profile?.service_county && profile.service_location ? "checklist-check is-done" : "checklist-check"}>{profile?.service_county && profile.service_location ? <Check size={11} /> : <MapPin size={11} />}</span><span>Service area &amp; experience</span>{profile?.service_county && profile.years_experience !== null && <Check className="checklist-trailing" size={13} />}</div>
                  <div className="checklist-row"><span className={profile?.phone_number && profile.services_offered?.length ? "checklist-check is-done" : "checklist-check"}>{profile?.phone_number && profile.services_offered?.length ? <Check size={11} /> : <BriefcaseBusiness size={11} />}</span><span>Mobile number &amp; services</span>{profile?.phone_number && profile.services_offered?.length ? <Check className="checklist-trailing" size={13} /> : null}</div>
                  <div className="checklist-row"><span className={profile?.verification_document_uploaded ? "checklist-check is-done" : "checklist-check"}>{profile?.verification_document_uploaded ? <Check size={11} /> : <FileCheck2 size={11} />}</span><span>Identity document</span>{profile?.verification_document_uploaded && <Check className="checklist-trailing" size={13} />}</div>
                </>}
                <button className="completion-edit-link" type="button" onClick={() => { setDraft(emptyDraft(profile)); setEditOpen(true); }}>Complete details <ChevronRight size={14} /></button>
              </section>

              {isPlumber ? (
                <section className="profile-card verification-card">
                  <div className="verification-card-top"><span className="verification-shield"><ShieldCheck size={17} /></span><span className={`verification-state${profile?.verification_status === "verified" ? " verification-state-approved" : ""}`}><i />{profile?.verification_status === "verified" ? "Verified" : !profile?.verification_document_uploaded ? "ID needed" : profile?.verification_status === "rejected" ? "Resubmit ID" : profile?.verification_status === "suspended" ? "Suspended" : "Review pending"}</span></div>
                  <h2>Verification builds trust.</h2>
                  <p>{profile?.verification_document_uploaded ? "Your ID is encrypted and ready for a private Pipego admin review." : "Upload a clear photo or PDF of your government ID to start plumber verification."}</p>
                  <button type="button" onClick={() => { setDraft(emptyDraft(profile)); setEditOpen(true); }}><FileCheck2 size={14} />{profile?.verification_document_uploaded ? "Update identity document" : "Upload identity document"}</button>
                  <div className="verification-private-note"><LockKeyhole size={12} />Your ID is never shown on your public profile.</div>
                </section>
              ) : (
                <section className="profile-card customer-next-card">
                  <span className="customer-next-icon"><Wrench size={17} /></span><span className="profile-section-eyebrow">NEED A HAND?</span><h2>Find a plumber nearby.</h2><p>Tell us what needs fixing and we’ll help you connect with local help.</p><Link href="/#request">Start a request <ChevronRight size={14} /></Link>
                </section>
              )}

              <section className="profile-help-row"><CircleHelp size={16} /><span><strong>Need a hand?</strong><a href="mailto:support@pipego.example">Contact Pipego support</a></span><ChevronRight size={14} /></section>
            </aside>
          </div>
          <footer className="profile-footer"><span>© 2026 Pipego</span><span><ShieldCheck size={13} /> Your profile, your way</span></footer>
        </div>
      </section>

      {editOpen && profile && user && <div className="profile-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditOpen(false); }}>
        <section className="profile-edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-profile-title">
          <header className="edit-modal-header"><div><span className="profile-section-eyebrow">YOUR DETAILS</span><h2 id="edit-profile-title">Edit profile</h2><p>{isPlumber ? "Use your legal name exactly as it appears on your ID. Enter your Kenyan mobile number, for example 0712 345 678." : "Make your Pipego profile feel like you."}</p></div><button type="button" aria-label="Close edit profile" onClick={() => setEditOpen(false)}>×</button></header>
          <form className="profile-edit-form" onSubmit={saveProfile}>
            <div className="edit-photo-row">
              {draft.profile_image_data ? <Image src={draft.profile_image_data} alt="Profile preview" width={68} height={68} unoptimized /> : <span className="edit-photo-placeholder"><UserRound size={23} /></span>}
              <div><strong>Profile photo</strong><small>JPEG, PNG, or WebP · up to 4 MB</small><input ref={profileFileRef} className="visually-hidden-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleProfileFile} aria-label="Choose a profile photo" /><button type="button" onClick={() => profileFileRef.current?.click()}><Camera size={14} /> Choose photo</button></div>
            </div>
            <label className="edit-field"><span>{isPlumber ? "Full legal name" : "Your name"}</span><input autoComplete="name" required minLength={2} maxLength={120} value={draft.display_name} onChange={(event) => setDraft((current) => ({ ...current, display_name: event.target.value }))} placeholder={isPlumber ? "Name as shown on your ID" : "Your name"} /></label>
            <label className="edit-field"><span>Bio</span><textarea required={isPlumber} minLength={isPlumber ? 5 : undefined} maxLength={500} rows={3} value={draft.bio} onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))} placeholder={isPlumber ? "Describe your plumbing experience and the work you do…" : "A little about you…"} /><small>{draft.bio.length}/500</small></label>
            {isPlumber && <>
              <div className="edit-field-grid">
                <label className="edit-field"><span>County</span><input required minLength={2} maxLength={80} value={draft.service_county} onChange={(event) => setDraft((current) => ({ ...current, service_county: event.target.value }))} placeholder="e.g. Nairobi" /></label>
                <label className="edit-field"><span>Town / area you serve</span><input required minLength={2} maxLength={120} value={draft.service_location} onChange={(event) => setDraft((current) => ({ ...current, service_location: event.target.value }))} placeholder="e.g. Westlands" /></label>
              </div>
              <label className="edit-field"><span>Mobile number</span><input required type="tel" autoComplete="tel" inputMode="tel" value={draft.phone_number} onChange={(event) => setDraft((current) => ({ ...current, phone_number: event.target.value.replace(/[^\d+ ()-]/g, "") }))} placeholder="0712 345 678" /><small>Use a Kenyan number starting with 07 or 01. We’ll store it securely in the correct format.</small></label>
              <fieldset className="edit-field service-selection">
                <legend>Plumbing services offered</legend>
                <p>Select all the services you provide.</p>
                <div className="service-selection-options">
                  {plumbingServices.map((service) => (
                    <label key={service}>
                      <input type="checkbox" checked={draft.services_offered.includes(service)} onChange={(event) => setDraft((current) => ({ ...current, services_offered: event.target.checked ? [...current.services_offered, service] : current.services_offered.filter((item) => item !== service) }))} />
                      <span>{service}</span>
                    </label>
                  ))}
                </div>
                {!draft.services_offered.length && <small>Select at least one service.</small>}
              </fieldset>
              <label className="edit-field"><span>Years of experience</span><input required type="number" min={0} max={70} step={1} value={draft.years_experience} onChange={(event) => setDraft((current) => ({ ...current, years_experience: event.target.value }))} placeholder="e.g. 5" /></label>
              <div className="identity-upload-field">
                <span>Government ID for verification <b>*</b></span>
                <p>Upload a clear photo or PDF. Only Pipego admins can review this encrypted document.</p>
                <input ref={identityFileRef} className="visually-hidden-input" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleIdentityFile} aria-label="Choose government ID for verification" />
                <button className="identity-upload-button" type="button" onClick={() => identityFileRef.current?.click()}><FileCheck2 size={16} />{identityFilename || (profile.verification_document_uploaded ? "Replace uploaded ID" : "Choose identity document")}</button>
                <small>{identityFilename ? "Selected — save your profile to submit securely." : profile.verification_document_uploaded ? "An encrypted ID is already on file." : "JPEG, PNG, WebP, or PDF · up to 4 MB"}</small>
              </div>
            </>}
            <div className="edit-modal-actions"><button className="edit-cancel-button" type="button" onClick={() => setEditOpen(false)}>Cancel</button><button className="edit-save-button" type="submit" disabled={busy || (isPlumber && !draft.profile_image_data) || (isPlumber && !identityData && !profile.verification_document_uploaded)}>{busy ? "Saving…" : "Save profile"} <Check size={15} /></button></div>
          </form>
        </section>
      </div>}
    </main>
  );
}
