import LoadingMark from '@/components/ui/LoadingMark'

export default function ChatLoading() {
  return (
    <main className="fixed inset-0 grid place-items-center bg-white dark:bg-carbon-950">
      <LoadingMark size={48} />
    </main>
  )
}
