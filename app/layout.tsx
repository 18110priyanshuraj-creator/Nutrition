import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MyNutri AI — Personal Nutrition Tracker",
  description: "A personal food and nutrient journal with editable estimates.",
  applicationName: "MyNutri AI"
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f4f7f1" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}