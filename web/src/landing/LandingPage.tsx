import { Pricing } from './contact'
import { DemoProvider } from './demo'
import { Features, Marquee } from './features'
import { Hero, Nav } from './hero'
import { ReportShowcase } from './report'
import { Bento, Faq, FinalCta, Footer, Portals } from './sections'

/** hybercrm.com: the sales page, with the live demo at the top. */
export function LandingPage() {
  return (
    <DemoProvider>
      <Nav />
      {/* Glows may spill past the edges; clip (not hidden) keeps the sticky sections working. */}
      <main className="overflow-x-clip">
        <Hero />
        <Marquee />
        <Features />
        <ReportShowcase />
        <Portals />
        <Bento />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </DemoProvider>
  )
}
