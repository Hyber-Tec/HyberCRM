import { renderToString } from 'react-dom/server'
import { APP_URL, COMPANY_NAME, PRODUCT_NAME, SENDER_EMAIL } from '@shared/brand'
import { FAQ, SITE } from './content'
import { LandingPage } from './LandingPage'

/** The landing page as HTML, for the built index.html (scripts/prerender.mjs). */
export function render() {
  return renderToString(<LandingPage />)
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Title, description, link previews and structured data for search engines. */
export function head() {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${APP_URL}/#organization`,
        name: COMPANY_NAME,
        url: `${APP_URL}/`,
        logo: `${APP_URL}/icons/icon-512.png`,
        email: SENDER_EMAIL,
        brand: { '@type': 'Brand', name: PRODUCT_NAME },
      },
      { '@type': 'WebSite', '@id': `${APP_URL}/#website`, name: PRODUCT_NAME, url: `${APP_URL}/`, publisher: { '@id': `${APP_URL}/#organization` }, inLanguage: 'en' },
      {
        '@type': 'SoftwareApplication',
        name: PRODUCT_NAME,
        url: `${APP_URL}/`,
        description: SITE.description,
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'CRM for tutoring centers',
        operatingSystem: 'Web, iOS, Android, Windows, macOS',
        image: SITE.image,
        publisher: { '@id': `${APP_URL}/#organization` },
        featureList: [
          'Drag-and-drop tutoring schedule with conflict detection',
          'Tutor availability',
          'Kiosk time clock with PINs',
          'Payroll with teaching and admin rates',
          'Session logs',
          'Progress reports for parents',
          'Portals for admins, tutors, parents and students',
          'Announcements',
          'Audit log',
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
    ],
  }
  return [
    `<title>${esc(SITE.title)}</title>`,
    `<meta name="description" content="${esc(SITE.description)}" />`,
    `<link rel="canonical" href="${SITE.url}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${PRODUCT_NAME}" />`,
    `<meta property="og:title" content="${esc(SITE.title)}" />`,
    `<meta property="og:description" content="${esc(SITE.description)}" />`,
    `<meta property="og:url" content="${SITE.url}" />`,
    `<meta property="og:image" content="${SITE.image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="Hyber CRM: the schedule, students and payroll of a tutoring center" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(SITE.title)}" />`,
    `<meta name="twitter:description" content="${esc(SITE.description)}" />`,
    `<meta name="twitter:image" content="${SITE.image}" />`,
    `<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>`,
  ].join('\n    ')
}
