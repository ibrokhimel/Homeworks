import { useState } from "react";
import { readContext } from "./shared/context";
import {
  Pill,
  Eyebrow,
  FeatureCard,
  DarkSection,
  LaunchShell,
  LessonPanel,
  Button,
  Title,
  Lead,
} from "./shared/ui/primitives";

// F0 foundation screen — proves the scaffold + design-token bridge render.
// Replaced by <RuntimeBoot> + <V2FlowController> in F2.
export function App() {
  const ctx = readContext();
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"
  );

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
  };

  return (
    <main className="v2-shell" data-testid="v2-foundation">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <Pill tone="accent">NETS v2 · React runtime</Pill>
        <Button variant="outline" onClick={toggleTheme} aria-label="Toggle theme" style={{ height: 38, padding: "0 16px" }}>
          {theme === "light" ? "🌙 Dark" : "☀️ Light"}
        </Button>
      </div>

      <Eyebrow>Foundation</Eyebrow>
      <Title size="hero">The homework runtime, rebuilt.</Title>
      <Lead>
        React SPA scaffold is live. Design tokens bridge from the landing page. Boot context:{" "}
        <strong>hw={ctx.hwId ?? "—"}</strong>, flow_version=<strong>{ctx.flowVersion ?? "—"}</strong>.
      </Lead>

      <section style={{ display: "grid", gap: 16, marginTop: 36 }}>
        <Eyebrow>Learning Sections (preview of the Hub)</Eyebrow>
        <LessonPanel eyebrow="Tile A" title="Case Study" state="active" />
        <LessonPanel eyebrow="Tile B" title="Flashcards + Memory Check" state="idle" />
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 28 }}>
        <FeatureCard hover>
          <Eyebrow>Feature card</Eyebrow>
          <Title size="section">Correct path</Title>
          <Lead>Hover-lift + spring motion, dark-mode aware.</Lead>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <Pill tone="good">Passed</Pill>
            <Pill tone="warn">Needs Retry</Pill>
          </div>
        </FeatureCard>
        <DarkSection>
          <Eyebrow cyan>Dark section</Eyebrow>
          <Title size="section" inverse>
            Boss Arena vibe
          </Title>
          <Lead inverse>Glow + deep shadow, Why → How → What lives here.</Lead>
        </DarkSection>
      </section>

      <section style={{ marginTop: 28 }}>
        <LaunchShell>
          <Title size="section" inverse>
            Practice Arc Unlocked
          </Title>
          <Lead inverse>The Unlock Gate moment — chain-break animation lands here in F3.</Lead>
          <div style={{ marginTop: 20 }}>
            <Button variant="white">Enter Practice Arc →</Button>
          </div>
        </LaunchShell>
      </section>
    </main>
  );
}
