"use client";
// Email, password, and sign-in methods (app-flow.md, Settings): Clerk's account panel, opened as its own
// dialog at the size it is laid out for. Its Delete account section is hidden: Cadmium's own, at the end
// of Settings, takes the account through its 30-day recovery stage.
import { useClerk } from "@clerk/nextjs";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ICON_DENSE } from "@/components/ui/icon-button";

export function SignInMethods() {
  const clerk = useClerk();
  return (
    <Button type="button" icon={<KeyRound {...ICON_DENSE} />} onClick={() => clerk.openUserProfile({ appearance: { elements: { profileSection__danger: { display: "none" } } } })}>
      Email and sign-in
    </Button>
  );
}
