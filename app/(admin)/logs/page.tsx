import { ComingSoon } from "@/components/ComingSoon"

export const metadata = { title: "Logs" }

export default function LogsPage() {
  return (
    <ComingSoon
      title="Logs"
      description="One stream for every app you've shipped — client sites, portals, demos. Each app will POST its errors and events to an ingest endpoint here, tagged by client and severity."
    />
  )
}
