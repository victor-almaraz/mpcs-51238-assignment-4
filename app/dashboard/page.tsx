// Dashboard shell (app-flow.md, "Dashboard"; build order step 1: a new user sees an empty dashboard).
// Sections fill in as their operations land: sessions (sprint 18), instances and campaigns
// (sprint 12), characters (sprint 11).
import { currentUser } from "@clerk/nextjs/server";

const SECTIONS = [
  { title: "Upcoming sessions", empty: "No sessions scheduled." },
  { title: "Active instances", empty: "No instances in progress." },
  { title: "Campaigns", empty: "No campaigns yet." },
  { title: "Characters", empty: "No characters yet." },
];

export default async function Dashboard() {
  const user = await currentUser();
  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <h1 className="font-display text-title">{user?.firstName ? `${user.firstName}'s dashboard` : "Dashboard"}</h1>
      {SECTIONS.map((s) => (
        <section key={s.title} className="mt-8">
          <h2 className="font-display text-heading">{s.title}</h2>
          <p className="mt-2 text-muted">{s.empty}</p>
        </section>
      ))}
    </div>
  );
}
