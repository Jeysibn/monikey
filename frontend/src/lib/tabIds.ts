/** The ids that tie a tab to its panel (aria-controls / aria-labelledby). Shared by `Tabs` and the page that owns the panels. */
export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`
export const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`
