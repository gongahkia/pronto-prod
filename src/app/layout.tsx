import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pronto | Customer service, handled",
  description: "Manage customer conversations, business knowledge, and human handoffs in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
