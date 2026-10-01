/** Topic taxonomies for structured session types (public test frameworks). */
export const SAT_PSAT_TOPICS: Record<string, Record<string, string[]>> = {
  'Reading & Writing': {
    'Information and Ideas': ['Central Ideas and Details', 'Inferences', 'Command of Evidence'],
    'Craft and Structure': ['Words in Context', 'Text Structure and Purpose', 'Cross-Text Connections'],
    'Expression of Ideas': ['Rhetorical Synthesis', 'Transitions'],
    'Standard English Conventions': ['Boundaries', 'Form, Structure, and Sense'],
  },
  Math: {
    Algebra: [
      'Linear equations in one variable',
      'Linear equations in two variables',
      'Linear functions',
      'Systems of two linear equations in two variables',
      'Linear inequalities in one or two variables',
    ],
    'Advanced Math': ['Equivalent expressions', 'Nonlinear equations in one variable and systems', 'Nonlinear functions'],
    'Problem-Solving and Data Analysis': [
      'Ratios, rates, proportional relationships, and units',
      'Percentages',
      'One-variable data: Distributions & measures',
      'Two-variable data: Models and scatterplots',
      'Probability and conditional probability',
      'Inference from sample statistics and margin of error',
      'Evaluating statistical claims',
    ],
    'Geometry and Trigonometry': ['Area and volume', 'Lines, angles, and triangles', 'Right triangles and trigonometry', 'Circles'],
  },
}

export const ACT_TOPICS: Record<string, string[]> = {
  English: ['Production of Writing', 'Knowledge of Language', 'Conventions of Standard English'],
  Math: ['Number & Quantity', 'Algebra', 'Functions', 'Geometry', 'Statistics & Probability', 'Integrating Essential Skills'],
  Reading: ['Key Ideas & Details', 'Craft & Structure', 'Integration of Knowledge & Ideas'],
  Science: ['Interpretation of Data', 'Scientific Investigation', 'Evaluation of Models', 'Inferences & Experimental Results'],
}

export function topicKind(sessionType: string): 'sat' | 'act' | 'free' {
  if (sessionType === 'SAT' || sessionType === 'PSAT') return 'sat'
  if (sessionType === 'ACT') return 'act'
  return 'free'
}
