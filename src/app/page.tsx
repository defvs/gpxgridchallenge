import { SignedIn, SignedOut } from "@clerk/nextjs";

import Dashboard from "../components/dashboard/dashboard";
import SignedOutLanding from "../components/dashboard/signed-out-landing";

export default function Home() {
  return (
    <main className="min-h-screen w-full">
      <SignedIn>
        <Dashboard />
      </SignedIn>
      <SignedOut>
        <SignedOutLanding />
      </SignedOut>
    </main>
  );
}
