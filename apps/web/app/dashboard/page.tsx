import Link from "next/link";
import { Droplets } from "lucide-react";
import "./dashboard.css";

export default function DashboardPage() {
  return (
    <main className="dashboard-shell">
      <section className="live-dashboard-empty" aria-labelledby="dashboard-title">
        <Link className="dashboard-brand" href="/" aria-label="Pipego home">
          <span className="dashboard-brand-mark"><Droplets size={18} strokeWidth={2.4} /></span>
          <span>pipego<span className="dashboard-brand-period">.</span></span>
        </Link>
        <div className="live-dashboard-message">
          <span className="live-dashboard-kicker">PIPEGO WORKSPACE</span>
          <h1 id="dashboard-title">Live dashboard data is not available yet</h1>
          <p>
            This dashboard will show real accounts and marketplace activity when the admin analytics API is connected.
            Plumbers can create an account, complete their profile, and go online to appear in customer search.
          </p>
          <Link className="live-dashboard-link" href="/">Return to the marketplace</Link>
        </div>
      </section>
    </main>
  );
}
