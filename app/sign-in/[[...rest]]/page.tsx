import { SignIn } from "@clerk/nextjs";
import { demoMode } from "@/lib/server/demo";

export default function SignInPage() {
  return (
    <div className="flex justify-center px-6 py-12">
      {demoMode() ? <p className="font-ui text-caption text-muted">The Clerk sign-in form appears here.</p> : <SignIn />}
    </div>
  );
}
