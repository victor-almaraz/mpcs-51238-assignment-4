// Entry (app-flow.md, "Route map"): /dashboard when signed in, otherwise /sign-in.
import { signedInId } from "@/lib/server/auth";
import { demoMode } from "@/lib/server/demo";
import { DemoIndex } from "./demo-index";
import { redirect } from "next/navigation";

export default async function Entry() {
  if (demoMode()) return <DemoIndex />;
  const userId = await signedInId();
  redirect(userId ? "/dashboard" : "/sign-in");
}
