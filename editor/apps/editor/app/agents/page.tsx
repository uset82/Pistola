export default function AgentsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-neutral-100">
      <h1 className="text-2xl font-semibold">Pistola agent manual</h1>
      <p className="mt-3 text-sm text-neutral-300">
        Open <a className="underline" href="/workspace">/workspace</a>, wait for{' '}
        <code>data-pistola-agent=&quot;ready&quot;</code>, then call <code>window.pistola</code>.
      </p>
      <ul className="mt-6 list-disc space-y-2 pl-5 text-sm">
        <li>
          <a className="underline" href="/agents/manual.json">
            /agents/manual.json
          </a>
        </li>
        <li>
          <a className="underline" href="/llms.txt">
            /llms.txt
          </a>
        </li>
      </ul>
    </main>
  )
}
