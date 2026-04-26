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
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <PageHead title={title} />
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
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
    <div className={`rounded-lg border border-gray-800 bg-gray-900 p-4 ${className}`}>
      {children}
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
    </div>
  )
}
