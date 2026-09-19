export default function AgentsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Pistola agent manual</h1>
      <p className="mt-3 text-sm">
        Open <a href="/workspace">/workspace</a> and use <code>window.pistola</code> after the page
        sets <code>data-pistola-agent=&quot;ready&quot;</code>.
      </p>
      <p className="mt-4 text-sm">
        <a href="/agents/manual.json">manual.json</a> · <a href="/llms.txt">llms.txt</a>
      </p>
    </main>
  )
}
