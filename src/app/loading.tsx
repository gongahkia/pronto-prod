export default function LoadingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground lg:flex">
      <aside className="hidden h-screen w-[18rem] shrink-0 border-r border-sidebar-line bg-sidebar lg:block">
        <div className="space-y-3 p-4">
          <div className="h-8 w-32 rounded bg-sidebar-active" />
          <div className="h-8 rounded bg-sidebar-active/70" />
          <div className="h-8 rounded bg-sidebar-active/50" />
          <div className="h-8 rounded bg-sidebar-active/40" />
        </div>
      </aside>
      <main className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="mb-5 h-7 w-56 rounded bg-surface" />
        <div className="grid gap-4 md:grid-cols-4">
          <div className="h-24 rounded-lg bg-surface" />
          <div className="h-24 rounded-lg bg-surface" />
          <div className="h-24 rounded-lg bg-surface" />
          <div className="h-24 rounded-lg bg-surface" />
        </div>
        <div className="mt-6 h-96 rounded-lg bg-surface" />
      </main>
    </div>
  );
}
