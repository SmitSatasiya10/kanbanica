"use client";

import type * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface LimitsTab {
  content: React.ReactNode;
  /** Short subtitle shown under the label. */
  description: string;
  label: string;
  value: string;
}

interface LimitsTabsProps {
  /** Add a new limit category (e.g. Storage) by appending an entry here. */
  tabs: LimitsTab[];
}

export function LimitsTabs({ tabs }: LimitsTabsProps) {
  return (
    <Tabs className="gap-6" defaultValue={tabs[0]?.value}>
      <TabsList
        className="grid h-auto w-full gap-2 bg-transparent p-0 group-data-horizontal/tabs:h-auto"
        style={{
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
        }}
      >
        {tabs.map((tab) => (
          <TabsTrigger
            className="h-auto flex-col items-start gap-0.5 rounded-xl border-base-300 bg-base-200/40 px-4 py-3 text-left normal-case tracking-normal hover:bg-base-200 data-active:border-primary data-active:bg-elevated data-active:shadow-sm"
            key={tab.value}
            value={tab.value}
          >
            <span className="font-semibold text-sm text-base-content">
              {tab.label}
            </span>
            <span className="font-normal text-base-content/60 text-xs">
              {tab.description}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        // Panels stay mounted (hidden) so unsaved form edits survive a switch.
        <TabsContent key={tab.value} unmount={false} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
