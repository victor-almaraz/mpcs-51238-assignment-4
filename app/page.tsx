// Entry (app-flow.md, "Route map"): /dashboard when signed in, otherwise /sign-in.
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function Entry() {
  const { userId } = await auth();
  redirect(userId ? "/dashboard" : "/sign-in");
}
