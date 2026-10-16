import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { IMAGES } from "@/assets/images";
import { Providers } from "./providers";
import "./globals.css";

const inter = localFont({
  src: "../assets/fonts/InterVariable.latin.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Unstoppable | Sampai dengan Selamat", template: "%s | Unstoppable" },
  description: "Unstoppable, navigasi dan pendampingan lansia serta pemantauan perjalanan oleh keluarga.",
  icons: { icon: { url: IMAGES.favicon, type: "image/png" }, apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180" } },
  // iPhone only delivers Web Push to apps added to the Home Screen (iOS 16.4+).
  appleWebApp: { capable: true, title: "Unstoppable", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#FFC629",
};

const restoreDisplayPrefs = `try{var s=JSON.parse(localStorage.getItem('unstoppable-demo-v1')||'{}');if(s.large)document.body.classList.add('large-text');if(s.contrast)document.body.classList.add('high-contrast')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={inter.variable}>
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: restoreDisplayPrefs }} />
        <Providers>
          <div id="app">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
