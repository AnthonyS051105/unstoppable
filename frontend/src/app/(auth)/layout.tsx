import { Brand, LinkBtn } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-bg">
      <LinkBtn label="Kembali" route="landing" kind="auth-link sm" icon="chevron-left" />
      <main id="main" className="auth-card">
        <Brand />
        {children}
      </main>
    </div>
  );
}
