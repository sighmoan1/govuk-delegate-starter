import type { Metadata } from "next";

export const metadata: Metadata = { title: "You need to start again" };

export default function Expired() {
  return (
    <div className="ol-narrow">
      <h1>You need to start again</h1>
      <p>Your sign-in timed out or could not be found. Go back to the service you were using and sign in again.</p>
    </div>
  );
}
