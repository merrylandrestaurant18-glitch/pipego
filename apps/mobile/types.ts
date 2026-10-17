export type User = {
  id: string;
  email: string;
  role: "customer" | "plumber" | "company" | "admin";
};

export type Booking = {
  id: string;
  provider_id: string | null;
  category: string;
  description: string;
  status: string;
  latitude: number;
  longitude: number;
  offer_expires_at: string | null;
};
