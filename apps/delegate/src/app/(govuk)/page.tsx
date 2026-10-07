import { redirect } from "next/navigation";

// GOV.UK Delegate is not a destination: people meet it in a consent screen,
// and manage it in their GOV.UK account.
export default function Root() {
  redirect("/account/delegates");
}
