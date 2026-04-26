import Head from 'next/head'

export function PageHead({ title = 'OMH Tracker' }) {
  return (
    <Head>
      <title>{title}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    </Head>
  )
}

export function Layout({ children, title }) {
  return (
    <div className="min-h-screen bg-[#f7f2ec] text-[#333333]">
      <PageHead title={title} />
      <header className="bg-[#61856c] px-6 py-4 flex items-center justify-between">
        <span className="text-sm font-semibold tracking-wide text-white">
          OMH Tracker
        </span>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}

export function Card({ children, className = '' }) {
  return (
    <div className={`rounded-lg border border-[#e8e0d5] bg-white p-4 ${className}`}>
      {children}
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#e8e0d5] border-t-[#61856c]" />
    </div>
  )
}
