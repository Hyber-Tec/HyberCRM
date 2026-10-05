/**
 * The live demo's weekly news (Mondays): what a center's admin posts for the tutors. One post a week, in turn, so
 * the feed keeps moving. HTML in the editor's style (paragraphs, lists, bold and italics); nothing here claims a
 * schedule change that didn't happen.
 */
export interface DemoPost {
  title: string
  category: string
  contentHtml: string
  commentsEnabled: boolean
}

export const DEMO_WEEKLY_POSTS: readonly DemoPost[] = [
  {
    title: 'Staff meeting today at 2:00 PM',
    category: 'General',
    contentHtml:
      '<p>Our weekly staff meeting is today at <strong>2:00 PM</strong>, before sessions start.</p><ul><li>Upcoming test dates</li><li>New students this week</li><li>Anything you’d like to raise</li></ul><p>Leave a comment if you have a topic.</p>',
    commentsEnabled: true,
  },
  {
    title: 'Reminder: session logs on the same day',
    category: 'Reminders',
    contentHtml:
      '<p>Please submit each <strong>session log</strong> before you leave for the day. Parents read the progress reports built from them, so the details matter:</p><ul><li>What you covered and how it went</li><li>The homework you gave</li><li>One thing to focus on next time</li></ul><p>Thank you!</p>',
    commentsEnabled: false,
  },
  {
    title: 'SAT practice test this Saturday',
    category: 'Updates',
    contentHtml:
      '<p>We’re running a full-length <strong>SAT practice test</strong> this Saturday from 9:00 AM to 1:00 PM. Please mention it to your SAT students and let the front desk know who’s coming by Thursday.</p>',
    commentsEnabled: false,
  },
  {
    title: 'Midterm season is here',
    category: 'General',
    contentHtml:
      '<p>Most of our students have midterms in the next two weeks. Ask about upcoming tests at the start of each session and adjust the plan when they need review time.</p><p>If a student needs an extra session, let me know and I’ll find a slot.</p>',
    commentsEnabled: true,
  },
  {
    title: 'Please keep your availability up to date',
    category: 'Reminders',
    contentHtml:
      '<p>Families are booking ahead, and we can only schedule what’s on your calendar. Please make sure your <strong>availability</strong> is set for the next four weeks.</p><p>The next 7 days are locked: message me if something changes there.</p>',
    commentsEnabled: false,
  },
  {
    title: 'New ACT Science practice packets',
    category: 'Updates',
    contentHtml:
      '<p>New <em>ACT Science</em> practice packets are on the shelf by the front desk (blue folders). Each has three passages with answer explanations: great for warm-ups or homework.</p>',
    commentsEnabled: false,
  },
  {
    title: 'Clock in before your first session',
    category: 'Reminders',
    contentHtml:
      '<p>A friendly reminder to clock in at the front desk <strong>before</strong> your first session and to clock out when you leave. If you forget, send me the times and I’ll fix your time entry.</p>',
    commentsEnabled: false,
  },
  {
    title: 'Welcome to our new students',
    category: 'General',
    contentHtml:
      '<p>Several new families are starting this month. When you see a new name on your schedule, read the student’s learning notes before the first session, and tell me afterwards how it went.</p>',
    commentsEnabled: true,
  },
  {
    title: 'Parent conferences coming up',
    category: 'General',
    contentHtml:
      '<p>A few students are due for a <strong>parent conference</strong>. I’ll contact the families; please make your next session logs for them especially specific, so we have concrete progress to share.</p>',
    commentsEnabled: false,
  },
  {
    title: 'Tips for keeping students engaged',
    category: 'Updates',
    contentHtml:
      '<p>A few ideas from last week’s staff meeting:</p><ol><li>Start with a quick win: one problem the student can solve.</li><li>Ask them to explain a step back to you.</li><li>End by writing the next goal together.</li></ol><p>Share what works for you in the comments.</p>',
    commentsEnabled: true,
  },
  {
    title: 'Great work on last month’s progress reports',
    category: 'General',
    contentHtml:
      '<p>Thank you, everyone: last month’s progress reports went out on time, and several parents wrote back to say how helpful they were. Keep the detailed notes coming!</p>',
    commentsEnabled: true,
  },
  {
    title: 'Supplies restocked',
    category: 'General',
    contentHtml:
      '<p>The supply cabinet is restocked: pencils, graph paper, calculators and highlighters. There are snacks in the kitchen for the long evening blocks, so help yourselves.</p>',
    commentsEnabled: false,
  },
]
