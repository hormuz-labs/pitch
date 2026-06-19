import * as SwitchPrimitives from '@radix-ui/react-switch'
import { HiMiniMoon, HiMiniSun } from 'react-icons/hi2'

export const ThemeSwitch = ({
  checked,
  onCheckedChange,
}: {
  checked: boolean
  onCheckedChange: (c: boolean) => void
}) => {
  return (
    <div className="relative inline-grid h-8 w-14 grid-cols-[1fr_1fr] items-center text-sm font-medium bg-gray-100 rounded-lg border border-gray-200">
      <SwitchPrimitives.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="peer absolute inset-0 flex items-center h-full w-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
        aria-label="Toggle theme"
      >
        <SwitchPrimitives.Thumb className="block h-6 w-6 ml-[3px] rounded-md bg-white shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=checked]:translate-x-[24px] data-[state=unchecked]:translate-x-0" />
      </SwitchPrimitives.Root>

      <span className="pointer-events-none relative z-10 flex items-center justify-center text-gray-900 peer-data-[state=checked]:text-gray-400 transition-colors">
        <HiMiniSun className="w-4 h-4" />
      </span>

      <span className="pointer-events-none relative z-10 flex items-center justify-center text-gray-400 peer-data-[state=checked]:text-gray-900 transition-colors">
        <HiMiniMoon className="w-4 h-4" />
      </span>
    </div>
  )
}
