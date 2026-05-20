import { TopNav } from "@/components/top-nav";
import { RecipesDevTools } from "@/components/recipes-dev-tools";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
      <RecipesDevTools />
    </div>
  );
}
