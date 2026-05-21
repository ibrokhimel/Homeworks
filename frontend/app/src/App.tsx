import { RuntimeBoot } from "./runtime/RuntimeBoot";

// v2 runtime entrypoint. Boots from the redacted hydration API + gate-state,
// then renders the store-driven flow (Learning Hub → Case-Based Preview → …).
export function App() {
  return <RuntimeBoot />;
}
