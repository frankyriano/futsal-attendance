import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FUTSAL NOTE | フットサル出席管理",
  description:
    "いつもの仲間と、次のフットサルへ。開催日・出欠・連れの参加人数をかんたんに管理。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
