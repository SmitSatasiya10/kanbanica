"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { TabGroup, Tab, TabPanel } from "@headlessui/react"

import { cn } from "@/lib/utils"

type TabsContextValue = {
  orientation: "horizontal" | "vertical"
  registerValue: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabsContext(component: string) {
  const context = React.useContext(TabsContext)
  if (!context) {
    throw new Error(`${component} must be used within <Tabs>`)
  }
  return context
}

function Tabs({
  className,
  orientation = "horizontal",
  value: valueProp,
  defaultValue,
  onValueChange,
  ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> & {
  orientation?: "horizontal" | "vertical"
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}) {
  const [internalValue, setInternalValue] = React.useState(defaultValue)
  const value = valueProp ?? internalValue

  const setValue = React.useCallback(
    (next: string) => {
      if (valueProp === undefined) setInternalValue(next)
      onValueChange?.(next)
    },
    [valueProp, onValueChange]
  )

  // Headless UI's <TabGroup> selects by index, but the public API here is
  // value-based (matching the previous radix-style API) — this ordered list
  // bridges the two. Children register in a layout effect (before the
  // browser paints, bottom-up so registration order matches DOM order), and
  // that effect's setState is what triggers Tabs' re-render — never a
  // setState call made directly from within a child's render, which React
  // (rightly) flags as "updating a component while rendering a different
  // component".
  const valuesRef = React.useRef<string[]>([])
  const [registeredCount, setRegisteredCount] = React.useState(0)
  const registerValue = React.useCallback((v: string) => {
    if (!valuesRef.current.includes(v)) {
      valuesRef.current.push(v)
      setRegisteredCount((c) => c + 1)
    }
  }, [])
  void registeredCount

  const selectedIndex = value !== undefined ? valuesRef.current.indexOf(value) : -1

  return (
    <TabsContext.Provider value={{ orientation, registerValue }}>
      <TabGroup
        as="div"
        data-slot="tabs"
        data-orientation={orientation}
        vertical={orientation === "vertical"}
        selectedIndex={selectedIndex === -1 ? 0 : selectedIndex}
        onChange={(index) => {
          const next = valuesRef.current[index]
          if (next !== undefined) setValue(next)
        }}
        className={cn("group/tabs flex gap-2 data-horizontal:flex-col", className)}
        {...props}
      />
    </TabsContext.Provider>
  )
}

const tabsListVariants = cva(
  "tabs group/tabs-list inline-flex w-fit items-center justify-center p-1 text-base-content/60 group-data-horizontal/tabs:h-10 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "bg-base-200",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof tabsListVariants>) {
  const { orientation } = useTabsContext("TabsList")

  return (
    <div
      data-slot="tabs-list"
      data-variant={variant}
      role="tablist"
      aria-orientation={orientation}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  value,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const { registerValue } = useTabsContext("TabsTrigger")

  // useLayoutEffect (not useEffect): fires before the browser paints, so
  // Tabs' resulting re-render (with the now-complete value list) commits
  // before anything is shown — no flash of the wrong tab selected on mount.
  React.useLayoutEffect(() => {
    registerValue(value)
  }, [registerValue, value])

  return (
    <Tab as={React.Fragment} disabled={disabled}>
      {({ selected }) => (
        <button
          type="button"
          data-slot="tabs-trigger"
          data-active={selected ? "" : undefined}
          className={cn(
            "tab h-[calc(100%-1px)] flex-1 gap-2 border px-4 py-1.5 text-xs font-semibold tracking-wider whitespace-nowrap text-base-content/60 uppercase transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start group-data-vertical/tabs:px-4 group-data-vertical/tabs:py-2 hover:text-base-content focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 dark:text-base-content/60 dark:hover:text-base-content [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
            "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
            "data-active:bg-base-100 data-active:text-base-content dark:data-active:border-base-300 dark:data-active:bg-base-300/30 dark:data-active:text-base-content",
            "after:absolute after:bg-base-content after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
            className
          )}
          {...props}
        />
      )}
    </Tab>
  )
}

function TabsContent({
  className,
  value,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  value: string
  /** false keeps inactive panels mounted (hidden) so their state survives tab switches. */
  unmount?: boolean
}) {
  const { registerValue } = useTabsContext("TabsContent")
  React.useLayoutEffect(() => {
    registerValue(value)
  }, [registerValue, value])

  return (
    <TabPanel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
