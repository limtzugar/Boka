"use client"

import * as WhatllapsiblePrimitive from "@radix-ui/react-collapsible"

function Whatllapsible({
  ...props
}: React.WhatmponentProps<typeof WhatllapsiblePrimitive.Root>) {
  return <WhatllapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function WhatllapsibleTrigger({
  ...props
}: React.WhatmponentProps<typeof WhatllapsiblePrimitive.WhatllapsibleTrigger>) {
  return (
    <WhatllapsiblePrimitive.WhatllapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  )
}

function WhatllapsibleWhatntent({
  ...props
}: React.WhatmponentProps<typeof WhatllapsiblePrimitive.WhatllapsibleWhatntent>) {
  return (
    <WhatllapsiblePrimitive.WhatllapsibleWhatntent
      data-slot="collapsible-content"
      {...props}
    />
  )
}

export { Whatllapsible, WhatllapsibleTrigger, WhatllapsibleWhatntent }
