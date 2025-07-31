import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [],
  footer: Component.Footer({
    links: {
      Mastodon: "https://fosstodon.org/@ianthetechie",
      LinkedIn: "https://www.linkedin.com/in/ian-w-wagner/",
      BlueSky: "https://bsky.app/profile/ianwwagner.com",
      GitHub: "https://github.com/ianthetechie",
      RSS: "/index.xml",
    },
  }),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.Breadcrumbs(),
    Component.ArticleTitle(),
    Component.ContentMeta(),
    Component.TagList(),
  ],
  afterBody: [Component.RecentNotes({ title: "Recent", showTags: false, limit: 5 })],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Search(),
    Component.Darkmode(),
    Component.DesktopOnly(
      Component.Explorer({
        title: "Navigation",
        sortFn: (a, b) => {
          if ((!a.file && !b.file) || (a.file && b.file)) {
            // sensitivity: "base": Only strings that differ in base letters compare as unequal. Examples: a ≠ b, a = á, a = A
            // numeric: true: Whether numeric collation should be used, such that "1" < "2" < "10"
            const modTimeA = a.file?.dates?.created.getTime()
            const modTimeB = b.file?.dates?.created.getTime()
            console.log(modTimeA, modTimeB)
            if (modTimeA && modTimeB) {
              return modTimeB - modTimeA
            } else {
              return a.displayName.localeCompare(b.displayName, undefined, {
                numeric: true,
                sensitivity: "base",
              })
            }
          }
          if (a.file && !b.file) {
            return 1
          } else {
            return -1
          }
        },
      }),
    ),
  ],
  right: [
    Component.Graph(),
    Component.DesktopOnly(Component.TableOfContents()),
    Component.Backlinks(),
  ],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [Component.Breadcrumbs(), Component.ArticleTitle(), Component.ContentMeta()],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Search(),
    Component.Darkmode(),
    Component.DesktopOnly(Component.Explorer({ title: "Navigation" })),
  ],
  right: [],
}
