import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import { MockAiBanner } from "@/components/mock-ai-banner";
import { getMockAiStatus } from "@/lib/llm/mock-status";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pronto MVP",
  description: "Purpose-driven AI customer service agent operations console.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const mockAiStatus = getMockAiStatus();

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <MockAiBanner status={mockAiStatus} />
        {children}
      </body>
    </html>
  );
}
