import { SignUp } from "@clerk/nextjs";
import { demoMode } from "@/lib/server/demo";

export default function SignUpPage() {
  return (
    <div className="flex justify-center px-6 py-12">
      {demoMode() ? <p className="font-ui text-caption text-muted">The Clerk sign-up form appears here.</p> : <SignUp />}
    </div>
  );
}
