import { ReportDocument } from '@/features/reports/ReportDocument'
import { sampleReport } from './sampleReport'

const { report, timezone } = sampleReport()

/** The sample center's latest report, as families see it (loaded when its section comes near). */
export default function SampleReport() {
  return <ReportDocument report={report} audience="family" timezone={timezone} logoUrl="/brand/hybercrm-logo.svg" />
}
