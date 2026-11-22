import type { Metadata, Viewport } from "next";
import { Geist_Mono, Noto_Sans_JP, Outfit } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const noto = Noto_Sans_JP({
  variable: "--font-noto",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

// 数字用: 細身の幾何学的な欧文書体
const outfit = Outfit({
  variable: "--font-outfit",
  weight: ["300", "400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "dietlog — 自炊も外食も記録できる食事記録", template: "%s | dietlog" },
  description:
    "自炊は食材・調理法から、外食・市販品は検索や手入力で記録。1日の目標に対する栄養素をゲージで確認できる食事記録アプリ(個人制作の非公式プロジェクト)。",
};

export const viewport: Viewport = {
  themeColor: "#f4f8fb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${noto.variable} ${outfit.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
