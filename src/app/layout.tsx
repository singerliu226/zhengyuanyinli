import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "正缘引力 — 测出你的恋爱城市",
  description: "25道题测出你的恋爱人格，找到最适合你谈恋爱的城市，解锁你的理想型画像。",
  keywords: "恋爱测试,性格测试,城市匹配,理想型,恋爱人格",
  openGraph: {
    title: "正缘引力 — 你的恋爱，应该发生在哪座城市？",
    description: "25道题测出你的恋爱人格 × 城市匹配 × 理想型画像",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
