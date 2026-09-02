const LABELS: Record<string, string> = {
  'product-demos': 'Product demos',
  'launch-videos': 'Launch videos',
  onboarding: 'Training / onboarding',
  'pitch-decks': 'Pitch decks',
  explainers: 'Explainers',
  'social-clips': 'Social clips',
  'investor-updates': 'Investor updates',
  founder: 'Founder',
  'product-manager': 'Product manager',
  marketer: 'Marketing / growth',
  designer: 'Designer',
  developer: 'Developer',
  'sales-success': 'Sales / success',
  'agency-freelancer': 'Agency / freelancer',
  'just-me': 'Just me',
  '1000-plus': '1,000+',
  '50-plus': '50+',
  google: 'Google',
  'x-twitter': 'X / Twitter',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  'friend-teammate': 'Friend / teammate',
  community: 'Community / event',
  other: 'Other',
}

const label = (value?: string) => (value ? (LABELS[value] ?? value) : 'Not completed')

export const OnboardingPanel = ({ users }: { users: any[] }) => {
  const responses = users.filter(user => user.onboardingSurvey)

  return (
    <div className="overflow-x-auto">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Onboarding responses</h2>
        <p className="text-xs text-gray-500 mt-1">
          {responses.length} of {users.length} users completed the survey.
        </p>
      </div>
      <table className="w-full min-w-[980px] text-xs">
        <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400">
          <tr>
            {['User', 'Creates', 'Role', 'Team', 'Videos / month', 'Found Pitch', 'Completed'].map(
              item => (
                <th key={item} className="px-4 py-3 text-left font-bold">
                  {item}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {users.map(user => {
            const survey = user.onboardingSurvey
            return (
              <tr key={user.id} className="border-t border-gray-50 text-gray-700">
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-900">
                    {`${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unnamed'}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{user.email}</p>
                </td>
                <td className="px-4 py-3">{label(survey?.creationGoal)}</td>
                <td className="px-4 py-3">{label(survey?.role)}</td>
                <td className="px-4 py-3">{label(survey?.teamSize)}</td>
                <td className="px-4 py-3">{label(survey?.monthlyVolume)}</td>
                <td className="px-4 py-3">{label(survey?.discoverySource)}</td>
                <td className="px-4 py-3 text-gray-400">
                  {survey ? new Date(survey.completedAt).toLocaleDateString() : 'Pending'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
