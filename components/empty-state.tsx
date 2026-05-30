export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#424754] bg-[#1a1a1a] px-6 py-12 text-center">
      <div className="text-3xl mb-3 opacity-30">□</div>
      <h2 className="text-sm font-semibold text-[#e1e2ec]">{title}</h2>
      <p className="mt-1.5 text-xs text-[#8c909f] max-w-xs mx-auto">{detail}</p>
    </div>
  );
}

