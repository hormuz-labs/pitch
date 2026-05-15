interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  createdAt: string;
  creditsRemaining: number;
  creditsBought: number;
}

export function UsersTable({ users, onSelectUser }: { users: User[], onSelectUser: (id: string) => void }) {
  if (!users || users.length === 0) {
    return <div className="p-8 text-center text-gray-500 text-sm">No users found.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-5 py-3 font-medium">User</th>
            <th className="px-5 py-3 font-medium">Joined</th>
            <th className="px-5 py-3 font-medium text-right">Credits Remaining</th>
            <th className="px-5 py-3 font-medium text-right">Credits Bought</th>
            <th className="px-5 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {users.map(user => (
            <tr key={user.id} className="hover:bg-gray-50/50 transition-colors group">
              <td className="px-5 py-3">
                <div className="font-medium text-gray-900">{user.firstName || ''} {user.lastName || ''}</div>
                <div className="text-gray-500 text-xs mt-0.5">{user.email}</div>
              </td>
              <td className="px-5 py-3 text-gray-500">
                {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </td>
              <td className="px-5 py-3 text-right">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                  {user.creditsRemaining}
                </span>
              </td>
              <td className="px-5 py-3 text-right text-gray-900 font-medium">
                {user.creditsBought}
              </td>
              <td className="px-5 py-3 text-right">
                <button
                  onClick={() => onSelectUser(user.id)}
                  className="text-xs font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 rounded-md px-3 py-1.5 transition-colors"
                >
                  View Jobs
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
