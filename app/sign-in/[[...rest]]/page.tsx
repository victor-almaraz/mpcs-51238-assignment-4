// Sign in: Clerk's form, which carries the page's heading, centred under the top bar. Demo mode
// has no Clerk, so a placeholder card stands in.
import { SignIn } from "@clerk/nextjs";
import { LogIn } from "lucide-react";
import { ICON } from "@/components/ui/icon-button";
import { Standalone } from "@/components/ui/standalone";
import { demoMode } from "@/lib/server/demo";

export default function SignInPage() {
  if (demoMode()) return <Standalone icon={<LogIn {...ICON} />} title="Sign in" description="The Clerk sign-in form appears here." />;
  return (
    <div className="flex justify-center px-4 py-10 sm:px-6 sm:py-16">
      <SignIn />
    </div>
  );
}
