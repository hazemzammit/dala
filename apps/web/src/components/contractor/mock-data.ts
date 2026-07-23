export const dashboardStats = [
  {
    label: 'Active Projects',
    value: '24',
    delta: '+3 this week',
    tone: 'success' as const,
    footnote: '5 projects are ahead of schedule.',
  },
  {
    label: 'Workers Present Today',
    value: '86',
    delta: '94% check-in rate',
    tone: 'success' as const,
    footnote: 'Attendance captured by dispatch.',
  },
  {
    label: 'Vehicles Available',
    value: '12',
    delta: '2 in maintenance',
    tone: 'warning' as const,
    footnote: 'No capacity risk for today.',
  },
  {
    label: "Today's Expenses",
    value: '18,450 TND',
    delta: '+8%',
    tone: 'danger' as const,
    footnote: 'Fuel and materials drove spend.',
  },
  {
    label: 'Monthly Revenue',
    value: '246,800 TND',
    delta: '+14%',
    tone: 'success' as const,
    footnote: 'Four invoices marked paid.',
  },
  {
    label: 'Budget Consumption',
    value: '68%',
    delta: 'On track',
    tone: 'warning' as const,
    footnote: 'Three projects need review.',
  },
];

export const weeklyCashflow = [38, 52, 46, 68, 58, 74, 62];
export const weeklyCashflowLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const recentActivities = [
  {
    title: 'Dispatch assigned to Site 4',
    description: '3 workers and 1 pickup were scheduled for the morning shift.',
    time: '08:15',
    tone: 'accent' as const,
  },
  {
    title: 'Invoice paid by client',
    description: 'El Baraka Residence settled the latest progress invoice.',
    time: '10:05',
    tone: 'success' as const,
  },
  {
    title: 'Maintenance warning',
    description: 'Vehicle TN 1432 requires service within the next 300 km.',
    time: '11:20',
    tone: 'warning' as const,
  },
  {
    title: 'Safety observation logged',
    description: 'New PPE reminder added for concrete pouring zone.',
    time: '13:40',
    tone: 'danger' as const,
  },
];

export const weeklyCalendar = [
  { day: 'Mon', label: 'Project handover at 9:00', tone: 'accent' as const },
  { day: 'Tue', label: 'Team briefing and toolbox talk', tone: 'success' as const },
  { day: 'Wed', label: 'Material delivery window', tone: 'warning' as const },
  { day: 'Thu', label: 'Client walkthrough', tone: 'accent' as const },
  { day: 'Fri', label: 'Billing review', tone: 'success' as const },
  { day: 'Sat', label: 'Site inspection', tone: 'warning' as const },
  { day: 'Sun', label: 'Light crew shift', tone: 'accent' as const },
];

export const quickActions = [
  'Create project',
  'Assign dispatch',
  'Add vehicle',
  'Invite worker',
  'Log expense',
  'Generate report',
];
